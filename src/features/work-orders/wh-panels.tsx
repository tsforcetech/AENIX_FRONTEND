/**
 * FLOW-003 WP-B — warehouse panels on the job's documents: put-away (W4/W12), FEFO pick list and
 * delivery note (W6/W7), variances on the job (W3) and handling charges from activity (W14).
 */
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { ClipboardList, PackagePlus, Printer, Receipt, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { CustomerRequest, Inbound } from '@/domain/types';
import { useJobVariances } from '@/features/variances/api';
import { PendingDocsCard } from '@/features/variances/VariancesPage';
import { useProtoDb } from '@/prototype/store';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses } from '@/shared/ui/Field';
import { Logo } from '@/shared/ui/Logo';
import { DocRef, Money } from '@/shared/ui/Money';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime, formatMoney } from '@/shared/utils/format';
import {
  useHandlingProposal,
  usePickPlan,
  usePutawayPlan,
  useWhAction,
  type WhAction,
  type WorkOrderDetail,
} from './api';

function useWh() {
  const action = useWhAction();
  const qc = useQueryClient();
  const toast = useToast();
  const run = (a: WhAction, ok: string, onDone?: () => void) =>
    action.mutate(a, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['variances'] });
        toast({ title: ok });
        onDone?.();
      },
      onError: (e) =>
        toast({ title: 'Action not allowed', body: e instanceof Error ? e.message : 'Please try again.' }),
    });
  return { run, pending: action.isPending };
}

/** Floor module switch (own warehouse floor). */
export function useFloorModule(): boolean {
  return useProtoDb((db) => !!db.company.modules?.ownWarehouseFloor);
}

// ---------------------------------------------------------------------------------------------
// W4 / W12: put-away
// ---------------------------------------------------------------------------------------------

export function PutawayDialog({
  wo,
  ib,
  onClose,
}: {
  wo: WorkOrderDetail;
  ib: Inbound;
  onClose: () => void;
}) {
  const plan = usePutawayPlan(wo.id, ib.id, true);
  const { run, pending } = useWh();
  const [edits, setEdits] = useState<Record<string, { locationId?: string; pallets?: string }>>({});
  const lines = (plan.data?.lines ?? []).map((l) => ({
    ...l,
    locationId: edits[l.sku]?.locationId ?? l.locationId,
    pallets: edits[l.sku]?.pallets ?? String(l.pallets),
  }));
  const set = (sku: string, k: 'locationId' | 'pallets', v: string) =>
    setEdits((e) => ({ ...e, [sku]: { ...e[sku], [k]: v } }));
  const submit = () =>
    run(
      {
        kind: 'putaway',
        id: wo.id,
        inboundId: ib.id,
        lines: lines
          .filter((l) => l.goodQty > 0)
          .map((l) => ({ sku: l.sku, locationId: l.locationId, pallets: Number(l.pallets) || 0 })),
      },
      `${ib.number} put away — stock lots created`,
      onClose,
    );

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Confirm put-away · ${ib.number}`}
      description={
        plan.data?.isReturn
          ? 'Customer return: goods go to quarantine until inspected on the stock screen.'
          : 'Each GRN line goes to a bin. Suggested: the bin already holding the SKU, else the first ambient bin with space. Damaged units go to quarantine.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={pending} disabled={!plan.data} onClick={submit}>
            Confirm put-away
          </Button>
        </>
      }
    >
      {plan.isLoading ? (
        <StatusMessage kind="loading" title="Finding bins…" />
      ) : plan.error ? (
        <StatusMessage
          kind="error"
          title="Put-away not possible"
          description={plan.error instanceof Error ? plan.error.message : undefined}
        />
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Put-away lines">
          <table className="w-full min-w-[620px] text-left text-body-s">
            <caption className="sr-only">Put-away lines for {ib.number}</caption>
            <thead>
              <tr className="text-caption uppercase tracking-wide text-fg-muted">
                <th scope="col" className="pb-2 font-medium">
                  SKU / batch
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Good qty
                </th>
                <th scope="col" className="w-20 pb-2 pl-2 font-medium">
                  Pallets
                </th>
                <th scope="col" className="pb-2 pl-2 font-medium">
                  Bin
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.sku} className="align-top">
                  <td className="py-1.5">
                    <p className="font-mono text-[13px]">{l.sku}</p>
                    <p className="text-caption text-fg-muted">
                      {l.batch ? `Batch ${l.batch}` : 'No batch'}
                      {l.expiryDate ? ` · exp. ${formatDate(l.expiryDate)}` : ''}
                      {l.damagedQty ? ` · ${l.damagedQty} damaged → quarantine` : ''}
                    </p>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {l.goodQty} <span className="text-caption text-fg-muted">{l.uom}</span>
                  </td>
                  <td className="py-1.5 pl-2">
                    {l.goodQty > 0 ? (
                      <input
                        type="number"
                        min={1}
                        aria-label={`${l.sku} pallets`}
                        value={l.pallets}
                        onChange={(e) => set(l.sku, 'pallets', e.target.value)}
                        className={clsx(inputClasses, 'h-9 text-right')}
                      />
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2">
                    {l.goodQty > 0 ? (
                      <select
                        aria-label={`${l.sku} bin`}
                        value={l.locationId}
                        onChange={(e) => set(l.sku, 'locationId', e.target.value)}
                        className={clsx(inputClasses, 'h-9 pr-8')}
                      >
                        <option value="">Choose a bin</option>
                        {plan.data?.locations.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-caption text-fg-muted">All damaged</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// W6 / W7: pick list (FEFO) and delivery note
// ---------------------------------------------------------------------------------------------

export function PickListDialog({
  wo,
  req,
  onClose,
}: {
  wo: WorkOrderDetail;
  req: CustomerRequest;
  onClose: () => void;
}) {
  const plan = usePickPlan(wo.id, req.id, !req.picks);
  const { run, pending } = useWh();
  const confirmed = !!req.picks;
  const rows = confirmed
    ? req.lines.map((l) => {
        const picks = req.picks!.filter((p) => p.sku === l.sku);
        const qty = picks.reduce((s, p) => s + p.qty, 0);
        return { sku: l.sku, requested: l.quantity, picks, short: Math.max(0, l.quantity - qty) };
      })
    : (plan.data?.lines ?? []);
  const short = rows.reduce((s, r) => s + r.short, 0);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Pick list · ${req.number}`}
      description={
        confirmed
          ? `Picks confirmed ${formatDateTime(req.pickedAt ?? '')}. Stock leaves the lots when the POD is recorded.`
          : 'Suggested first-expiry-first-out from the customer’s available lots.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {confirmed ? 'Close' : 'Cancel'}
          </Button>
          {!confirmed ? (
            <Button
              busy={pending}
              disabled={!rows.some((r) => r.picks.length)}
              onClick={() =>
                run({ kind: 'confirmPicks', id: wo.id, requestId: req.id }, 'Picks confirmed', onClose)
              }
            >
              Confirm picks
            </Button>
          ) : null}
        </>
      }
    >
      {!confirmed && plan.isLoading ? (
        <StatusMessage kind="loading" title="Finding lots…" />
      ) : (
        <div className="space-y-3">
          {short > 0 ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-body-s text-warning"
            >
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" /> {short} unit(s) short — not
              enough available stock in the customer’s lots.
            </p>
          ) : null}
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Pick lines">
            <table className="w-full min-w-[560px] text-left text-body-s">
              <caption className="sr-only">Pick lines for {req.number}</caption>
              <thead>
                <tr className="text-caption uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="pb-2 font-medium">
                    SKU
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Bin
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Batch / expiry
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    Pick qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <PickRows key={r.sku} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function PickRows({
  row,
}: {
  row: {
    sku: string;
    requested: number;
    short: number;
    picks: { lotId: string; batch?: string; expiryDate?: string; locationCode: string; qty: number }[];
  };
}) {
  return (
    <>
      {row.picks.map((p, i) => (
        <tr key={p.lotId} className="border-t border-border-subtle">
          <td className="py-1.5 font-mono text-[13px]">{i === 0 ? row.sku : ''}</td>
          <td className="py-1.5 font-mono text-[13px]">{p.locationCode}</td>
          <td className="py-1.5">
            {p.batch ?? '—'}
            {p.expiryDate ? (
              <span className="text-caption text-fg-muted"> · exp. {formatDate(p.expiryDate)}</span>
            ) : null}
          </td>
          <td className="py-1.5 text-right font-medium tabular-nums">{p.qty}</td>
        </tr>
      ))}
      {row.short > 0 || !row.picks.length ? (
        <tr className="border-t border-border-subtle">
          <td className="py-1.5 font-mono text-[13px]">{row.picks.length ? '' : row.sku}</td>
          <td colSpan={2} className="py-1.5 text-caption font-medium text-danger">
            Short {row.short} of {row.requested}
          </td>
          <td className="py-1.5 text-right tabular-nums text-danger">−{row.short}</td>
        </tr>
      ) : null}
    </>
  );
}

/** W7: printable delivery note (dispatch note) — company header, lines with batch, signature boxes. */
export function DeliveryNoteDialog({
  wo,
  req,
  onClose,
}: {
  wo: WorkOrderDetail;
  req: CustomerRequest;
  onClose: () => void;
}) {
  const company = useProtoDb((db) => db.company);
  const picks = req.picks ?? [];
  const desc = (sku: string) => req.lines.find((l) => l.sku === sku);
  const total = picks.reduce((s, p) => s + p.qty, 0);
  const cell = 'border border-border-strong px-2 py-1';
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Delivery note ${req.dispatchNoteNumber ?? ''}`}
      description="Print and hand to the driver; the receiver signs it as the POD."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
            Print
          </Button>
        </>
      }
    >
      <article
        aria-label="Delivery note"
        data-print-root=""
        className="bg-surface px-4 py-4 text-[12px] text-fg"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Logo height={36} />
            <p className="mt-1 text-[10px] font-semibold">{company.tagline}</p>
          </div>
          <div className="max-w-xs text-[11px] leading-[1.35]">
            <p className="text-[13px] font-semibold text-brand">{company.legalName}</p>
            {company.registeredAddress.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>{company.phone}</p>
            <p>TRN {company.trn}</p>
          </div>
        </header>
        <h3 className="my-4 text-center text-[14px] font-semibold uppercase tracking-wide">Delivery note</h3>
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-semibold">Deliver to</p>
            <p className="font-semibold">{wo.customerName}</p>
            <p>{req.deliverTo}</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right">
            <dt className="font-semibold">Note no:</dt>
            <dd>{req.dispatchNoteNumber}</dd>
            <dt className="font-semibold">Request:</dt>
            <dd>{req.number}</dd>
            <dt className="font-semibold">Job:</dt>
            <dd>{wo.number}</dd>
            <dt className="font-semibold">Date:</dt>
            <dd>{formatDate(req.pickedAt ?? req.requiredBy)}</dd>
          </dl>
        </div>
        <div className="mt-4 overflow-x-auto" role="region" aria-label="Delivery note lines" tabIndex={0}>
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr>
                {['SKU', 'Description', 'Batch', 'Expiry', 'Qty', 'UOM'].map((h) => (
                  <th key={h} scope="col" className={`${cell} text-left font-semibold`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {picks.map((p) => (
                <tr key={p.lotId}>
                  <td className={cell}>{p.sku}</td>
                  <td className={cell}>{desc(p.sku)?.description ?? '—'}</td>
                  <td className={cell}>{p.batch ?? '—'}</td>
                  <td className={cell}>{p.expiryDate ? formatDate(p.expiryDate) : '—'}</td>
                  <td className={`${cell} text-right tabular-nums`}>{p.qty}</td>
                  <td className={cell}>{desc(p.sku)?.uom ?? ''}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" colSpan={4} className={`${cell} text-right font-semibold`}>
                  Total
                </th>
                <td className={`${cell} text-right font-semibold tabular-nums`}>{total}</td>
                <td className={cell} />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {['Released by (warehouse)', 'Driver', 'Received by (name, signature, stamp)'].map((label) => (
            <div key={label} className="rounded border border-border-strong px-3 pb-10 pt-2">
              <p className="font-semibold">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-[11px] text-fg-muted">
          Goods received in good order unless noted on this delivery note.
        </p>
      </article>
    </Dialog>
  );
}

/** Pick / delivery-note actions shown on a customer request (own warehouse floor). */
export function RequestPickActions({
  wo,
  req,
  locked,
}: {
  wo: WorkOrderDetail;
  req: CustomerRequest;
  locked: boolean;
}) {
  const floor = useFloorModule();
  const { run, pending } = useWh();
  const [pickOpen, setPickOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  if (!floor || (!req.picks && (locked || req.pod || req.status === 'Closed'))) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-3 py-2">
      <span className="mr-auto text-caption text-fg-muted">
        {req.picks
          ? `Picked ${req.picks.reduce((s, p) => s + p.qty, 0)} units from ${req.picks.length} lot(s)${req.dispatchNoteNumber ? ` · delivery note ${req.dispatchNoteNumber}` : ''}`
          : 'Pick from the customer’s lots (first expiry first out).'}
      </span>
      <Button
        size="sm"
        variant="secondary"
        icon={<ClipboardList aria-hidden="true" />}
        onClick={() => setPickOpen(true)}
      >
        {req.picks ? 'View pick list' : 'Generate pick list'}
      </Button>
      {req.picks ? (
        <Button
          size="sm"
          variant="secondary"
          icon={<Printer aria-hidden="true" />}
          busy={pending}
          onClick={() => {
            if (req.dispatchNoteNumber) return setNoteOpen(true);
            run({ kind: 'dispatchNote', id: wo.id, requestId: req.id }, 'Delivery note issued', () =>
              setNoteOpen(true),
            );
          }}
        >
          Print delivery note
        </Button>
      ) : null}
      {pickOpen ? <PickListDialog wo={wo} req={req} onClose={() => setPickOpen(false)} /> : null}
      {noteOpen && req.dispatchNoteNumber ? (
        <DeliveryNoteDialog wo={wo} req={req} onClose={() => setNoteOpen(false)} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// W3: variances on this job
// ---------------------------------------------------------------------------------------------

export function JobVariancesCard({ wo }: { wo: WorkOrderDetail }) {
  const { data } = useJobVariances(wo.id);
  const hasRaised =
    wo.inbounds.some((ib) => ib.grn?.status === 'Variance raised') ||
    wo.customerRequests.some((r) => r.status === 'Variance raised');
  if (!data?.length && !hasRaised) return null;
  return (
    <>
      <PendingDocsCard workOrderId={wo.id} />
      {data?.length ? (
        <Card>
          <CardHeader
            title="Variances and claims"
            description="Shortages and damage on this job’s GRNs and PODs, with the agreed outcome."
            actions={
              <Link
                to="/variances"
                search={{ q: wo.number }}
                className="text-body-s font-medium text-brand hover:underline"
              >
                All variances
              </Link>
            }
          />
          <CardBody>
            <ul className="space-y-2">
              {data.map((v) => (
                <li key={v.id}>
                  <Link
                    to="/variances/$id"
                    params={{ id: v.id }}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                  >
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        <DocRef>{v.number}</DocRef>
                        <span className="text-caption text-fg-muted">
                          {v.source} {v.sourceRef}
                        </span>
                      </span>
                      <span className="block text-caption text-fg-muted">
                        Short {v.shortQty} · damaged {v.damagedQty}
                        {v.outcome ? ` · ${v.outcome}` : ''}
                        {v.value !== undefined ? ` · ${formatMoney(v.value)}` : ''}
                      </span>
                    </span>
                    <StatusBadge status={v.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// W14: handling charges from warehouse activity
// ---------------------------------------------------------------------------------------------

export function HandlingChargesCard({ wo }: { wo: WorkOrderDetail }) {
  const { data } = useHandlingProposal(wo.id);
  const { run, pending } = useWh();
  const [qty, setQty] = useState<Record<string, string>>({});
  if (!data?.length) return null;
  const lines = data.map((p) => {
    const q = qty[p.ref] !== undefined ? Number(qty[p.ref]) || 0 : p.quantity;
    return { ...p, quantity: q, amount: Math.round(q * p.unitPrice * 100) / 100 };
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const locked = !!wo.invoiceId || wo.status === 'Cancelled';
  return (
    <Card>
      <CardHeader
        title="Handling charges"
        description="Proposed from verified GRNs (handling in) and closed PODs (handling out) not billed yet."
        actions={
          !locked ? (
            <Button
              size="sm"
              icon={<PackagePlus aria-hidden="true" />}
              busy={pending}
              onClick={() =>
                run(
                  { kind: 'addHandling', id: wo.id, lines },
                  `${lines.length} handling line${lines.length === 1 ? '' : 's'} added to the job charges`,
                )
              }
            >
              Add to job charges
            </Button>
          ) : null
        }
      />
      <CardBody>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Proposed handling charges">
          <table className="w-full min-w-[560px] text-left text-body-s">
            <caption className="sr-only">Proposed handling charges</caption>
            <thead>
              <tr className="text-caption uppercase tracking-wide text-fg-muted">
                <th scope="col" className="pb-2 font-medium">
                  Document
                </th>
                <th scope="col" className="w-28 pb-2 font-medium">
                  Quantity
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Rate
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.ref} className="border-t border-border-subtle align-top">
                  <td className="py-1.5">
                    <p className="flex items-center gap-2">
                      <Receipt aria-hidden="true" className="size-4 text-fg-muted" />
                      {l.description}
                    </p>
                    <p className="text-caption text-fg-muted">
                      {formatDate(l.date)} · {l.units} {l.uom.toLowerCase()}
                      {l.estimated ? ' · pallets estimated from the cargo' : ''}
                    </p>
                    {l.checkQuantity ? (
                      <Badge tone="warning">Check quantity — pallets not known</Badge>
                    ) : null}
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        aria-label={`${l.description} quantity`}
                        value={qty[l.ref] ?? String(l.quantity)}
                        disabled={locked}
                        onChange={(e) => setQty((q) => ({ ...q, [l.ref]: e.target.value }))}
                        className={clsx(inputClasses, 'h-9 text-right')}
                      />
                      <span className="text-caption text-fg-muted">{l.unit}</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-right">
                    <Money amount={l.unitPrice} muted />
                  </td>
                  <td className="py-1.5 text-right font-medium">
                    <Money amount={l.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <th scope="row" colSpan={3} className="py-2 text-right font-semibold">
                  Total
                </th>
                <td className="py-2 text-right font-semibold">
                  <Money amount={total} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {locked ? (
          <p className="mt-2 text-caption text-fg-muted">
            The job is invoiced or cancelled — bill these on a separate invoice.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
