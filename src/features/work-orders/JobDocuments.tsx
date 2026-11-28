import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  Plus,
  Warehouse,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { jobStock } from '@/domain/stock';
import type { CustomerRequest, DocLine, Inbound } from '@/domain/types';
import { useProtoDb } from '@/prototype/store';
import { AttachmentChip } from '@/shared/ui/Attachment';
import { Logo } from '@/shared/ui/Logo';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, SelectField, TextField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { ReconciliationTable } from '@/shared/ui/ReconciliationTable';
import {
  GRN_FIELDS,
  PL_FIELDS,
  POD_FIELDS,
  REQUEST_FIELDS,
  SpreadsheetImport,
  type ImportedRow,
} from '@/shared/ui/SpreadsheetImport';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import {
  availableToRelease,
  grnResult,
  hasReceivedStock,
  inboundStage,
  podResult,
  useAddInbound,
  useCreateRequest,
  useDocAction,
  warehouseVendorOf,
  type DocAction,
  type InboundStage,
  type InboundHeader,
  type WorkOrderDetail,
} from './api';
import {
  HandlingChargesCard,
  JobVariancesCard,
  PutawayDialog,
  RequestPickActions,
  useFloorModule,
} from './wh-panels';

const PROTO_TODAY = '2026-11-23';

function useRun() {
  const doc = useDocAction();
  const toast = useToast();
  const qc = useQueryClient();
  const run = (a: DocAction, ok: string, onDone?: () => void) =>
    doc.mutate(a, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['variances'] }); // FLOW-003 W3: variance records
        toast({ title: ok });
        onDone?.();
      },
      onError: (e) =>
        toast({ title: 'Action not allowed', body: e instanceof Error ? e.message : 'Please try again.' }),
    });
  return { run, pending: doc.isPending };
}

// ---------------------------------------------------------------------------------------------
// Running stock on the job (many inbounds and outbounds over time)
// ---------------------------------------------------------------------------------------------

export function JobStockCard({ wo }: { wo: WorkOrderDetail }) {
  const rows = jobStock(wo);
  const t = rows.reduce(
    (acc, r) => ({
      received: acc.received + r.received,
      damaged: acc.damaged + r.damaged,
      delivered: acc.delivered + r.delivered,
      reserved: acc.reserved + r.reserved,
      onHand: acc.onHand + r.onHand,
      available: acc.available + r.available,
    }),
    { received: 0, damaged: 0, delivered: 0, reserved: 0, onHand: 0, available: 0 },
  );
  return (
    <Card>
      <CardHeader
        title="Stock on this job"
        description="Running balance across every inbound GRN and every delivered release (good units only)."
      />
      <CardBody>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-body-s text-fg-muted">
            No stock yet. Add an inbound receipt with the customer’s product list.
          </p>
        ) : (
          <div
            className="overflow-x-auto rounded-lg border border-border-subtle"
            tabIndex={0}
            role="region"
            aria-label="Stock on this job"
          >
            <table className="w-full min-w-[720px] text-left text-body-s">
              <caption className="sr-only">Stock per SKU on {wo.number}</caption>
              <thead>
                <tr className="border-b border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="px-3 py-2 font-medium">
                    SKU
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Description
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Received
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Damaged
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Delivered
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Reserved
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    On hand
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Available
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sku} className="border-b border-border-subtle last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">{r.sku}</td>
                    <td className="px-3 py-2">
                      {r.description} <span className="text-caption text-fg-muted">{r.uom}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.received}</td>
                    <td
                      className={clsx(
                        'px-3 py-2 text-right tabular-nums',
                        r.damaged > 0 && 'font-medium text-danger',
                      )}
                    >
                      {r.damaged || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.delivered}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.reserved || '—'}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{r.onHand}</td>
                    <td
                      className={clsx(
                        'px-3 py-2 text-right font-semibold tabular-nums',
                        r.available < 0 && 'text-danger',
                      )}
                    >
                      {r.available}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-canvas font-semibold">
                  <th scope="row" colSpan={2} className="px-3 py-2 text-left">
                    Total ({rows.length} SKU{rows.length === 1 ? '' : 's'})
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{t.received}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.damaged || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.delivered}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.reserved || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.onHand}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.available}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Inbound receipts (many): customer PL → warehouse → GRN upload → comparison
// ---------------------------------------------------------------------------------------------

const stageOrder: Record<InboundStage, number> = {
  'Draft PL': 0,
  Expected: 1,
  'Variance raised': 2,
  'GRN uploaded': 3,
  Verified: 4,
};

export function InboundCard({ wo }: { wo: WorkOrderDetail }) {
  const [newOpen, setNewOpen] = useState(false);
  const closed = wo.status === 'Completed' || wo.status === 'Cancelled';
  const inbounds = [...wo.inbounds].sort(
    (a, b) =>
      stageOrder[inboundStage(a)] - stageOrder[inboundStage(b)] || b.expectedAt.localeCompare(a.expectedAt),
  );
  const open = inbounds.filter((ib) => inboundStage(ib) !== 'Verified').length;
  return (
    <Card>
      <CardHeader
        title="Inbound receipts · PL → GRN"
        description="Every consignment the customer sends: their product list (PL / ASN) goes to the warehouse, the GRN comes back and is cross-checked. Goods arrive many times over a storage job."
        actions={
          !closed ? (
            <Button size="sm" icon={<Plus aria-hidden="true" />} onClick={() => setNewOpen(true)}>
              New inbound
            </Button>
          ) : null
        }
      />
      <CardBody>
        {inbounds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-body-s text-fg-muted">
            No inbound yet. Add one when the customer sends a product list — import it straight from their
            Excel file.
          </p>
        ) : (
          <>
            <p className="mb-3 text-caption text-fg-muted">
              {inbounds.length} inbound{inbounds.length === 1 ? '' : 's'} · {open} open
            </p>
            <ul className="space-y-3">
              {inbounds.map((ib) => (
                <InboundItem
                  key={ib.id}
                  wo={wo}
                  ib={ib}
                  closed={closed}
                  defaultOpen={inboundStage(ib) !== 'Verified'}
                />
              ))}
            </ul>
          </>
        )}
      </CardBody>
      {newOpen ? <NewInboundDialog wo={wo} onClose={() => setNewOpen(false)} /> : null}
    </Card>
  );
}

function InboundItem({
  wo,
  ib,
  closed,
  defaultOpen,
}: {
  wo: WorkOrderDetail;
  ib: Inbound;
  closed: boolean;
  defaultOpen: boolean;
}) {
  const { run, pending } = useRun();
  const [expanded, setExpanded] = useState(defaultOpen);
  const [editPl, setEditPl] = useState(false);
  const [grnOpen, setGrnOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [putawayOpen, setPutawayOpen] = useState(false);
  const floor = useFloorModule();
  const pl = ib.packingList;
  const grn = ib.grn;
  const stage = inboundStage(ib);
  const result = grnResult(ib);
  const plQty = pl.lines.reduce((s, l) => s + l.quantity, 0);
  const bodyId = useId();

  return (
    <li className="rounded-xl border border-border-subtle">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3 text-left hover:bg-canvas"
      >
        <ChevronRight
          aria-hidden="true"
          className={clsx('size-4 shrink-0 text-fg-muted transition-transform', expanded && 'rotate-90')}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <DocRef>{ib.number}</DocRef>
            <StatusBadge
              status={
                stage === 'Draft PL'
                  ? 'Draft'
                  : stage === 'Expected'
                    ? 'Sent to warehouse'
                    : stage === 'GRN uploaded'
                      ? 'Uploaded'
                      : stage
              }
            />
            {result ? (
              <StatusBadge
                status={
                  result.ok
                    ? 'Match'
                    : `${result.mismatches} line${result.mismatches === 1 ? '' : 's'} differ`
                }
              />
            ) : null}
            {ib.kind === 'Return' ? <StatusBadge status="Customer return" /> : null}
            {ib.putawayDone ? <StatusBadge status="Put away" /> : null}
          </span>
          <span className="mt-0.5 block truncate text-caption text-fg-muted">
            {ib.reference || 'No reference'} · expected {formatDate(ib.expectedAt)}
            {ib.expectedTime ? ` ${ib.expectedTime}` : ''} · {pl.number}: {pl.lines.length} SKU
            {pl.lines.length === 1 ? '' : 's'}, {plQty} units{grn ? ` · ${grn.number}` : ''}
          </span>
        </span>
      </button>

      {expanded ? (
        <div id={bodyId} className="space-y-4 border-t border-border-subtle px-4 py-4">
          <section aria-label={`${pl.number} product list`} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-body-s font-semibold">
                Product list <DocRef className="ml-1">{pl.number}</DocRef>
                {pl.source ? (
                  <span className="ml-2 text-caption font-normal text-fg-muted">via {pl.source}</span>
                ) : null}
              </h4>
              <div className="flex flex-wrap gap-2">
                {!closed && pl.status === 'Draft' ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setEditPl(true)}>
                      Edit PL
                    </Button>
                    <Button
                      size="sm"
                      icon={<Send aria-hidden="true" />}
                      busy={pending}
                      disabled={!pl.lines.length}
                      onClick={() =>
                        run(
                          { kind: 'sendPl', id: wo.id, inboundId: ib.id },
                          `${pl.number} sent to the warehouse team`,
                        )
                      }
                    >
                      Send PL to warehouse
                    </Button>
                  </>
                ) : null}
                {!closed && pl.status === 'Sent to warehouse' && !grn ? (
                  <Button size="sm" icon={<Upload aria-hidden="true" />} onClick={() => setGrnOpen(true)}>
                    Upload GRN
                  </Button>
                ) : null}
              </div>
            </div>
            {pl.attachment ? <AttachmentChip file={pl.attachment} /> : null}
            {!grn ? <LinesTable lines={pl.lines} caption={`${pl.number} lines`} /> : null}
            {pl.sentAt ? (
              <p className="text-caption text-fg-muted">Sent to warehouse team {formatDateTime(pl.sentAt)}</p>
            ) : null}
            {pl.status === 'Sent to warehouse' && !grn ? (
              <p className="flex items-center gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-body-s text-info">
                <PackageCheck aria-hidden="true" className="size-4 shrink-0" /> Waiting for the warehouse
                team’s GRN.
              </p>
            ) : null}
          </section>

          {grn ? (
            <section
              aria-label={`${grn.number} goods received note`}
              className="space-y-3 border-t border-border-subtle pt-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-body-s font-semibold">
                  Goods received note <DocRef className="ml-1">{grn.number}</DocRef>
                </h4>
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
                      onClick={() =>
                        run({ kind: 'verifyGrn', id: wo.id, inboundId: ib.id }, `${grn.number} verified`)
                      }
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
                        run(
                          { kind: 'grnVariance', id: wo.id, inboundId: ib.id },
                          `Variance raised on ${grn.number}`,
                        )
                      }
                    >
                      Raise variance
                    </Button>
                  )}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2">
                <span className="text-caption text-fg-muted">
                  {grn.customerGrnNumber
                    ? `Customer GRN ${grn.customerGrnNumber} issued ${formatDateTime(grn.customerGrnIssuedAt ?? '')}`
                    : 'Send the customer Aenix’s own GRN for this receipt.'}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FileText aria-hidden="true" />}
                  busy={pending}
                  onClick={() => {
                    if (grn.customerGrnNumber) return setDocOpen(true);
                    run({ kind: 'issueCustomerGrn', id: wo.id, inboundId: ib.id }, 'Customer GRN issued');
                    setDocOpen(true);
                  }}
                >
                  {grn.customerGrnNumber ? 'View customer GRN' : 'Issue customer GRN'}
                </Button>
              </div>
              {floor && (grn.status === 'Verified' || grn.status === 'Variance raised') ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2">
                  <span className="text-caption text-fg-muted">
                    {ib.putawayDone
                      ? 'Put-away confirmed — lots are on the stock screen with bin, batch and expiry.'
                      : ib.kind === 'Return'
                        ? 'Customer return: put the goods in quarantine until inspected.'
                        : 'Assign each line to a bin to create lot-level stock.'}
                  </span>
                  {!ib.putawayDone && !closed ? (
                    <Button
                      size="sm"
                      icon={<Warehouse aria-hidden="true" />}
                      onClick={() => setPutawayOpen(true)}
                    >
                      Confirm put-away
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {docOpen && grn ? <CustomerGrnDialog wo={wo} ib={ib} onClose={() => setDocOpen(false)} /> : null}
      {editPl ? <PlEditorDialog wo={wo} ib={ib} onClose={() => setEditPl(false)} /> : null}
      {grnOpen ? <GrnUploadDialog wo={wo} ib={ib} onClose={() => setGrnOpen(false)} /> : null}
      {putawayOpen ? <PutawayDialog wo={wo} ib={ib} onClose={() => setPutawayOpen(false)} /> : null}
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

type DraftLine = {
  sku: string;
  description: string;
  quantity: string;
  uom: string;
  /** Optional detail carried from the customer's or vendor's Excel. */
  extra?: Pick<DocLine, 'barcode' | 'batch' | 'productionDate' | 'expiryDate' | 'cbm'>;
};

const blankLine = (): DraftLine => ({ sku: '', description: '', quantity: '1', uom: 'Ctn' });

/** Validates draft PL lines; returns the clean lines or an error message. */
function cleanPlLines(lines: DraftLine[]): DocLine[] | string {
  const clean = lines.filter((l) => l.sku.trim() || l.description.trim());
  const skus = clean.map((l) => l.sku.trim().toUpperCase());
  if (!clean.length) return 'Add at least one product.';
  if (clean.some((l) => !l.sku.trim() || !(Number(l.quantity) > 0)))
    return 'Every product needs a SKU and a quantity above 0.';
  if (new Set(skus).size !== skus.length) return 'Each SKU can appear only once — merge duplicate lines.';
  return clean.map((l) => ({
    sku: l.sku.trim().toUpperCase(),
    description: l.description.trim() || l.sku.trim().toUpperCase(),
    quantity: Math.round(Number(l.quantity)),
    uom: l.uom.trim() || 'Pcs',
    ...l.extra,
  }));
}

/** Imported PL rows → draft lines; quantities of a repeated SKU are added together. */
function plRowsToDraft(rows: ImportedRow[]): DraftLine[] {
  const map = new Map<string, DraftLine>();
  for (const r of rows) {
    const sku = String(r.sku ?? '')
      .trim()
      .toUpperCase();
    if (!sku) continue;
    const prev = map.get(sku);
    const qty = Number(r.quantity) || 0;
    const cbm = (prev?.extra?.cbm ?? 0) + (Number(r.cbm) || 0);
    map.set(sku, {
      sku,
      description: prev?.description || String(r.description ?? ''),
      quantity: String((Number(prev?.quantity) || 0) + qty),
      uom: prev?.uom || String(r.uom ?? 'Pcs'),
      // Repeated SKUs are merged (quantities and CBM added); first batch/dates are kept.
      extra: {
        barcode: prev?.extra?.barcode ?? (r.barcode ? String(r.barcode) : undefined),
        batch: prev?.extra?.batch ?? (r.batch ? String(r.batch) : undefined),
        productionDate:
          prev?.extra?.productionDate ?? (r.productionDate ? String(r.productionDate) : undefined),
        expiryDate: prev?.extra?.expiryDate ?? (r.expiryDate ? String(r.expiryDate) : undefined),
        cbm: cbm ? Math.round(cbm * 10000) / 10000 : undefined,
      },
    });
  }
  return [...map.values()];
}

/** Editable PL lines + "Import from Excel". */
function PlLinesEditor({
  lines,
  setLines,
  onImportClick,
}: {
  lines: DraftLine[];
  setLines: (fn: (ls: DraftLine[]) => DraftLine[]) => void;
  onImportClick: () => void;
}) {
  const set = (i: number, k: keyof DraftLine, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-s font-medium">
          Product lines{' '}
          <span className="font-normal text-fg-muted">
            · {lines.length} SKUs · {total} units
          </span>
        </p>
        <Button
          size="sm"
          variant="secondary"
          icon={<FileSpreadsheet aria-hidden="true" />}
          onClick={onImportClick}
        >
          Import from Excel
        </Button>
      </div>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
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
              inputMode="numeric"
              aria-label={`Product ${i + 1} quantity`}
              value={l.quantity}
              onChange={(e) => set(i, 'quantity', e.target.value)}
              className={clsx(inputClasses, 'h-10 text-right tabular-nums')}
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
      </div>
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus aria-hidden="true" />}
        onClick={() => setLines((ls) => [...ls, blankLine()])}
      >
        Add product
      </Button>
    </div>
  );
}

function NewInboundDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const add = useAddInbound();
  const toast = useToast();
  const [reference, setReference] = useState('');
  const [expectedAt, setExpectedAt] = useState('2026-11-30');
  const [header, setHeader] = useState<InboundHeader>({ kind: 'Receipt' });
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [file, setFile] = useState<{ name: string; sizeKb: number }>();
  const [send, setSend] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string>();

  const submit = () => {
    const clean = cleanPlLines(lines);
    if (typeof clean === 'string') return setError(clean);
    if (reference.trim().length < 2)
      return setError('Enter the customer’s reference (ASN, container, AWB or truck no.).');
    setError(undefined);
    add.mutate(
      {
        id: wo.id,
        reference: reference.trim(),
        expectedAt,
        lines: clean,
        send,
        header,
        source: file ? 'Excel import' : 'Staff',
        attachment: file
          ? {
              fileName: file.name,
              sizeKb: file.sizeKb,
              uploadedAt: new Date().toISOString(),
              uploadedBy: 'Staff',
            }
          : undefined,
      },
      {
        onSuccess: (ib) => {
          toast({
            title: `${ib.number} added`,
            body: send
              ? `${ib.packingList.number} sent to the warehouse team.`
              : 'Saved as a draft product list.',
          });
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Could not add the inbound.'),
      },
    );
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        size="lg"
        title="New inbound receipt"
        description={`A new consignment for ${wo.customerName}. Import their product list from Excel or type the lines.`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button busy={add.isPending} onClick={submit}>
              {send ? 'Add & send PL to warehouse' : 'Save as draft'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Customer reference"
              required
              placeholder="ASN / container / AWB / truck no."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <TextField
                label="Expected on"
                type="date"
                required
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
              <TextField
                label="Time"
                type="time"
                value={header.expectedTime ?? ''}
                onChange={(e) => setHeader((h) => ({ ...h, expectedTime: e.target.value || undefined }))}
              />
            </div>
            <SelectField
              label="Type"
              options={[
                { value: 'Receipt', label: 'Receipt (new stock)' },
                { value: 'Return', label: 'Customer return (to quarantine)' },
              ]}
              value={header.kind ?? 'Receipt'}
              onChange={(e) =>
                setHeader((h) => ({ ...h, kind: e.target.value === 'Return' ? 'Return' : 'Receipt' }))
              }
            />
          </div>
          <details className="rounded-lg border border-border-subtle px-3 py-2">
            <summary className="cursor-pointer text-body-s font-medium">
              Shipment details{' '}
              <span className="font-normal text-fg-muted">— ASN, BOE, container, seal, BL (optional)</span>
            </summary>
            <div className="mt-3 grid gap-3 pb-1 sm:grid-cols-3">
              {(
                [
                  ['asnNo', 'ASN #'],
                  ['boeNo', 'BOE (bill of entry)'],
                  ['containerNo', 'Container no.'],
                  ['sealNo', 'Seal no.'],
                  ['blNo', 'BL / AWB no.'],
                  ['supplierName', 'Supplier'],
                  ['location', 'Warehouse location'],
                ] as const
              ).map(([k, label]) => (
                <TextField
                  key={k}
                  label={label}
                  value={header[k] ?? ''}
                  onChange={(e) => setHeader((h) => ({ ...h, [k]: e.target.value || undefined }))}
                />
              ))}
            </div>
          </details>
          {file ? (
            <p className="flex items-center gap-2 text-caption text-fg-muted">
              <FileSpreadsheet aria-hidden="true" className="size-4 text-success" /> Imported from {file.name}{' '}
              — attached to the PL.
            </p>
          ) : null}
          <PlLinesEditor lines={lines} setLines={setLines} onImportClick={() => setImportOpen(true)} />
          <label className="flex items-center gap-2 text-body-s">
            <input
              type="checkbox"
              checked={send}
              onChange={(e) => setSend(e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            Send the PL to the warehouse team now
          </label>
          {error ? (
            <p role="alert" className="text-caption font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import product list"
        fields={PL_FIELDS}
        templateKey={`PL:${wo.customerId}`}
        partyName={wo.customerName}
        onImport={(rows, f) => {
          setLines(() => plRowsToDraft(rows));
          setFile(f);
        }}
      />
    </>
  );
}

function PlEditorDialog({ wo, ib, onClose }: { wo: WorkOrderDetail; ib: Inbound; onClose: () => void }) {
  const { run, pending } = useRun();
  const [lines, setLines] = useState<DraftLine[]>(
    ib.packingList.lines.length
      ? ib.packingList.lines.map((l) => ({ ...l, quantity: String(l.quantity) }))
      : [blankLine()],
  );
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string>();

  const save = () => {
    const clean = cleanPlLines(lines);
    if (typeof clean === 'string') return setError(clean);
    run(
      { kind: 'savePl', id: wo.id, inboundId: ib.id, lines: clean },
      `${ib.packingList.number} saved`,
      onClose,
    );
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        size="lg"
        title={`Product list ${ib.packingList.number}`}
        description={`What the warehouse team should expect for ${ib.number}.`}
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
        <PlLinesEditor lines={lines} setLines={setLines} onImportClick={() => setImportOpen(true)} />
        {error ? (
          <p role="alert" className="mt-2 text-caption font-medium text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import product list"
        fields={PL_FIELDS}
        templateKey={`PL:${wo.customerId}`}
        partyName={wo.customerName}
        onImport={(rows) => setLines(() => plRowsToDraft(rows))}
      />
    </>
  );
}

function FileField({
  label,
  file,
  onFile,
  error,
  note,
}: {
  label: string;
  file?: { name: string; sizeKb: number };
  onFile: (f?: File) => void;
  error?: string;
  note?: string;
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
        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv"
        aria-invalid={!!error || undefined}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onFile(e.target.files?.[0])}
        className="block w-full text-body-s file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-body-s file:font-medium hover:file:bg-surface-muted"
      />
      <p id={`${id}-hint`} className="text-caption text-fg-muted">
        {file
          ? `${file.name} · ${file.sizeKb} KB`
          : (note ?? 'PDF, image or the Excel/CSV file. The prototype keeps the file name only.')}
      </p>
      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const fileMeta = (f: File) => ({ name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) });
const asAttachment = (f: { name: string; sizeKb: number }) => ({
  fileName: f.name,
  sizeKb: f.sizeKb,
  uploadedAt: new Date().toISOString(),
  uploadedBy: 'Staff',
});

type GrnRow = {
  sku: string;
  expected: number;
  received: string;
  damaged: string;
  remarks: string;
  extra?: { batch?: string; productionDate?: string; expiryDate?: string; cbm?: number };
};

function GrnUploadDialog({ wo, ib, onClose }: { wo: WorkOrderDetail; ib: Inbound; onClose: () => void }) {
  const { run, pending } = useRun();
  const pl = ib.packingList;
  const wh = warehouseVendorOf(wo);
  const [file, setFile] = useState<{ name: string; sizeKb: number }>();
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(PROTO_TODAY);
  const [rows, setRows] = useState<GrnRow[]>(
    pl.lines.map((l) => ({
      sku: l.sku,
      expected: l.quantity,
      received: String(l.quantity),
      damaged: '0',
      remarks: '',
    })),
  );
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState<string>();
  const [errors, setErrors] = useState<{ file?: string; number?: string; rows?: string }>({});
  const set = (i: number, k: 'received' | 'damaged' | 'remarks', v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const applyImport = (data: ImportedRow[], f: { name: string; sizeKb: number }) => {
    const bySku = new Map<
      string,
      { received: number; damaged: number; remarks: string; extra: NonNullable<GrnRow['extra']> }
    >();
    for (const r of data) {
      const sku = String(r.sku ?? '')
        .trim()
        .toUpperCase();
      if (!sku) continue;
      const prev = bySku.get(sku);
      bySku.set(sku, {
        received: (prev?.received ?? 0) + (Number(r.receivedQty) || 0),
        damaged: (prev?.damaged ?? 0) + (Number(r.damagedQty) || 0),
        remarks: [prev?.remarks, r.remarks ? String(r.remarks) : ''].filter(Boolean).join('; '),
        extra: {
          batch: prev?.extra.batch ?? (r.batch ? String(r.batch) : undefined),
          productionDate:
            prev?.extra.productionDate ?? (r.productionDate ? String(r.productionDate) : undefined),
          expiryDate: prev?.extra.expiryDate ?? (r.expiryDate ? String(r.expiryDate) : undefined),
          cbm: (prev?.extra.cbm ?? 0) + (Number(r.cbm) || 0) || undefined,
        },
      });
    }
    const next: GrnRow[] = pl.lines.map((l) => {
      const g = bySku.get(l.sku);
      bySku.delete(l.sku);
      return {
        sku: l.sku,
        expected: l.quantity,
        received: String(g?.received ?? 0), // missing in the GRN file = not received
        damaged: String(g?.damaged ?? 0),
        remarks: g?.remarks ?? '',
        extra: g?.extra,
      };
    });
    for (const [sku, g] of bySku)
      next.push({
        sku,
        expected: 0,
        received: String(g.received),
        damaged: String(g.damaged),
        remarks: g.remarks,
      });
    setRows(next);
    setImported(`${data.length} rows imported from ${f.name}`);
    if (!file) setFile(f);
  };

  const submit = () => {
    const e: typeof errors = {};
    if (!file) e.file = 'Attach the signed GRN (PDF/photo) or the GRN Excel from the warehouse.';
    if (number.trim().length < 3) e.number = 'Enter the GRN number.';
    if (
      rows.some(
        (r) =>
          !(Number(r.received) >= 0) || !(Number(r.damaged) >= 0) || Number(r.damaged) > Number(r.received),
      )
    )
      e.rows = 'Quantities cannot be negative, and damaged cannot exceed received.';
    setErrors(e);
    if (Object.keys(e).length) return;
    run(
      {
        kind: 'uploadGrn',
        id: wo.id,
        inboundId: ib.id,
        grn: {
          number: number.trim().toUpperCase(),
          receivedAt: `${date}T12:00:00+04:00`,
          attachment: asAttachment(file!),
          lines: rows.map((r) => ({
            sku: r.sku,
            receivedQty: Math.round(Number(r.received) || 0),
            damagedQty: Math.round(Number(r.damaged) || 0),
            remarks: r.remarks.trim() || undefined,
            ...r.extra,
          })),
        },
      },
      `${number.trim().toUpperCase()} uploaded — compare it with ${pl.number}`,
      onClose,
    );
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        size="lg"
        title={`Upload GRN for ${ib.number}`}
        description={`What ${wh.name} actually received against ${pl.number}. Import their GRN Excel or type the quantities.`}
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
          <FileField
            label="GRN document"
            file={file}
            onFile={(f) => setFile(f ? fileMeta(f) : undefined)}
            error={errors.file}
          />
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
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <p className="text-body-s font-medium">Received quantities</p>
            <Button
              size="sm"
              variant="secondary"
              icon={<FileSpreadsheet aria-hidden="true" />}
              onClick={() => setImportOpen(true)}
            >
              Import GRN from Excel
            </Button>
          </div>
          {imported ? (
            <p role="status" className="text-caption text-success sm:col-span-2">
              {imported}. Lines not in the file are set to 0 received; extra SKUs are kept as “not expected”.
            </p>
          ) : null}
          <div
            className="max-h-72 overflow-auto sm:col-span-2"
            tabIndex={0}
            role="region"
            aria-label="Received quantities per product"
          >
            <table className="w-full min-w-[560px] text-left text-body-s">
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
                    <td className="py-1 font-mono text-[13px]">
                      {r.sku}
                      {r.expected === 0 ? (
                        <span className="ml-1 font-sans text-caption text-warning">not on PL</span>
                      ) : null}
                    </td>
                    <td className="py-1 text-right tabular-nums">{r.expected}</td>
                    <td className="py-1 pl-2">
                      <input
                        inputMode="numeric"
                        aria-label={`${r.sku} received quantity`}
                        value={r.received}
                        onChange={(e) => set(i, 'received', e.target.value)}
                        className={clsx(inputClasses, 'h-9 text-right tabular-nums')}
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        inputMode="numeric"
                        aria-label={`${r.sku} damaged quantity`}
                        value={r.damaged}
                        onChange={(e) => set(i, 'damaged', e.target.value)}
                        className={clsx(inputClasses, 'h-9 text-right tabular-nums')}
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
          </div>
          {errors.rows ? (
            <p role="alert" className="text-caption font-medium text-danger sm:col-span-2">
              {errors.rows}
            </p>
          ) : null}
        </div>
      </Dialog>
      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import GRN"
        fields={GRN_FIELDS}
        templateKey={`GRN:${wh.id}`}
        partyName={wh.name}
        onImport={applyImport}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Outbound: customer request → vendor / warehouse → POD upload → comparison
// ---------------------------------------------------------------------------------------------

function CustomerRequestsList({ wo }: { wo: WorkOrderDetail }) {
  const [newOpen, setNewOpen] = useState(false);
  const closed = wo.status === 'Completed' || wo.status === 'Cancelled' || wo.status === 'Draft';
  return (
    <Card>
      <CardHeader
        title="Outbound releases · request → POD"
        description="Every out-bond / delivery request the customer makes while goods are stored, each closed by the vendor’s or warehouse’s POD (cross-checked)."
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

/** Outbound releases plus the FLOW-003 job panels: variances (W3) and handling charges (W14). */
export function CustomerRequestsCard({ wo }: { wo: WorkOrderDetail }) {
  return (
    <>
      <CustomerRequestsList wo={wo} />
      <JobVariancesCard wo={wo} />
      <HandlingChargesCard wo={wo} />
    </>
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
                {req.pod.receiverContact ? ` (${req.pod.receiverContact})` : ''}
                {vendorName ? ` · ${vendorName}` : ''}
              </p>
            </div>
            {req.pod.exceptions ? (
              <p className="rounded-lg bg-warning-subtle px-3 py-2 text-body-s text-warning">
                <span className="font-semibold">Exceptions on POD:</span> {req.pod.exceptions}
              </p>
            ) : null}
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

      <RequestPickActions wo={wo} req={req} locked={locked} />

      {sendOpen ? <SendRequestDialog wo={wo} req={req} onClose={() => setSendOpen(false)} /> : null}
      {podOpen ? <PodUploadDialog wo={wo} req={req} onClose={() => setPodOpen(false)} /> : null}
    </li>
  );
}

function NewRequestDialog({ wo, onClose }: { wo: WorkOrderDetail; onClose: () => void }) {
  const create = useCreateRequest();
  const toast = useToast();
  const stocked = hasReceivedStock(wo);
  // Releasable SKUs: running stock once goods were received; otherwise the SKUs on the product lists.
  const known: DocLine[] = stocked
    ? jobStock(wo)
        .filter((s) => s.onHand > 0)
        .map((s) => ({ sku: s.sku, description: s.description, quantity: s.available, uom: s.uom }))
    : [...new Map(wo.inbounds.flatMap((ib) => ib.packingList.lines).map((l) => [l.sku, l])).values()];
  const avail = stocked ? availableToRelease(wo) : undefined;
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState<string>();
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

  /** Excel release list → quantities on known SKUs; unknown SKUs are added (and then fail the stock check). */
  const applyImport = (data: ImportedRow[], f: { name: string }) => {
    const qty = new Map<string, number>();
    const meta = new Map<string, ImportedRow>();
    for (const r of data) {
      const sku = String(r.sku ?? '')
        .trim()
        .toUpperCase();
      if (!sku) continue;
      qty.set(sku, (qty.get(sku) ?? 0) + (Number(r.quantity) || 0));
      meta.set(sku, r);
    }
    setRows((rs) => {
      const next = rs.map((r) => {
        const q = qty.get(r.sku.trim().toUpperCase());
        qty.delete(r.sku.trim().toUpperCase());
        return { ...r, quantity: String(q ?? 0) };
      });
      for (const [sku, q] of qty) {
        const m = meta.get(sku);
        next.push({
          sku,
          description: String(m?.description ?? sku),
          quantity: String(q),
          uom: String(m?.uom ?? 'Pcs'),
        });
      }
      return next;
    });
    setImported(`${data.length} rows imported from ${f.name}`);
  };

  const submit = () => {
    const rowErr: Record<number, string> = {};
    rows.forEach((r, i) => {
      const q = Number(r.quantity);
      const a = Math.max(0, avail?.get(r.sku.trim().toUpperCase()) ?? 0);
      if (q > 0 && avail && q > a)
        rowErr[i] = a === 0 ? 'Not in stock on this job' : `Only ${a} good units available to release`;
    });
    const lines = rows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        sku: r.sku.trim().toUpperCase(),
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
    <>
      <Dialog
        open
        onClose={onClose}
        size="lg"
        title="New release request"
        description="The customer’s out-bond / delivery request. Releases can happen many times while goods are stored."
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body-s font-medium">Items</p>
              <Button
                size="sm"
                variant="secondary"
                icon={<FileSpreadsheet aria-hidden="true" />}
                onClick={() => setImportOpen(true)}
              >
                Import from Excel
              </Button>
            </div>
            {imported ? (
              <p role="status" className="text-caption text-success">
                {imported}. Check the quantities against available stock below.
              </p>
            ) : null}
            {rows.map((r, i) => (
              <div key={i} className="space-y-1">
                <div className="grid grid-cols-[1fr_2fr_90px_70px] gap-2">
                  <input
                    aria-label={`Item ${i + 1} SKU`}
                    placeholder="SKU"
                    value={r.sku}
                    readOnly={known.some((k) => k.sku === r.sku)}
                    onChange={(e) => set(i, 'sku', e.target.value)}
                    className={clsx(inputClasses, 'h-10 font-mono read-only:bg-surface-muted')}
                  />
                  <input
                    aria-label={`Item ${i + 1} description`}
                    placeholder="Description"
                    value={r.description}
                    readOnly={known.some((k) => k.sku === r.sku)}
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
                    readOnly={known.some((k) => k.sku === r.sku)}
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
                    {errors.rows[i] ??
                      `${Math.max(0, avail.get(r.sku.trim().toUpperCase()) ?? 0)} good units available`}
                  </p>
                ) : null}
              </div>
            ))}
            {!stocked ? (
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
      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import release request"
        fields={REQUEST_FIELDS}
        templateKey={`REQ:${wo.customerId}`}
        partyName={wo.customerName}
        onImport={applyImport}
      />
    </>
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
  const [file, setFile] = useState<{ name: string; sizeKb: number }>();
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(PROTO_TODAY);
  const [receivedBy, setReceivedBy] = useState('');
  // FLOW-003 T5: receiver's designation / phone and exception remarks written on the POD.
  const [receiverContact, setReceiverContact] = useState('');
  const [exceptions, setExceptions] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [imported, setImported] = useState<string>();
  const [vendorId, setVendorId] = useState(wo.assignments[0]?.vendorId ?? '');
  const [rows, setRows] = useState(
    req.lines.map((l) => ({ sku: l.sku, requested: l.quantity, delivered: String(l.quantity), remarks: '' })),
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
  const vendorName = vendorOptions.find((v) => v.value === vendorId)?.label;

  const applyImport = (data: ImportedRow[], f: { name: string; sizeKb: number }) => {
    const by = new Map<string, { qty: number; remarks: string }>();
    for (const r of data) {
      const sku = String(r.sku ?? '')
        .trim()
        .toUpperCase();
      if (!sku) continue;
      const prev = by.get(sku);
      by.set(sku, {
        qty: (prev?.qty ?? 0) + (Number(r.deliveredQty) || 0),
        remarks: [prev?.remarks, r.remarks ? String(r.remarks) : ''].filter(Boolean).join('; '),
      });
    }
    const next = req.lines.map((l) => {
      const p = by.get(l.sku);
      by.delete(l.sku);
      return { sku: l.sku, requested: l.quantity, delivered: String(p?.qty ?? 0), remarks: p?.remarks ?? '' };
    });
    for (const [sku, p] of by) next.push({ sku, requested: 0, delivered: String(p.qty), remarks: p.remarks });
    setRows(next);
    setImported(`${data.length} rows imported from ${f.name}`);
    if (!file) setFile(f);
  };

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
          receiverContact: receiverContact.trim() || undefined,
          exceptions: exceptions.trim() || undefined,
          attachment: asAttachment(file!),
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
    <>
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
          <FileField
            label="POD document"
            file={file}
            onFile={(f) => setFile(f ? fileMeta(f) : undefined)}
            error={errors.file}
          />
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
          <TextField
            label="Receiver contact"
            placeholder="Designation / mobile"
            value={receiverContact}
            onChange={(e) => setReceiverContact(e.target.value)}
          />
          <TextField
            label="Exceptions noted"
            placeholder="e.g. 2 cartons wet, seal broken"
            value={exceptions}
            onChange={(e) => setExceptions(e.target.value)}
          />
          {vendorOptions.length ? (
            <SelectField
              label="Delivered by"
              options={vendorOptions}
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <p className="text-body-s font-medium">Delivered quantities</p>
            <Button
              size="sm"
              variant="secondary"
              icon={<FileSpreadsheet aria-hidden="true" />}
              onClick={() => setImportOpen(true)}
            >
              Import POD from Excel
            </Button>
          </div>
          {imported ? (
            <p role="status" className="text-caption text-success sm:col-span-2">
              {imported}. Lines not in the file are set to 0 delivered.
            </p>
          ) : null}
          <div
            className="overflow-x-auto sm:col-span-2"
            tabIndex={0}
            role="region"
            aria-label="Delivered quantities per item"
          >
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
                    <td className="py-1 text-right tabular-nums">{r.requested}</td>
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
      <SpreadsheetImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import POD"
        fields={POD_FIELDS}
        templateKey={`POD:${vendorId || 'unknown'}`}
        partyName={vendorName}
        onImport={applyImport}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Purchase invoices drafted at completion
// ---------------------------------------------------------------------------------------------

/** Vendor purchase orders (issued at assignment) and the vendor invoices recorded against them. */
export function PurchasingCard({ wo }: { wo: WorkOrderDetail }) {
  return (
    <Card>
      <CardHeader
        title="Purchase orders"
        description="Issued to vendors at assignment; vendor invoices are matched to them."
      />
      <CardBody>
        {wo.purchaseOrders.length === 0 ? (
          <p className="text-body-s text-fg-muted">
            No purchase order yet. Assigning a vendor issues a PO before the work starts.
          </p>
        ) : (
          <ul className="space-y-2">
            {wo.purchaseOrders.map((po) => {
              const bill = po.vendorBillId
                ? wo.purchaseInvoices.find((b) => b.id === po.vendorBillId)
                : undefined;
              return (
                <li key={po.id} className="rounded-lg border border-border-subtle">
                  <Link
                    to="/purchase-orders/$id"
                    params={{ id: po.id }}
                    className="flex items-center justify-between gap-3 rounded-t-lg px-3 py-2.5 hover:bg-canvas"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <DocRef>{po.number}</DocRef>
                        <StatusBadge status={po.status} />
                      </span>
                      <span className="mt-0.5 block text-caption text-fg-muted">
                        {po.vendorName} · {po.serviceName}
                      </span>
                      <Money amount={po.amount} className="mt-0.5 block text-body-s font-medium" />
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                  </Link>
                  <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-3 py-2 text-caption">
                    {bill ? (
                      <Link
                        to="/vendor-bills/$id"
                        params={{ id: bill.id }}
                        className="text-fg-secondary hover:text-brand"
                      >
                        Vendor invoice <span className="font-mono font-medium text-brand">{bill.number}</span>
                      </Link>
                    ) : po.status === 'Cancelled' ? (
                      <span className="text-fg-muted">Cancelled</span>
                    ) : po.status === 'Completed' || po.status === 'Accepted' ? (
                      <Link
                        to="/vendor-bills/new"
                        search={{ purchaseOrderId: po.id }}
                        className="font-medium text-brand hover:underline"
                      >
                        Record vendor invoice
                      </Link>
                    ) : (
                      <span className="text-fg-muted">Awaiting vendor acceptance</span>
                    )}
                    {bill ? <StatusBadge status={bill.status} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Aenix's own Goods Receipt Note to the customer — owner's AEN061 layout. */
function CustomerGrnDialog({ wo, ib, onClose }: { wo: WorkOrderDetail; ib: Inbound; onClose: () => void }) {
  const company = useProtoDb((db) => db.company);
  const grn = ib.grn!;
  const lines = grn.lines
    .map((g) => {
      const pl = ib.packingList.lines.find((l) => l.sku === g.sku);
      return {
        batch: g.batch ?? pl?.batch ?? ib.reference,
        barcode: pl?.barcode ?? g.sku,
        description: pl?.description ?? g.sku,
        qty: g.receivedQty - g.damagedQty,
        cbm: g.cbm ?? pl?.cbm,
      };
    })
    .filter((l) => l.qty > 0);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalCbm = Math.round(lines.reduce((s, l) => s + (l.cbm ?? 0), 0) * 10000) / 10000;
  const cell = 'border border-[#1a1a1a] px-2 py-1';
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Customer GRN ${grn.customerGrnNumber ?? ''}`}
      description="Preview of the document sent to the customer. The PDF and stamp come from the AENIX backend."
    >
      <article aria-label="Goods receipt note" className="bg-white px-6 py-5 text-[12px] text-[#1a1a1a]">
        <p className="text-caption">{company.website}</p>
        <div aria-hidden="true" className="mt-2 h-2 bg-[#9a2119]" />
        <header className="flex flex-wrap items-start justify-between gap-4 pt-5">
          <div>
            <Logo height={40} />
            <p className="mt-1 text-[10px] font-semibold">{company.tagline}</p>
          </div>
          <div className="max-w-xs text-[11px] leading-[1.35]">
            <p className="text-[13px] font-semibold text-[#9a2119]">{company.legalName}</p>
            {company.registeredAddress.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>{company.phone}</p>
          </div>
        </header>
        <div className="mt-8 flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-semibold">To</p>
            <p className="font-semibold">{wo.customerName}</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right">
            <dt className="font-semibold">GRN No:</dt>
            <dd>{grn.customerGrnNumber}</dd>
            <dt className="font-semibold">Inbound Date:</dt>
            <dd>{formatDate(grn.receivedAt)}</dd>
            <dt className="font-semibold">Location:</dt>
            <dd>{ib.location ?? wo.origin}</dd>
            {ib.containerNo ? (
              <>
                <dt className="font-semibold">Container:</dt>
                <dd>{ib.containerNo}</dd>
              </>
            ) : null}
          </dl>
        </div>
        <h3 className="my-4 text-center font-semibold text-[#9a2119] underline">Goods Receipt Note</h3>
        <div className="overflow-x-auto" role="region" aria-label="GRN lines" tabIndex={0}>
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                {['Batch No', 'Barcode', 'Description', 'Qty Box', 'Volume (CBM)'].map((h) => (
                  <th key={h} scope="col" className={`${cell} text-center font-semibold`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.barcode}>
                  <td className={cell}>{l.batch}</td>
                  <td className={cell}>{l.barcode}</td>
                  <td className={cell}>{l.description}</td>
                  <td className={`${cell} text-center tabular-nums`}>{l.qty}</td>
                  <td className={`${cell} text-center tabular-nums`}>{l.cbm ?? '—'}</td>
                </tr>
              ))}
              <tr>
                <td className={`${cell} text-center font-semibold`} colSpan={3}>
                  Total CBM
                </td>
                <td className={`${cell} text-center font-semibold tabular-nums`}>{totalQty}</td>
                <td className={`${cell} text-center font-semibold tabular-nums`}>{totalCbm || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-10 text-center text-[11px]">
          This is a system-generated document and does not require a signature.
        </p>
      </article>
    </Dialog>
  );
}
