import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { useId, useState } from 'react';
import type { CustomerRequest, DocLine } from '@/domain/types';
import { AttachmentChip } from '@/shared/ui/Attachment';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { ReconciliationTable } from '@/shared/ui/ReconciliationTable';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import {
  availableToRelease,
  grnResult,
  podResult,
  toAttachment,
  useCreateRequest,
  useDocAction,
  type DocAction,
  type WorkOrderDetail,
} from './api';

const PROTO_TODAY = '2026-11-23';

function useRun() {
  const doc = useDocAction();
  const toast = useToast();
  const run = (a: DocAction, ok: string, onDone?: () => void) =>
    doc.mutate(a, {
      onSuccess: () => {
        toast({ title: ok });
        onDone?.();
      },
      onError: (e) =>
        toast({ title: 'Action not allowed', body: e instanceof Error ? e.message : 'Please try again.' }),
    });
  return { run, pending: doc.isPending };
}

// ---------------------------------------------------------------------------------------------
// Inbound: product list (PL) → warehouse team → GRN upload → comparison
// ---------------------------------------------------------------------------------------------

export function InboundCard({ wo }: { wo: WorkOrderDetail }) {
  const { run, pending } = useRun();
  const [editPl, setEditPl] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const pl = wo.packingList;
  const grn = wo.grn;
  const result = grnResult(wo);
  const closed = wo.status === 'Completed' || wo.status === 'Cancelled';

  return (
    <Card>
      <CardHeader
        title="Inbound · product list → GRN"
        description="Send the product list (PL) to the warehouse team, upload the GRN they return, and compare."
        actions={
          pl ? (
            <div className="flex items-center gap-2">
              <StatusBadge status={pl.status} />
              {grn ? <StatusBadge status={grn.status} /> : null}
            </div>
          ) : null
        }
      />
      <CardBody className="space-y-5">
        <ol className="grid gap-2 sm:grid-cols-3" aria-label="Inbound steps">
          <Step n={1} label="Product list" done={!!pl?.lines.length} current={!pl || pl.status === 'Draft'} />
          <Step
            n={2}
            label="Sent to warehouse"
            done={pl?.status === 'Sent to warehouse'}
            current={pl?.status === 'Draft'}
          />
          <Step
            n={3}
            label="GRN uploaded & checked"
            done={grn?.status === 'Verified'}
            current={pl?.status === 'Sent to warehouse'}
          />
        </ol>

        {/* PL */}
        <section aria-labelledby="pl-h" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="pl-h" className="text-body-s font-semibold">
              Product list {pl ? <DocRef className="ml-1">{pl.number}</DocRef> : null}
            </h3>
            <div className="flex gap-2">
              {!closed && (!pl || pl.status === 'Draft') ? (
                <Button size="sm" variant="secondary" onClick={() => setEditPl(true)}>
                  {pl?.lines.length ? 'Edit PL' : 'Add product list'}
                </Button>
              ) : null}
              {!closed && pl?.status === 'Draft' && pl.lines.length ? (
                <Button
                  size="sm"
                  icon={<Send aria-hidden="true" />}
                  busy={pending}
                  onClick={() =>
                    run({ kind: 'sendPl', id: wo.id }, `${pl.number} sent to the warehouse team`)
                  }
                >
                  Send to warehouse
                </Button>
              ) : null}
            </div>
          </div>
          {pl?.lines.length ? (
            <>
              <LinesTable lines={pl.lines} caption="Product list lines" />
              {pl.sentAt ? (
                <p className="text-caption text-fg-muted">
                  Sent to warehouse team {formatDateTime(pl.sentAt)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-body-s text-fg-muted">
              No product list yet. Add the SKUs and quantities the warehouse should expect.
            </p>
          )}
        </section>

        {/* GRN */}
        {pl?.status === 'Sent to warehouse' ? (
          <section aria-labelledby="grn-h" className="space-y-3 border-t border-border-subtle pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="grn-h" className="text-body-s font-semibold">
                Goods received note {grn ? <DocRef className="ml-1">{grn.number}</DocRef> : null}
              </h3>
              {!closed && !grn ? (
                <Button size="sm" icon={<Upload aria-hidden="true" />} onClick={() => setGrnOpen(true)}>
                  Upload GRN
                </Button>
              ) : null}
            </div>
            {!grn ? (
              <p className="flex items-center gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-body-s text-info">
                <PackageCheck aria-hidden="true" className="size-4 shrink-0" /> Waiting for the warehouse
                team’s GRN.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  {grn.attachment ? <AttachmentChip file={grn.attachment} /> : null}
                  <p className="text-caption text-fg-muted">Received {formatDateTime(grn.receivedAt)}</p>
                </div>
                {result ? (
                  <ReconciliationTable
                    result={result}
                    expectedLabel="PL qty"
                    actualLabel="GRN qty"
                    caption={`${pl.number} compared with ${grn.number}`}
                  />
                ) : null}
                {!closed && grn.status === 'Uploaded' ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {result?.ok ? (
                      <Button
                        size="sm"
                        icon={<CheckCircle2 aria-hidden="true" />}
                        busy={pending}
                        onClick={() => run({ kind: 'verifyGrn', id: wo.id }, `${grn.number} verified`)}
                      >
                        Verify GRN
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<AlertTriangle aria-hidden="true" />}
                        busy={pending}
                        onClick={() =>
                          run({ kind: 'grnVariance', id: wo.id }, `Variance raised on ${grn.number}`)
                        }
                      >
                        Raise variance
                      </Button>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}
      </CardBody>

      {editPl ? <PlEditorDialog wo={wo} onClose={() => setEditPl(false)} /> : null}
      {grnOpen ? <GrnUploadDialog wo={wo} onClose={() => setGrnOpen(false)} /> : null}
    </Card>
  );
}

function Step({ n, label, done, current }: { n: number; label: string; done?: boolean; current?: boolean }) {
  return (
    <li
      className={clsx(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-body-s',
        done
          ? 'border-success/25 bg-success-subtle'
          : current
            ? 'border-brand/30 bg-brand-subtle'
            : 'border-border-subtle',
      )}
    >
      <span
        className={clsx(
          'grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold',
          done
            ? 'bg-success text-primary-fg'
            : current
              ? 'bg-brand text-brand-fg'
              : 'bg-surface-muted text-fg-muted',
        )}
      >
        {done ? <CheckCircle2 aria-hidden="true" className="size-3.5" /> : n}
      </span>
      <span className={clsx('font-medium', !done && !current && 'text-fg-muted')}>
        {label}
        <span className="sr-only">{done ? ' — done' : current ? ' — next' : ' — pending'}</span>
      </span>
    </li>
  );
}

function LinesTable({ lines, caption }: { lines: DocLine[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full text-left text-body-s">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              SKU
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Description
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Qty
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.sku} className="border-b border-border-subtle last:border-0">
              <td className="px-3 py-2 font-mono text-[13px]">{l.sku}</td>
              <td className="px-3 py-2">{l.description}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {l.quantity} <span className="text-caption text-fg-muted">{l.uom}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DraftLine = { sku: string; description: string; quantity: string; uom: string };

function PlEditorDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const { run, pending } = useRun();
  const [lines, setLines] = useState<DraftLine[]>(
    wo.packingList?.lines.map((l) => ({ ...l, quantity: String(l.quantity) })) ?? [
      { sku: '', description: '', quantity: '1', uom: 'Ctn' },
    ],
  );
  const [error, setError] = useState<string>();
  const set = (i: number, k: keyof DraftLine, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const save = () => {
    const clean = lines.filter((l) => l.sku.trim() || l.description.trim());
    const skus = clean.map((l) => l.sku.trim().toUpperCase());
    if (!clean.length) return setError('Add at least one product.');
    if (
      clean.some((l) => !l.sku.trim() || !l.description.trim() || !(Number(l.quantity) > 0) || !l.uom.trim())
    )
      return setError('Every product needs a SKU, description, quantity above 0 and a unit.');
    if (new Set(skus).size !== skus.length) return setError('Each SKU can appear only once.');
    run(
      {
        kind: 'savePl',
        id: wo.id,
        lines: clean.map((l) => ({
          sku: l.sku.trim().toUpperCase(),
          description: l.description.trim(),
          quantity: Math.round(Number(l.quantity)),
          uom: l.uom.trim(),
        })),
      },
      'Product list saved',
      onClose,
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Product list (PL)"
      description="What the warehouse team should expect to receive for this job."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={pending} onClick={save}>
            Save product list
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_80px_70px_40px] gap-2">
            <input
              aria-label={`Product ${i + 1} SKU`}
              placeholder="SKU"
              value={l.sku}
              onChange={(e) => set(i, 'sku', e.target.value)}
              className={clsx(inputClasses, 'h-10 font-mono')}
            />
            <input
              aria-label={`Product ${i + 1} description`}
              placeholder="Description"
              value={l.description}
              onChange={(e) => set(i, 'description', e.target.value)}
              className={clsx(inputClasses, 'h-10')}
            />
            <input
              type="number"
              min={1}
              aria-label={`Product ${i + 1} quantity`}
              value={l.quantity}
              onChange={(e) => set(i, 'quantity', e.target.value)}
              className={clsx(inputClasses, 'h-10')}
            />
            <input
              aria-label={`Product ${i + 1} unit`}
              value={l.uom}
              onChange={(e) => set(i, 'uom', e.target.value)}
              className={clsx(inputClasses, 'h-10')}
            />
            <button
              type="button"
              aria-label={`Remove product ${i + 1}`}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              className="grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-danger-subtle hover:text-danger"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus aria-hidden="true" />}
          onClick={() => setLines((ls) => [...ls, { sku: '', description: '', quantity: '1', uom: 'Ctn' }])}
        >
          Add product
        </Button>
        {error ? (
          <p role="alert" className="text-caption font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function FileField({
  label,
  file,
  onFile,
  error,
}: {
  label: string;
  file?: File;
  onFile: (f?: File) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <label htmlFor={id} className="text-body-s font-medium">
        {label}
        <span aria-hidden="true" className="ml-0.5 text-brand">
          *
        </span>
      </label>
      <input
        id={id}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        aria-invalid={!!error || undefined}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onFile(e.target.files?.[0])}
        className="block w-full text-body-s file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-body-s file:font-medium hover:file:bg-surface-muted"
      />
      <p id={`${id}-hint`} className="text-caption text-fg-muted">
        {file
          ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`
          : 'PDF or image. The prototype keeps the file name only.'}
      </p>
      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GrnUploadDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const { run, pending } = useRun();
  const pl = wo.packingList!;
  const [file, setFile] = useState<File>();
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(PROTO_TODAY);
  const [rows, setRows] = useState(
    pl.lines.map((l) => ({ sku: l.sku, received: String(l.quantity), damaged: '0', remarks: '' })),
  );
  const [errors, setErrors] = useState<{ file?: string; number?: string; rows?: string }>({});
  const set = (i: number, k: 'received' | 'damaged' | 'remarks', v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const submit = () => {
    const e: typeof errors = {};
    if (!file) e.file = 'Attach the signed GRN from the warehouse team.';
    if (number.trim().length < 3) e.number = 'Enter the GRN number.';
    if (
      rows.some(
        (r) => Number(r.received) < 0 || Number(r.damaged) < 0 || Number(r.damaged) > Number(r.received),
      )
    )
      e.rows = 'Quantities cannot be negative, and damaged cannot exceed received.';
    setErrors(e);
    if (Object.keys(e).length) return;
    run(
      {
        kind: 'uploadGrn',
        id: wo.id,
        grn: {
          number: number.trim().toUpperCase(),
          receivedAt: `${date}T12:00:00+04:00`,
          attachment: toAttachment(file!),
          lines: rows.map((r) => ({
            sku: r.sku,
            receivedQty: Math.round(Number(r.received) || 0),
            damagedQty: Math.round(Number(r.damaged) || 0),
            remarks: r.remarks.trim() || undefined,
          })),
        },
      },
      `${number.trim().toUpperCase()} uploaded — compare it with ${pl.number}`,
      onClose,
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Upload GRN"
      description={`Enter what the warehouse team actually received against ${pl.number}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={pending} icon={<Upload aria-hidden="true" />} onClick={submit}>
            Upload GRN
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FileField label="Signed GRN document" file={file} onFile={setFile} error={errors.file} />
        <TextField
          label="GRN number"
          required
          placeholder="e.g. GRN-5531"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          error={errors.number}
        />
        <TextField
          label="Received on"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className="overflow-x-auto sm:col-span-2">
          <table className="w-full min-w-[520px] text-left text-body-s">
            <caption className="sr-only">Received quantities per product</caption>
            <thead>
              <tr className="text-caption uppercase tracking-wide text-fg-muted">
                <th scope="col" className="pb-2 font-medium">
                  SKU
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  PL qty
                </th>
                <th scope="col" className="w-24 pb-2 pl-2 font-medium">
                  Received
                </th>
                <th scope="col" className="w-24 pb-2 pl-2 font-medium">
                  Damaged
                </th>
                <th scope="col" className="pb-2 pl-2 font-medium">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.sku}>
                  <td className="py-1 font-mono text-[13px]">{r.sku}</td>
                  <td className="py-1 text-right tabular-nums">{pl.lines[i]!.quantity}</td>
                  <td className="py-1 pl-2">
                    <input
                      type="number"
                      min={0}
                      aria-label={`${r.sku} received quantity`}
                      value={r.received}
                      onChange={(e) => set(i, 'received', e.target.value)}
                      className={clsx(inputClasses, 'h-9')}
                    />
                  </td>
                  <td className="py-1 pl-2">
                    <input
                      type="number"
                      min={0}
                      aria-label={`${r.sku} damaged quantity`}
                      value={r.damaged}
                      onChange={(e) => set(i, 'damaged', e.target.value)}
                      className={clsx(inputClasses, 'h-9')}
                    />
                  </td>
                  <td className="py-1 pl-2">
                    <input
                      aria-label={`${r.sku} remarks`}
                      value={r.remarks}
                      onChange={(e) => set(i, 'remarks', e.target.value)}
                      className={clsx(inputClasses, 'h-9')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {errors.rows ? (
            <p role="alert" className="mt-2 text-caption font-medium text-danger">
              {errors.rows}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Outbound: customer request → vendor / warehouse → POD upload → comparison
// ---------------------------------------------------------------------------------------------

export function CustomerRequestsCard({ wo }: { wo: WorkOrderDetail }) {
  const [newOpen, setNewOpen] = useState(false);
  const closed = wo.status === 'Completed' || wo.status === 'Cancelled' || wo.status === 'Draft';
  return (
    <Card>
      <CardHeader
        title="Customer requests · request → POD"
        description="Out / delivery requests from the customer, closed by the vendor’s or warehouse’s proof of delivery."
        actions={
          !closed ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus aria-hidden="true" />}
              onClick={() => setNewOpen(true)}
            >
              New request
            </Button>
          ) : null
        }
      />
      <CardBody>
        {wo.customerRequests.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-body-s text-fg-muted">
            {wo.status === 'Draft'
              ? 'Confirm the job before logging customer requests.'
              : wo.status === 'Completed' || wo.status === 'Cancelled'
                ? 'No customer request on this job.'
                : 'No customer request yet. Log one when the customer asks for goods to be delivered or released.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {wo.customerRequests.map((r) => (
              <RequestItem key={r.id} wo={wo} req={r} />
            ))}
          </ul>
        )}
      </CardBody>
      {newOpen ? <NewRequestDialog wo={wo} onClose={() => setNewOpen(false)} /> : null}
    </Card>
  );
}

function RequestItem({ wo, req }: { wo: WorkOrderDetail; req: CustomerRequest }) {
  const { run, pending } = useRun();
  const [sendOpen, setSendOpen] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const result = podResult(req);
  const locked = wo.status === 'Completed' || wo.status === 'Cancelled';
  const vendorName = req.pod?.vendorId
    ? wo.assignments.find((a) => a.vendorId === req.pod?.vendorId)?.vendorName
    : undefined;

  return (
    <li className="rounded-xl border border-border-subtle p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <DocRef>{req.number}</DocRef>
            <StatusBadge status={req.status} />
          </p>
          <p className="mt-1 text-body-s">{req.deliverTo}</p>
          <p className="text-caption text-fg-muted">
            Requested {formatDateTime(req.requestedAt)} · needed by {formatDate(req.requiredBy)}
          </p>
        </div>
        {!locked ? (
          <div className="flex flex-wrap gap-2">
            {req.status === 'Open' ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Send aria-hidden="true" />}
                onClick={() => setSendOpen(true)}
              >
                Send to vendor
              </Button>
            ) : null}
            {(req.status === 'Open' || req.status === 'Sent to vendor') && !req.pod ? (
              <Button size="sm" icon={<Upload aria-hidden="true" />} onClick={() => setPodOpen(true)}>
                Upload POD
              </Button>
            ) : null}
            {req.status === 'Delivered' && result?.ok ? (
              <Button
                size="sm"
                icon={<CheckCircle2 aria-hidden="true" />}
                busy={pending}
                onClick={() =>
                  run({ kind: 'closeRequest', id: wo.id, requestId: req.id }, `${req.number} closed`)
                }
              >
                Close request
              </Button>
            ) : null}
            {req.status === 'Delivered' && result && !result.ok ? (
              <Button
                size="sm"
                variant="danger"
                icon={<AlertTriangle aria-hidden="true" />}
                busy={pending}
                onClick={() =>
                  run(
                    { kind: 'requestVariance', id: wo.id, requestId: req.id },
                    `Variance raised on ${req.number}`,
                  )
                }
              >
                Raise variance
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        {req.pod && result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {req.pod.attachment ? <AttachmentChip file={req.pod.attachment} /> : null}
              <p className="text-caption text-fg-muted">
                <DocRef>{req.pod.number}</DocRef> · delivered {formatDateTime(req.pod.deliveredAt)} · received
                by {req.pod.receivedBy}
                {vendorName ? ` · ${vendorName}` : ''}
              </p>
            </div>
            <ReconciliationTable
              result={result}
              expectedLabel="Requested"
              actualLabel="Delivered"
              caption={`${req.number} compared with ${req.pod.number}`}
            />
          </div>
        ) : (
          <LinesTable lines={req.lines} caption={`${req.number} lines`} />
        )}
      </div>

      {sendOpen ? <SendRequestDialog wo={wo} req={req} onClose={() => setSendOpen(false)} /> : null}
      {podOpen ? <PodUploadDialog wo={wo} req={req} onClose={() => setPodOpen(false)} /> : null}
    </li>
  );
}

function NewRequestDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const create = useCreateRequest();
  const toast = useToast();
  const known: DocLine[] = wo.packingList?.lines ?? [];
  const avail = wo.serviceCategory === 'Warehouse' && wo.grn ? availableToRelease(wo) : undefined;
  const [deliverTo, setDeliverTo] = useState('');
  const [requiredBy, setRequiredBy] = useState('2026-11-27');
  const [rows, setRows] = useState<DraftLine[]>(
    known.length
      ? known.map((l) => ({ sku: l.sku, description: l.description, quantity: '0', uom: l.uom }))
      : [{ sku: '', description: '', quantity: '1', uom: 'Pcs' }],
  );
  const [errors, setErrors] = useState<{ deliverTo?: string; lines?: string; rows: Record<number, string> }>({
    rows: {},
  });
  const set = (i: number, k: keyof DraftLine, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const submit = () => {
    const rowErr: Record<number, string> = {};
    rows.forEach((r, i) => {
      const q = Number(r.quantity);
      if (q > 0 && avail && q > Math.max(0, avail.get(r.sku) ?? 0))
        rowErr[i] = `Only ${Math.max(0, avail.get(r.sku) ?? 0)} good units available to release`;
    });
    const lines = rows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        sku: known.length ? r.sku : r.sku.trim().toUpperCase(),
        description: r.description.trim() || r.sku,
        quantity: Math.round(Number(r.quantity)),
        uom: r.uom.trim() || 'Pcs',
      }));
    const e = {
      deliverTo: deliverTo.trim().length < 3 ? 'Where should the goods go?' : undefined,
      lines:
        lines.length === 0
          ? 'Request at least one item with a quantity above 0.'
          : lines.some((l) => !l.sku)
            ? 'Every line needs a SKU.'
            : undefined,
      rows: rowErr,
    };
    setErrors(e);
    if (e.deliverTo || e.lines || Object.keys(rowErr).length) return;
    create.mutate(
      { id: wo.id, deliverTo: deliverTo.trim(), requiredBy, lines },
      {
        onSuccess: (req) => {
          toast({
            title: `${req.number} logged`,
            body: 'Send it to the vendor or warehouse, then upload the POD.',
          });
          onClose();
        },
        onError: (err) =>
          toast({ title: 'Could not log the request', body: err instanceof Error ? err.message : '' }),
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="New customer request"
      description="Log the customer’s out / delivery request against this job."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={create.isPending} onClick={submit}>
            Log request
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Deliver to"
          required
          placeholder="e.g. Customer store — Dubai Mall"
          value={deliverTo}
          onChange={(e) => setDeliverTo(e.target.value)}
          error={errors.deliverTo}
          className="sm:col-span-2"
        />
        <TextField
          label="Required by"
          type="date"
          required
          value={requiredBy}
          onChange={(e) => setRequiredBy(e.target.value)}
        />
        <div className="space-y-2 sm:col-span-2">
          <p className="text-body-s font-medium">Items</p>
          {rows.map((r, i) => (
            <div key={i} className="space-y-1">
              <div className="grid grid-cols-[1fr_2fr_90px_70px] gap-2">
                <input
                  aria-label={`Item ${i + 1} SKU`}
                  placeholder="SKU"
                  value={r.sku}
                  readOnly={known.length > 0}
                  onChange={(e) => set(i, 'sku', e.target.value)}
                  className={clsx(inputClasses, 'h-10 font-mono read-only:bg-surface-muted')}
                />
                <input
                  aria-label={`Item ${i + 1} description`}
                  placeholder="Description"
                  value={r.description}
                  readOnly={known.length > 0}
                  onChange={(e) => set(i, 'description', e.target.value)}
                  className={clsx(inputClasses, 'h-10 read-only:bg-surface-muted')}
                />
                <input
                  type="number"
                  min={0}
                  aria-label={`Item ${i + 1} quantity`}
                  aria-invalid={!!errors.rows[i] || undefined}
                  value={r.quantity}
                  onChange={(e) => set(i, 'quantity', e.target.value)}
                  className={clsx(inputClasses, 'h-10')}
                />
                <input
                  aria-label={`Item ${i + 1} unit`}
                  value={r.uom}
                  readOnly={known.length > 0}
                  onChange={(e) => set(i, 'uom', e.target.value)}
                  className={clsx(inputClasses, 'h-10 read-only:bg-surface-muted')}
                />
              </div>
              {avail ? (
                <p
                  className={clsx(
                    'text-caption',
                    errors.rows[i] ? 'font-medium text-danger' : 'text-fg-muted',
                  )}
                  role={errors.rows[i] ? 'alert' : undefined}
                >
                  {errors.rows[i] ?? `${Math.max(0, avail.get(r.sku) ?? 0)} good units available`}
                </p>
              ) : null}
            </div>
          ))}
          {known.length === 0 ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus aria-hidden="true" />}
              onClick={() =>
                setRows((rs) => [...rs, { sku: '', description: '', quantity: '1', uom: 'Pcs' }])
              }
            >
              Add item
            </Button>
          ) : null}
          {errors.lines ? (
            <p role="alert" className="text-caption font-medium text-danger">
              {errors.lines}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function SendRequestDialog({
  wo,
  req,
  onClose,
}: {
  wo: WorkOrderDetail;
  req: CustomerRequest;
  onClose: () => void;
}) {
  const { run, pending } = useRun();
  const [vendorId, setVendorId] = useState(wo.assignments[0]?.vendorId ?? '');
  const options = [
    ...new Map(
      wo.assignments.map((a) => [
        a.vendorId,
        { value: a.vendorId, label: `${a.vendorName} · ${a.serviceName}` },
      ]),
    ).values(),
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Send ${req.number}`}
      description="Who will deliver or release the goods?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={pending}
            disabled={!vendorId}
            icon={<Send aria-hidden="true" />}
            onClick={() =>
              run(
                { kind: 'sendRequest', id: wo.id, requestId: req.id, vendorId },
                `${req.number} sent`,
                onClose,
              )
            }
          >
            Send request
          </Button>
        </>
      }
    >
      {options.length ? (
        <SelectField
          label="Vendor / warehouse"
          required
          options={options}
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
        />
      ) : (
        <p className="text-body-s text-fg-muted">Assign a vendor to this job first.</p>
      )}
    </Dialog>
  );
}

function PodUploadDialog({
  wo,
  req,
  onClose,
}: {
  wo: WorkOrderDetail;
  req: CustomerRequest;
  onClose: () => void;
}) {
  const { run, pending } = useRun();
  const [file, setFile] = useState<File>();
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(PROTO_TODAY);
  const [receivedBy, setReceivedBy] = useState('');
  const [vendorId, setVendorId] = useState(wo.assignments[0]?.vendorId ?? '');
  const [rows, setRows] = useState(
    req.lines.map((l) => ({ sku: l.sku, delivered: String(l.quantity), remarks: '' })),
  );
  const [errors, setErrors] = useState<{
    file?: string;
    number?: string;
    receivedBy?: string;
    rows?: string;
  }>({});
  const set = (i: number, k: 'delivered' | 'remarks', v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const vendorOptions = [
    ...new Map(wo.assignments.map((a) => [a.vendorId, { value: a.vendorId, label: a.vendorName }])).values(),
  ];

  const submit = () => {
    const e: typeof errors = {};
    if (!file) e.file = 'Attach the signed POD.';
    if (number.trim().length < 3) e.number = 'Enter the POD number.';
    if (receivedBy.trim().length < 2) e.receivedBy = 'Who signed for the goods?';
    if (rows.some((r) => Number(r.delivered) < 0)) e.rows = 'Delivered quantities cannot be negative.';
    setErrors(e);
    if (Object.keys(e).length) return;
    run(
      {
        kind: 'uploadPod',
        id: wo.id,
        requestId: req.id,
        pod: {
          number: number.trim().toUpperCase(),
          vendorId: vendorId || undefined,
          deliveredAt: `${date}T12:00:00+04:00`,
          receivedBy: receivedBy.trim(),
          attachment: toAttachment(file!),
          lines: rows.map((r) => ({
            sku: r.sku,
            deliveredQty: Math.round(Number(r.delivered) || 0),
            remarks: r.remarks.trim() || undefined,
          })),
        },
      },
      `${number.trim().toUpperCase()} uploaded — compare it with ${req.number}`,
      onClose,
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Upload POD for ${req.number}`}
      description="Enter what was actually delivered, as signed on the proof of delivery."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={pending} icon={<Upload aria-hidden="true" />} onClick={submit}>
            Upload POD
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FileField label="Signed POD document" file={file} onFile={setFile} error={errors.file} />
        <TextField
          label="POD number"
          required
          placeholder="e.g. POD-88130"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          error={errors.number}
        />
        <TextField
          label="Delivered on"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TextField
          label="Received by"
          required
          placeholder="Name / role of the signatory"
          value={receivedBy}
          onChange={(e) => setReceivedBy(e.target.value)}
          error={errors.receivedBy}
        />
        {vendorOptions.length ? (
          <SelectField
            label="Delivered by"
            options={vendorOptions}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          />
        ) : null}
        <div className="overflow-x-auto sm:col-span-2">
          <table className="w-full min-w-[480px] text-left text-body-s">
            <caption className="sr-only">Delivered quantities per item</caption>
            <thead>
              <tr className="text-caption uppercase tracking-wide text-fg-muted">
                <th scope="col" className="pb-2 font-medium">
                  SKU
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Requested
                </th>
                <th scope="col" className="w-28 pb-2 pl-2 font-medium">
                  Delivered
                </th>
                <th scope="col" className="pb-2 pl-2 font-medium">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.sku}>
                  <td className="py-1 font-mono text-[13px]">{r.sku}</td>
                  <td className="py-1 text-right tabular-nums">{req.lines[i]!.quantity}</td>
                  <td className="py-1 pl-2">
                    <input
                      type="number"
                      min={0}
                      aria-label={`${r.sku} delivered quantity`}
                      value={r.delivered}
                      onChange={(e) => set(i, 'delivered', e.target.value)}
                      className={clsx(inputClasses, 'h-9')}
                    />
                  </td>
                  <td className="py-1 pl-2">
                    <input
                      aria-label={`${r.sku} remarks`}
                      value={r.remarks}
                      onChange={(e) => set(i, 'remarks', e.target.value)}
                      className={clsx(inputClasses, 'h-9')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {errors.rows ? (
            <p role="alert" className="mt-2 text-caption font-medium text-danger">
              {errors.rows}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Purchase invoices drafted at completion
// ---------------------------------------------------------------------------------------------

export function PurchaseInvoicesCard({ wo }: { wo: WorkOrderDetail }) {
  return (
    <Card>
      <CardHeader title="Purchase invoices" description="Vendor bills for this job." />
      <CardBody>
        {wo.purchaseInvoices.length === 0 ? (
          <p className="text-body-s text-fg-muted">
            {wo.status === 'Completed'
              ? 'No vendor to bill on this job.'
              : 'Drafted automatically for each assigned vendor when you mark the job completed.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {wo.purchaseInvoices.map((b) => (
              <li key={b.id}>
                <Link
                  to="/vendor-bills/$id"
                  params={{ id: b.id }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                >
                  <span className="min-w-0">
                    <DocRef>{b.number}</DocRef>
                    <span className="block truncate text-caption text-fg-muted">{b.vendorName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Money amount={b.amount + b.vat} className="text-body-s font-medium" />
                    <StatusBadge status={b.status} />
                    <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
