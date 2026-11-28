// ---- FLOW-003 WP-C ---- S4 internal costs + profit card, S3 service completion notes.
import clsx from 'clsx';
import { CheckCircle2, ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Attachment, InternalCost } from '@/domain/types';
import { AttachmentChip } from '@/shared/ui/Attachment';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatNumber } from '@/shared/utils/format';
import { PROTO_TODAY, type WorkOrderDetail } from './api';
import { useJobAction, useRecordCompletion, type JobExtras } from './transport-api';
import { errorText, FileField } from './wpc-fields';

const COST_KINDS: InternalCost['kind'][] = ['Labour', 'Equipment', 'Material', 'Other'];

/** S4: revenue − vendor PO costs − internal costs = gross profit. */
export function ProfitCard({ extras }: { extras: JobExtras }) {
  const p = extras.profit;
  const low = p.marginPct < 15;
  return (
    <Card>
      <CardHeader title="Job profit" description="AED, excluding VAT" />
      <CardBody>
        <dl className="space-y-2.5 text-body-s">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Revenue (job lines)</dt>
            <dd className="font-medium">
              <Money amount={p.revenue} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">Vendor PO costs</dt>
            <dd>
              − <Money amount={p.vendorCost} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">Internal costs</dt>
            <dd>
              − <Money amount={p.internalCost} />
            </dd>
          </div>
          <div className="flex justify-between border-t border-border-subtle pt-2.5">
            <dt className="font-semibold">Gross profit</dt>
            <dd
              className={clsx(
                'font-semibold',
                p.grossProfit < 0 ? 'text-danger' : low ? 'text-warning' : 'text-success',
              )}
            >
              <Money amount={p.grossProfit} />
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <div className="flex justify-between text-caption text-fg-muted">
            <span>Margin</span>
            <span className="font-medium tabular-nums text-fg">
              {p.marginPct}%{low ? ' (below 15%)' : ''}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
            role="meter"
            aria-valuenow={p.marginPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Margin percentage"
          >
            <div
              className={clsx('h-full rounded-full', low ? 'bg-warning' : 'bg-success')}
              style={{ width: `${Math.max(0, Math.min(100, p.marginPct))}%` }}
            />
          </div>
        </div>
        {p.pendingSurcharges > 0 ? (
          <p className="mt-3 text-caption text-fg-muted">
            Not counted yet: <Money amount={p.pendingSurcharges} /> of surcharges awaiting customer approval.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** S4: own labour, equipment, material and trip costs charged to the job (no PO). */
export function InternalCostsCard({ wo, extras }: { wo: WorkOrderDetail; extras: JobExtras }) {
  const [adding, setAdding] = useState(false);
  const action = useJobAction();
  const toast = useToast();
  const costs = wo.internalCosts ?? [];
  return (
    <Card>
      <CardHeader
        title="Internal costs"
        description="Own staff, equipment, material and own-vehicle trips charged to this job"
        actions={
          wo.status !== 'Cancelled' ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus aria-hidden="true" />}
              onClick={() => setAdding(true)}
            >
              Add internal cost
            </Button>
          ) : null
        }
      />
      <CardBody>
        {costs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body-s text-fg-muted">
            No internal cost recorded.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {costs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{c.description}</p>
                  <p className="text-caption text-fg-muted">
                    {c.kind} · {formatDate(c.date)} · {formatNumber(c.quantity)} {c.unit} ×{' '}
                    <Money amount={c.rate} />
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Money amount={c.quantity * c.rate} className="font-medium" />
                  {!c.tripId && wo.status !== 'Cancelled' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${c.description}`}
                      icon={<Trash2 aria-hidden="true" />}
                      onClick={() =>
                        action.mutate(
                          { op: 'removeInternalCost', id: wo.id, costId: c.id },
                          { onError: (e) => toast({ title: 'Not removed', body: errorText(e) }) },
                        )
                      }
                    />
                  ) : null}
                </div>
              </li>
            ))}
            <li className="flex justify-between py-2.5 font-semibold">
              <span>Total internal cost</span>
              <Money amount={extras.profit.internalCost} />
            </li>
          </ul>
        )}
      </CardBody>
      {adding ? <InternalCostDialog wo={wo} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}

function InternalCostDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const action = useJobAction();
  const toast = useToast();
  const [kind, setKind] = useState<InternalCost['kind']>('Labour');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('Hour');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(PROTO_TODAY);
  const [error, setError] = useState<string>();
  const amount = Number(quantity) * Number(rate);
  const save = () =>
    action.mutate(
      {
        op: 'addInternalCost',
        id: wo.id,
        kind,
        description,
        quantity: Number(quantity),
        unit: unit.trim() || 'Unit',
        rate: Number(rate),
        date,
      },
      {
        onSuccess: () => {
          toast({ title: 'Internal cost added' });
          onClose();
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add internal cost"
      description="Quantity × rate is charged to the job’s profit. No purchase order is raised."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={action.isPending} onClick={save}>
            Add cost
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value as InternalCost['kind'])}
            options={COST_KINDS.map((k) => ({ value: k, label: k }))}
          />
          <TextField
            label="Date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <TextField
          label="Description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 2 labourers for loading"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Quantity"
            type="number"
            min={0}
            step="any"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <TextField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <TextField
            label="Rate (AED)"
            type="number"
            min={0}
            step="any"
            required
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        {amount > 0 ? (
          <p className="text-body-s text-fg-muted">
            Cost: <Money amount={amount} className="font-medium text-fg" />
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** S3: completion notes — proof for services without a GRN or POD (customs, labour, packing). */
export function CompletionNotesCard({ wo, extras }: { wo: WorkOrderDetail; extras: JobExtras }) {
  const [recording, setRecording] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);
  const canRecord = !['Draft', 'Cancelled'].includes(wo.status) && extras.serviceLines.length > 0;
  if (!extras.serviceLines.length && !extras.completionNotes.length) return null;
  return (
    <Card>
      <CardHeader
        title="Service completion"
        description="Completion note signed by the customer — the proof for services with no GRN or POD"
        actions={
          canRecord ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<ClipboardCheck aria-hidden="true" />}
              onClick={() => setRecording(true)}
            >
              Record completion
            </Button>
          ) : null
        }
      />
      <CardBody>
        {extras.completionNotes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body-s text-fg-muted">
            No completion note yet. Record one when the service is done.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {extras.completionNotes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <DocRef>{n.number}</DocRef>
                    <span className="font-medium">{n.serviceName}</span>
                    <Badge tone={n.status === 'Signed' ? 'success' : 'warning'}>
                      {n.status === 'Signed' ? 'Signed' : 'Not signed'}
                    </Badge>
                  </p>
                  <p className="text-caption text-fg-muted">
                    {formatDate(n.date)} · {formatNumber(n.quantity)} {n.unit}
                    {n.poNumber ? ` · ${n.poNumber}` : ''}
                    {n.vendorName ? ` · ${n.vendorName}` : ''}
                    {n.customerSignedBy ? ` · signed by ${n.customerSignedBy}` : ''}
                  </p>
                  <p className="text-body-s text-fg-secondary">{n.description}</p>
                  {n.attachment ? <AttachmentChip file={n.attachment} /> : null}
                </div>
                {n.status !== 'Signed' && wo.status !== 'Cancelled' ? (
                  <Button size="sm" variant="secondary" onClick={() => setSigning(n.id)}>
                    Mark signed<span className="sr-only"> {n.number}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      {recording ? <CompletionDialog wo={wo} extras={extras} onClose={() => setRecording(false)} /> : null}
      {signing ? <SignDialog wo={wo} noteId={signing} onClose={() => setSigning(null)} /> : null}
    </Card>
  );
}

function CompletionDialog({
  wo,
  extras,
  onClose,
}: {
  wo: WorkOrderDetail;
  extras: JobExtras;
  onClose: () => void;
}) {
  const record = useRecordCompletion();
  const toast = useToast();
  const first = extras.serviceLines[0];
  const [lineId, setLineId] = useState(first?.id ?? '');
  const line = extras.serviceLines.find((l) => l.id === lineId);
  const pos = extras.purchaseOrders.filter((p) => !line || p.serviceId === line.serviceId);
  const [poId, setPoId] = useState(pos[0]?.id ?? '');
  const [quantity, setQuantity] = useState(String(first?.quantity ?? 1));
  const [unit, setUnit] = useState(first?.unit ?? '');
  const [description, setDescription] = useState('');
  const [signedBy, setSignedBy] = useState('');
  const [date, setDate] = useState(PROTO_TODAY);
  const [attachment, setAttachment] = useState<Attachment>();
  const [error, setError] = useState<string>();
  const save = () => {
    if (!line) {
      setError('Choose the service line');
      return;
    }
    record.mutate(
      {
        id: wo.id,
        serviceId: line.serviceId,
        purchaseOrderId: poId || undefined,
        date,
        quantity: Number(quantity),
        unit: unit.trim() || line.unit,
        description,
        customerSignedBy: signedBy,
        attachment,
      },
      {
        onSuccess: (n) => {
          toast({
            title: `${n.number} recorded`,
            body: n.status === 'Signed' ? 'Signed by the customer.' : 'Get it signed by the customer.',
          });
          onClose();
        },
        onError: (e) => setError(errorText(e)),
      },
    );
  };
  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title="Record service completion"
      description="Creates a service completion note (SCN). It is signed once the customer’s name is recorded."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={record.isPending} icon={<CheckCircle2 aria-hidden="true" />} onClick={save}>
            Save completion note
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
            {error}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Service"
            required
            value={lineId}
            onChange={(e) => {
              setLineId(e.target.value);
              const l = extras.serviceLines.find((x) => x.id === e.target.value);
              if (l) {
                setQuantity(String(l.quantity));
                setUnit(l.unit);
                setPoId(extras.purchaseOrders.find((p) => p.serviceId === l.serviceId)?.id ?? '');
              }
            }}
            options={extras.serviceLines.map((l) => ({ value: l.id, label: l.label }))}
          />
          <SelectField
            label="Vendor PO (if subcontracted)"
            value={poId}
            onChange={(e) => setPoId(e.target.value)}
            placeholder="Own staff — no PO"
            options={pos.map((p) => ({ value: p.id, label: `${p.number} · ${p.vendorName}` }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Quantity done"
            type="number"
            min={0}
            step="any"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <TextField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <TextField
            label="Date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <TextareaField
          label="Work done"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Import declaration filed and cleared; goods released"
        />
        <TextField
          label="Customer signed by"
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          hint="Name and designation. Leave empty if not signed yet."
        />
        <FileField label="Signed note" file={attachment} onFile={setAttachment} />
      </div>
    </Dialog>
  );
}

function SignDialog({ wo, noteId, onClose }: { wo: WorkOrderDetail; noteId: string; onClose: () => void }) {
  const action = useJobAction();
  const toast = useToast();
  const [signedBy, setSignedBy] = useState('');
  const [attachment, setAttachment] = useState<Attachment>();
  const [error, setError] = useState<string>();
  return (
    <Dialog
      open
      onClose={onClose}
      title="Mark completion note signed"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            busy={action.isPending}
            onClick={() =>
              action.mutate(
                { op: 'signCompletion', id: wo.id, noteId, signedBy, attachment },
                {
                  onSuccess: () => {
                    toast({ title: 'Completion note signed' });
                    onClose();
                  },
                  onError: (e) => setError(errorText(e)),
                },
              )
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-body-s text-danger">
            {error}
          </p>
        ) : null}
        <TextField
          label="Customer signed by"
          required
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
        />
        <FileField label="Signed note" file={attachment} onFile={setAttachment} />
      </div>
    </Dialog>
  );
}
