import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useCustomerOptions } from '@/shared/data/lookups';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, SelectField, TextareaField, TextField } from '@/shared/ui/Field';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { useCreateMovement, useCustomerJobs, useCustomerStock, type MovementInput } from './api';

export type MovementKind = MovementInput['type'];

const copy: Record<MovementKind, { title: string; description: string; qtyLabel: string }> = {
  Receipt: {
    title: 'New receipt (GRN)',
    description: 'Goods received into stock. A transport job is optional.',
    qtyLabel: 'Qty received',
  },
  Dispatch: {
    title: 'New dispatch',
    description: 'Goods released from stock. Physical stock can never go below zero.',
    qtyLabel: 'Qty to dispatch',
  },
  Adjustment: {
    title: 'Stock adjustment',
    description: 'Correct physical stock (damage, count variance). A reason is mandatory and audited.',
    qtyLabel: '± Qty',
  },
};

interface Line {
  key: number;
  stockItemId: string; // '' = choose, '__new' = new SKU (receipts)
  quantity: string;
  pallets: string;
  sku: string;
  description: string;
  uom: string;
  location: string;
}

let lineKey = 0;
const blankLine = (): Line => ({
  key: ++lineKey,
  stockItemId: '',
  quantity: '',
  pallets: '',
  sku: '',
  description: '',
  uom: 'Carton',
  location: '',
});

export function MovementDialog({
  kind,
  onClose,
  siteId,
  siteLabel,
}: {
  kind: MovementKind | null;
  onClose: () => void;
  siteId?: string;
  siteLabel: string;
}) {
  return (
    <Dialog
      open={!!kind}
      onClose={onClose}
      size="lg"
      title={kind ? copy[kind].title : ''}
      description={kind ? `${copy[kind].description} Warehouse: ${siteLabel}.` : undefined}
    >
      {kind ? <MovementForm key={kind} kind={kind} siteId={siteId} onDone={onClose} /> : null}
    </Dialog>
  );
}

function MovementForm({ kind, siteId, onDone }: { kind: MovementKind; siteId?: string; onDone: () => void }) {
  const customers = useCustomerOptions();
  const [customerId, setCustomerId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const stock = useCustomerStock(customerId);
  const jobs = useCustomerJobs(customerId);
  const create = useCreateMovement();
  const toast = useToast();

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = (post: boolean) => {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = 'Choose a customer';
    if (!reference.trim()) e.reference = 'Enter a reference (container, delivery note, count sheet…)';
    if (kind === 'Adjustment' && reason.trim().length < 5)
      e.reason = 'A reason of at least 5 characters is required';
    lines.forEach((l, i) => {
      const q = Number(l.quantity);
      if (!l.stockItemId) e[`line-${i}`] = 'Choose a stock item';
      else if (!Number.isFinite(q) || q === 0 || (kind !== 'Adjustment' && q < 0))
        e[`line-${i}`] = 'Enter a valid quantity';
      else if (l.stockItemId === '__new' && (!l.sku.trim() || !l.description.trim() || !l.location.trim()))
        e[`line-${i}`] = 'New SKU needs code, description and location';
      else if (kind === 'Dispatch') {
        const item = stock.data?.find((s) => s.id === l.stockItemId);
        if (item && q > item.qtyOnHand) e[`line-${i}`] = `Only ${item.qtyOnHand} on hand`;
      }
    });
    setErrors(e);
    if (Object.keys(e).length) return;
    create.mutate(
      {
        type: kind,
        customerId,
        workOrderId: workOrderId || undefined,
        reference: reference.trim(),
        reason: reason.trim() || undefined,
        post,
        siteId,
        lines: lines.map((l) =>
          l.stockItemId === '__new'
            ? {
                newSku: { sku: l.sku, description: l.description, uom: l.uom, location: l.location },
                quantity: Number(l.quantity),
                pallets: Number(l.pallets) || 1,
              }
            : { stockItemId: l.stockItemId, quantity: Number(l.quantity) },
        ),
      },
      {
        onSuccess: (m) => {
          toast({
            title: `${m.number} ${post ? 'posted' : 'saved as draft'}`,
            body: post ? 'Stock on hand has been updated.' : 'Post it when the goods are physically moved.',
          });
          onDone();
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="Customer (stock owner)"
          required
          placeholder={customers.isLoading ? 'Loading…' : 'Select customer'}
          options={customers.data ?? []}
          value={customerId}
          error={errors.customerId}
          onChange={(e) => {
            setCustomerId(e.target.value);
            setWorkOrderId('');
            setLines([blankLine()]);
          }}
        />
        {kind !== 'Adjustment' ? (
          <SelectField
            label="Linked work order"
            placeholder={customerId ? 'None — warehouse only' : 'Choose a customer first'}
            options={jobs.data ?? []}
            value={workOrderId}
            disabled={!customerId}
            hint="Optional: warehouse activity can run without a transport job."
            onChange={(e) => setWorkOrderId(e.target.value)}
          />
        ) : null}
        <TextField
          label="Reference"
          required
          value={reference}
          error={errors.reference}
          placeholder={
            kind === 'Receipt'
              ? 'e.g. Container MSKU 418220-4'
              : kind === 'Dispatch'
                ? 'e.g. Delivery note DN-8812'
                : 'e.g. Cycle count 23 Nov'
          }
          onChange={(e) => setReference(e.target.value)}
          className={kind === 'Adjustment' ? 'sm:col-span-2' : undefined}
        />
        {kind === 'Adjustment' ? (
          <TextareaField
            label="Reason"
            required
            value={reason}
            error={errors.reason}
            placeholder="e.g. 4 cases damaged during handling — approved by warehouse supervisor"
            className="sm:col-span-2"
            onChange={(e) => setReason(e.target.value)}
          />
        ) : null}
      </div>

      <fieldset>
        <legend className="mb-2 text-body-s font-medium">Lines</legend>
        {!customerId ? (
          <p className="text-caption text-fg-muted">Choose a customer to see their stock.</p>
        ) : null}
        <ul className="space-y-3">
          {lines.map((l, i) => {
            const item = stock.data?.find((s) => s.id === l.stockItemId);
            const err = errors[`line-${i}`];
            return (
              <li key={l.key} className="rounded-lg border border-border-subtle bg-canvas p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <select
                    aria-label={`Line ${i + 1} stock item`}
                    aria-invalid={!!err || undefined}
                    value={l.stockItemId}
                    disabled={!customerId}
                    onChange={(e) => update(l.key, { stockItemId: e.target.value })}
                    className={clsx(inputClasses, 'h-10 min-w-0 flex-1 basis-60')}
                  >
                    <option value="">Select SKU…</option>
                    {(stock.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sku} — {s.description} ({s.qtyOnHand} {s.uom.toLowerCase()})
                      </option>
                    ))}
                    {kind === 'Receipt' ? <option value="__new">+ New SKU…</option> : null}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`Line ${i + 1} ${copy[kind].qtyLabel}`}
                    placeholder={copy[kind].qtyLabel}
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    className={clsx(inputClasses, 'h-10 w-32')}
                  />
                  <button
                    type="button"
                    aria-label={`Remove line ${i + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-danger-subtle hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
                {l.stockItemId === '__new' ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-5">
                    <input
                      aria-label="New SKU code"
                      placeholder="SKU code"
                      value={l.sku}
                      onChange={(e) => update(l.key, { sku: e.target.value })}
                      className={clsx(inputClasses, 'h-10')}
                    />
                    <input
                      aria-label="New SKU description"
                      placeholder="Description"
                      value={l.description}
                      onChange={(e) => update(l.key, { description: e.target.value })}
                      className={clsx(inputClasses, 'h-10 sm:col-span-2')}
                    />
                    <input
                      aria-label="Location"
                      placeholder="Location e.g. A-03-02"
                      value={l.location}
                      onChange={(e) => update(l.key, { location: e.target.value })}
                      className={clsx(inputClasses, 'h-10')}
                    />
                    <input
                      type="number"
                      aria-label="Pallets"
                      placeholder="Pallets"
                      value={l.pallets}
                      onChange={(e) => update(l.key, { pallets: e.target.value })}
                      className={clsx(inputClasses, 'h-10')}
                    />
                  </div>
                ) : null}
                {item ? (
                  <p className="mt-1.5 text-caption text-fg-muted">
                    On hand {item.qtyOnHand} {item.uom.toLowerCase()} · {item.pallets} pallets ·{' '}
                    {item.location}
                  </p>
                ) : null}
                {err ? (
                  <p role="alert" className="mt-1.5 text-caption font-medium text-danger">
                    {err}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          icon={<Plus aria-hidden="true" />}
          disabled={!customerId}
          onClick={() => setLines((ls) => [...ls, blankLine()])}
        >
          Add line
        </Button>
      </fieldset>

      {create.error ? (
        <StatusMessage
          kind="error"
          title="Movement not saved"
          description={create.error instanceof Error ? create.error.message : undefined}
        />
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="secondary" busy={create.isPending} onClick={() => submit(false)}>
          Save draft
        </Button>
        <Button busy={create.isPending} onClick={() => submit(true)}>
          Post now
        </Button>
      </div>
    </div>
  );
}
