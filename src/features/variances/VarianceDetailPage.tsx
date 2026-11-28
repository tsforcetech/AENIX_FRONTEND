import { getRouteApi, Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Camera, Clock3, Save, Send, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { Attachment, Variance, VarianceOutcome } from '@/domain/types';
import { toAttachment } from '@/features/work-orders/api';
import { AttachmentChip } from '@/shared/ui/Attachment';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDateTime } from '@/shared/utils/format';
import { useVariance, useVarianceAction, VARIANCE_OUTCOMES, type VarianceRow } from './api';

const route = getRouteApi('/_app/variances/$id');

const outcomeHelp: Record<VarianceOutcome, string> = {
  'Accept as is': 'No claim — the difference is accepted and closed.',
  'Customer claim': 'The customer is compensated; finance raises the credit note.',
  'Vendor debit note': 'The vendor is charged: a draft debit note is created for the value.',
  'Carrier / insurer claim': 'Claim lodged with the carrier or insurer outside the system.',
  'Write-off': 'The loss is written off and the variance resolved.',
};

export function VarianceDetailPage() {
  const { id } = route.useParams();
  const { data, isLoading, error } = useVariance(id);
  if (error) return <StatusMessage kind="error" title="Variance not found" />;
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading variance…" />;
  return <VarianceForm key={`${data.id}-${data.status}`} v={data} />;
}

type DraftLine = { sku: string; expected: string; actual: string; damaged: string; remarks: string };

function VarianceForm({ v }: { v: VarianceRow }) {
  const action = useVarianceAction();
  const toast = useToast();
  const photoId = useId();
  const editable = v.status === 'Open';
  const [lines, setLines] = useState<DraftLine[]>(() =>
    v.lines.map((l) => ({
      sku: l.sku,
      expected: String(l.expected),
      actual: String(l.actual),
      damaged: String(l.damaged),
      remarks: l.remarks ?? '',
    })),
  );
  const [photos, setPhotos] = useState<Attachment[]>(v.photos);
  const [outcome, setOutcome] = useState<string>(v.outcome ?? '');
  const [value, setValue] = useState(v.value !== undefined ? String(v.value) : '');
  const [formError, setFormError] = useState<string>();

  const set = (i: number, k: keyof DraftLine, val: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: val } : l)));

  const patch = () => ({
    lines: lines.map((l) => ({
      sku: l.sku,
      expected: Number(l.expected) || 0,
      actual: Number(l.actual) || 0,
      damaged: Number(l.damaged) || 0,
      remarks: l.remarks.trim() || undefined,
    })) satisfies Variance['lines'],
    photos,
    outcome: (outcome || undefined) as VarianceOutcome | undefined,
    value: value.trim() === '' ? undefined : Number(value),
  });

  const save = (submit: boolean) => {
    setFormError(undefined);
    action.mutate(
      { kind: 'update', id: v.id, patch: patch() },
      {
        onSuccess: () => {
          if (!submit) return toast({ title: `${v.number} saved` });
          action.mutate(
            { kind: 'submit', id: v.id },
            {
              onSuccess: (res) =>
                toast({
                  title:
                    res.status === 'Pending approval'
                      ? `${v.number} sent for approval`
                      : `${v.number} resolved`,
                  body:
                    res.status === 'Pending approval'
                      ? `${res.approval?.approverRole ?? 'Approver'} decides in the approvals inbox.`
                      : undefined,
                }),
              onError: (e) => setFormError(e instanceof Error ? e.message : 'Not submitted.'),
            },
          );
        },
        onError: (e) => setFormError(e instanceof Error ? e.message : 'Not saved.'),
      },
    );
  };
  useFormShortcuts(editable ? { onSave: () => save(false), onPrimary: () => save(true) } : {});

  const totals = lines.reduce(
    (t, l) => ({
      short: t.short + Math.max(0, (Number(l.expected) || 0) - (Number(l.actual) || 0)),
      damaged: t.damaged + (Number(l.damaged) || 0),
    }),
    { short: 0, damaged: 0 },
  );

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Variances and claims', to: '/variances' }, { label: v.number }]}
        title={`Variance ${v.number}`}
        meta={<StatusBadge status={v.status} />}
        description={`${v.source} ${v.sourceRef} · ${v.customerName} · raised ${formatDateTime(v.raisedAt)}`}
        actions={
          editable ? (
            <>
              <Button
                variant="secondary"
                icon={<Save aria-hidden="true" />}
                busy={action.isPending}
                onClick={() => save(false)}
              >
                Save
              </Button>
              <Button icon={<Send aria-hidden="true" />} busy={action.isPending} onClick={() => save(true)}>
                Submit outcome
              </Button>
            </>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Lines"
              description="Expected vs actual quantity and damaged units, as found on the document or the count."
            />
            <CardBody>
              <div
                className="overflow-x-auto rounded-lg border border-border-subtle"
                tabIndex={0}
                role="region"
                aria-label="Variance lines"
              >
                <table className="w-full min-w-[620px] text-left text-body-s">
                  <caption className="sr-only">Lines of {v.number}</caption>
                  <thead>
                    <tr className="border-b border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
                      <th scope="col" className="px-3 py-2 font-medium">
                        SKU
                      </th>
                      <th scope="col" className="w-24 px-3 py-2 font-medium">
                        Expected
                      </th>
                      <th scope="col" className="w-24 px-3 py-2 font-medium">
                        Actual
                      </th>
                      <th scope="col" className="w-24 px-3 py-2 font-medium">
                        Damaged
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.sku} className="border-b border-border-subtle last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[13px]">{l.sku}</td>
                        {(['expected', 'actual', 'damaged'] as const).map((k) => (
                          <td key={k} className="px-3 py-1.5">
                            {editable ? (
                              <input
                                type="number"
                                min={0}
                                aria-label={`${l.sku} ${k} quantity`}
                                value={l[k]}
                                onChange={(e) => set(i, k, e.target.value)}
                                className={clsx(inputClasses, 'h-9 text-right')}
                              />
                            ) : (
                              <span className="tabular-nums">{l[k]}</span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-1.5">
                          {editable ? (
                            <input
                              aria-label={`${l.sku} remarks`}
                              value={l.remarks}
                              onChange={(e) => set(i, 'remarks', e.target.value)}
                              className={clsx(inputClasses, 'h-9')}
                            />
                          ) : (
                            <span>{l.remarks || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-caption text-fg-muted">
                Short {totals.short} · damaged {totals.damaged}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Photos" description="Pictures of the damage, the seal or the short carton." />
            <CardBody className="space-y-3">
              {photos.length ? (
                <ul className="flex flex-wrap gap-2">
                  {photos.map((p, i) => (
                    <li key={`${p.fileName}-${i}`} className="flex items-center gap-1">
                      <AttachmentChip file={p} />
                      {editable ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${p.fileName}`}
                          icon={<Trash2 aria-hidden="true" />}
                          onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-s text-fg-muted">No photos yet.</p>
              )}
              {editable ? (
                <div>
                  <label
                    htmlFor={photoId}
                    className="inline-flex cursor-pointer items-center gap-2 text-body-s font-medium text-brand hover:underline"
                  >
                    <Camera aria-hidden="true" className="size-4" /> Add photos
                  </label>
                  <input
                    id={photoId}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])].map(toAttachment);
                      setPhotos((ps) => [...ps, ...files]);
                      e.target.value = '';
                    }}
                  />
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Outcome" />
            <CardBody className="space-y-4">
              {editable ? (
                <>
                  <SelectField
                    label="Outcome"
                    required
                    placeholder="Choose the outcome"
                    options={VARIANCE_OUTCOMES.map((o) => ({ value: o, label: o }))}
                    value={outcome}
                    hint={outcome ? outcomeHelp[outcome as VarianceOutcome] : undefined}
                    onChange={(e) => setOutcome(e.target.value)}
                  />
                  <TextField
                    label="Value (AED)"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={value}
                    hint="Value of the shortage / damage — used for the debit note or claim."
                    onChange={(e) => setValue(e.target.value)}
                  />
                </>
              ) : (
                <DescriptionList
                  items={[
                    { label: 'Outcome', value: v.outcome ?? '—' },
                    { label: 'Value', value: v.value !== undefined ? <Money amount={v.value} /> : '—' },
                  ]}
                />
              )}
              {formError ? (
                <p role="alert" className="text-caption font-medium text-danger">
                  {formError}
                </p>
              ) : null}
              {v.status === 'Pending approval' ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-body-s text-warning">
                  <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  Waiting for the {v.approval?.approverRole ?? 'approver'} in the approvals inbox.
                </p>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                items={[
                  {
                    label: 'Job',
                    value: v.jobNumber ? (
                      <Link
                        to="/work-orders/$id"
                        params={{ id: v.workOrderId }}
                        className="font-mono font-medium text-brand hover:underline"
                      >
                        {v.jobNumber}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Customer', value: v.customerName },
                  { label: 'Vendor', value: v.vendorName ?? '—' },
                  {
                    label: 'Approval',
                    value: v.approval
                      ? `${v.approval.status} — ${v.approval.approverRole}${v.approval.decidedBy ? ` by ${v.approval.decidedBy}` : ''}`
                      : 'Not requested',
                  },
                  {
                    label: 'Debit note',
                    value: v.debitNoteNumber ? <DocRef>{v.debitNoteNumber}</DocRef> : '—',
                  },
                  {
                    label: 'Claim',
                    value:
                      v.status === 'Resolved' && v.outcome === 'Customer claim'
                        ? v.creditNoteInvoiceId
                          ? 'Credit note raised'
                          : 'Claim lodged — credit note by finance'
                        : '—',
                  },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
