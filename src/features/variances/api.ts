import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nextDocNumber } from '@/domain/numbering';
import type { Attachment, DebitNote, Variance, VarianceOutcome, WorkOrder } from '@/domain/types';
import { approvalNeeded, onApprovalDecided, requestApproval } from '@/shared/data/approvals';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';

/**
 * FLOW-003 W3 — variances and claims. PROTOTYPE ADAPTER (contract pending): a GRN or POD that
 * does not match, or a cycle-count difference, becomes a Variance record with lines, photos,
 * an outcome and a value; the outcome goes through the approval matrix ('Variance outcome').
 * Approved 'Vendor debit note' → Draft debit note to the vendor; 'Customer claim' → claim lodged
 * (finance raises the credit note); other outcomes simply resolve the variance.
 */
export const VARIANCE_OUTCOMES: VarianceOutcome[] = [
  'Accept as is',
  'Customer claim',
  'Vendor debit note',
  'Carrier / insurer claim',
  'Write-off',
];

export const VARIANCE_STATUSES = ['Open', 'Pending approval', 'Resolved'] as const;
export const VARIANCE_SOURCES = ['GRN', 'POD', 'Cycle count'] as const;

export interface VarianceRow extends Variance {
  customerName: string;
  vendorName?: string;
  jobNumber?: string;
  debitNoteNumber?: string;
  shortQty: number;
  damagedQty: number;
}

/** A GRN / POD flagged 'Variance raised' that has no variance record yet. */
export interface PendingVarianceDoc {
  workOrderId: string;
  jobNumber: string;
  customerName: string;
  source: 'GRN' | 'POD';
  docId: string;
  sourceRef: string;
}

export interface VarianceUpdate {
  lines?: Variance['lines'];
  photos?: Attachment[];
  outcome?: VarianceOutcome;
  value?: number;
}

type Line = Variance['lines'][number];

const key = (s: string) => s.trim().toUpperCase();

function toRow(v: Variance): VarianceRow {
  const db = protoDb.get();
  return {
    ...v,
    customerName: lookupName.customer(v.customerId),
    vendorName: v.vendorId ? lookupName.vendor(v.vendorId) : undefined,
    jobNumber: db.workOrders.find((w) => w.id === v.workOrderId)?.number,
    debitNoteNumber: v.debitNoteId ? db.debitNotes.find((d) => d.id === v.debitNoteId)?.number : undefined,
    shortQty: v.lines.reduce((s, l) => s + Math.max(0, l.expected - l.actual), 0),
    damagedQty: v.lines.reduce((s, l) => s + l.damaged, 0),
  };
}

function warehouseVendorId(wo: WorkOrder): string | undefined {
  const db = protoDb.get();
  return wo.vendorAssignments.find(
    (a) => db.vendors.find((v) => v.id === a.vendorId)?.category === 'Warehouse',
  )?.vendorId;
}

function nextNumber(): string {
  return nextDocNumber(
    protoDb.get().variances.map((v) => v.number),
    'VAR-',
  );
}

function grnLines(wo: WorkOrder, inboundId: string): Line[] {
  const ib = wo.inbounds.find((x) => x.id === inboundId);
  if (!ib?.grn) throw new Error('No GRN on this inbound');
  const lines = new Map<string, Line>();
  for (const l of ib.packingList.lines)
    lines.set(key(l.sku), { sku: key(l.sku), expected: l.quantity, actual: 0, damaged: 0 });
  for (const g of ib.grn.lines) {
    const row = lines.get(key(g.sku)) ?? { sku: key(g.sku), expected: 0, actual: 0, damaged: 0 };
    row.actual += g.receivedQty;
    row.damaged += g.damagedQty;
    if (g.remarks) row.remarks = [row.remarks, g.remarks].filter(Boolean).join('; ');
    lines.set(key(g.sku), row);
  }
  return [...lines.values()].filter((l) => l.expected !== l.actual || l.damaged > 0);
}

function podLines(wo: WorkOrder, requestId: string): Line[] {
  const req = wo.customerRequests.find((r) => r.id === requestId);
  if (!req?.pod) throw new Error('No POD on this request');
  const lines = new Map<string, Line>();
  for (const l of req.lines)
    lines.set(key(l.sku), { sku: key(l.sku), expected: l.quantity, actual: 0, damaged: 0 });
  for (const p of req.pod.lines) {
    const row = lines.get(key(p.sku)) ?? { sku: key(p.sku), expected: 0, actual: 0, damaged: 0 };
    row.actual += p.deliveredQty;
    if (p.remarks) row.remarks = [row.remarks, p.remarks].filter(Boolean).join('; ');
    lines.set(key(p.sku), row);
  }
  return [...lines.values()].filter((l) => l.expected !== l.actual || l.damaged > 0);
}

function save(v: Variance) {
  protoDb.update((db) => ({
    ...db,
    variances: db.variances.some((x) => x.id === v.id)
      ? db.variances.map((x) => (x.id === v.id ? v : x))
      : [v, ...db.variances],
  }));
}

function find(id: string): Variance {
  const v = protoDb.get().variances.find((x) => x.id === id);
  if (!v) throw new Error('Variance not found');
  return v;
}

/**
 * Create the variance record for a GRN / POD marked 'Variance raised' (idempotent: returns the
 * existing open record for the same document). Called by the job document actions.
 */
export function createVarianceFromDoc(input: {
  workOrderId: string;
  source: 'GRN' | 'POD';
  docId: string;
}): Variance {
  const db = protoDb.get();
  const wo = db.workOrders.find((w) => w.id === input.workOrderId);
  if (!wo) throw new Error('Work order not found');
  const ib = input.source === 'GRN' ? wo.inbounds.find((x) => x.id === input.docId) : undefined;
  const req = input.source === 'POD' ? wo.customerRequests.find((x) => x.id === input.docId) : undefined;
  const sourceRef = input.source === 'GRN' ? ib?.grn?.number : req?.pod?.number;
  if (!sourceRef) throw new Error(`No ${input.source} uploaded`);
  const existing = db.variances.find((v) => v.workOrderId === wo.id && v.sourceRef === sourceRef);
  if (existing) return existing;
  const v: Variance = {
    id: newId('var'),
    number: nextNumber(),
    workOrderId: wo.id,
    customerId: wo.customerId,
    vendorId: input.source === 'GRN' ? warehouseVendorId(wo) : (req?.pod?.vendorId ?? warehouseVendorId(wo)),
    source: input.source,
    sourceRef,
    raisedAt: nowIso(),
    lines: input.source === 'GRN' ? grnLines(wo, input.docId) : podLines(wo, input.docId),
    photos: [],
    status: 'Open',
  };
  save(v);
  logActivity({
    entity: 'Variance',
    entityId: v.id,
    entityRef: v.number,
    action: `opened from ${input.source} ${sourceRef} (${wo.number})`,
  });
  return v;
}

/** Variance from cycle-count differences (lines: counted vs system per lot). */
export function createVarianceFromCount(countId: string): Variance {
  const db = protoDb.get();
  const cc = db.cycleCounts.find((c) => c.id === countId);
  if (!cc) throw new Error('Cycle count not found');
  const existing = db.variances.find((v) => v.source === 'Cycle count' && v.sourceRef === cc.number);
  if (existing) return existing;
  const diff = cc.lines.filter((l) => l.countedQty !== undefined && l.countedQty !== l.systemQty);
  if (!diff.length) throw new Error('No differences on this count');
  const lots = diff.map((l) => db.stockItems.find((s) => s.id === l.stockItemId));
  const customerId = cc.customerId ?? lots.find(Boolean)?.customerId ?? '';
  const v: Variance = {
    id: newId('var'),
    number: nextNumber(),
    workOrderId: lots.find((s) => s?.workOrderId)?.workOrderId ?? '',
    customerId,
    source: 'Cycle count',
    sourceRef: cc.number,
    raisedAt: nowIso(),
    lines: diff.map((l) => ({
      sku: l.sku,
      expected: l.systemQty,
      actual: l.countedQty ?? 0,
      damaged: 0,
      remarks: `Bin ${l.locationCode}`,
    })),
    photos: [],
    status: 'Open',
  };
  save(v);
  logActivity({
    entity: 'Variance',
    entityId: v.id,
    entityRef: v.number,
    action: `opened from cycle count ${cc.number}`,
  });
  return v;
}

/** Apply an approved outcome (or one that needs no approval). */
function applyOutcome(id: string): Variance {
  const v = find(id);
  const db = protoDb.get();
  let next: Variance = { ...v, status: 'Resolved' };
  if (v.outcome === 'Vendor debit note') {
    if (!v.vendorId) throw new Error('No vendor on this variance — choose another outcome');
    const po = db.purchaseOrders.find(
      (p) => p.workOrderId === v.workOrderId && p.vendorId === v.vendorId && p.status !== 'Cancelled',
    );
    const dn: DebitNote = {
      id: newId('dn'),
      number: nextDocNumber(
        db.debitNotes.map((d) => d.number),
        'DN-',
      ),
      vendorId: v.vendorId,
      purchaseOrderId: po?.id,
      vendorBillId: po?.vendorBillId,
      varianceId: v.id,
      date: nowIso().slice(0, 10),
      reason: `${v.number}: ${v.source} ${v.sourceRef} shortage / damage`,
      amount: v.value ?? 0,
      vatRate: 0.05,
      status: 'Draft',
    };
    protoDb.update((s) => ({ ...s, debitNotes: [dn, ...s.debitNotes] }));
    next = { ...next, debitNoteId: dn.id };
    logActivity({
      entity: 'Variance',
      entityId: v.id,
      entityRef: v.number,
      action: `drafted debit note ${dn.number} to ${lookupName.vendor(v.vendorId)}`,
    });
  } else if (v.outcome === 'Customer claim') {
    logActivity({
      entity: 'Variance',
      entityId: v.id,
      entityRef: v.number,
      action: `customer claim lodged (${lookupName.customer(v.customerId)}) — finance to raise the credit note`,
    });
  } else {
    logActivity({
      entity: 'Variance',
      entityId: v.id,
      entityRef: v.number,
      action: `resolved: ${v.outcome ?? 'no outcome'}`,
    });
  }
  save(next);
  return next;
}

onApprovalDecided('Variance outcome', (req) => {
  const v = protoDb.get().variances.find((x) => x.id === req.entityId);
  if (!v) return;
  save({ ...v, approval: req.record, status: req.record.status === 'Approved' ? v.status : 'Open' });
  if (req.record.status === 'Approved') applyOutcome(v.id);
  else
    logActivity({
      entity: 'Variance',
      entityId: v.id,
      entityRef: v.number,
      action: 'outcome rejected — back to open',
    });
});

export interface VarianceListParams extends ListParams {
  source?: string;
  customerId?: string;
}

export const variancesApi = {
  list(params: VarianceListParams): Promise<Page<VarianceRow>> {
    const rows = protoDb
      .get()
      .variances.filter(
        (v) =>
          (!params.source || v.source === params.source) &&
          (!params.customerId || v.customerId === params.customerId),
      )
      .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.sourceRef} ${r.customerName} ${r.vendorName ?? ''} ${r.jobNumber ?? ''} ${r.lines.map((l) => l.sku).join(' ')}`,
        status: (r) => r.status,
      }),
    );
  },

  get(id: string): Promise<VarianceRow> {
    const v = protoDb.get().variances.find((x) => x.id === id);
    return v ? latency(toRow(v)) : Promise.reject(new Error('Variance not found'));
  },

  forJob(workOrderId: string): Promise<VarianceRow[]> {
    return latency(
      protoDb
        .get()
        .variances.filter((v) => v.workOrderId === workOrderId)
        .map(toRow),
      60,
    );
  },

  /** Documents flagged 'Variance raised' without a record (older data). */
  pendingDocs(workOrderId?: string): Promise<PendingVarianceDoc[]> {
    const db = protoDb.get();
    const has = (woId: string, ref: string) =>
      db.variances.some((v) => v.workOrderId === woId && v.sourceRef === ref);
    const out: PendingVarianceDoc[] = [];
    for (const w of db.workOrders) {
      if (workOrderId && w.id !== workOrderId) continue;
      for (const ib of w.inbounds)
        if (ib.grn?.status === 'Variance raised' && !has(w.id, ib.grn.number))
          out.push({
            workOrderId: w.id,
            jobNumber: w.number,
            customerName: lookupName.customer(w.customerId),
            source: 'GRN',
            docId: ib.id,
            sourceRef: ib.grn.number,
          });
      for (const r of w.customerRequests)
        if (r.status === 'Variance raised' && r.pod && !has(w.id, r.pod.number))
          out.push({
            workOrderId: w.id,
            jobNumber: w.number,
            customerName: lookupName.customer(w.customerId),
            source: 'POD',
            docId: r.id,
            sourceRef: r.pod.number,
          });
    }
    return latency(out, 60);
  },

  createFromDoc(input: { workOrderId: string; source: 'GRN' | 'POD'; docId: string }): Promise<Variance> {
    try {
      return latency(createVarianceFromDoc(input), 150);
    } catch (e) {
      return Promise.reject(e);
    }
  },

  createFromCount(countId: string): Promise<Variance> {
    try {
      return latency(createVarianceFromCount(countId), 150);
    } catch (e) {
      return Promise.reject(e);
    }
  },

  update(id: string, patch: VarianceUpdate): Promise<Variance> {
    const v = protoDb.get().variances.find((x) => x.id === id);
    if (!v) return Promise.reject(new Error('Variance not found'));
    if (v.status !== 'Open') return Promise.reject(new Error('Only open variances can be changed'));
    if (patch.lines?.some((l) => l.actual < 0 || l.damaged < 0 || l.expected < 0))
      return Promise.reject(new Error('Quantities cannot be negative'));
    if (patch.value !== undefined && patch.value < 0)
      return Promise.reject(new Error('The value cannot be negative'));
    const next: Variance = { ...v, ...patch };
    save(next);
    return latency(next, 120);
  },

  /** Submit the chosen outcome: approval when the matrix says so, otherwise applied at once. */
  submitOutcome(id: string): Promise<Variance> {
    const v = protoDb.get().variances.find((x) => x.id === id);
    if (!v) return Promise.reject(new Error('Variance not found'));
    if (v.status !== 'Open') return Promise.reject(new Error('This variance is not open'));
    if (!v.outcome) return Promise.reject(new Error('Choose an outcome first'));
    if (v.value === undefined || Number.isNaN(v.value))
      return Promise.reject(new Error('Enter the value of the shortage / damage (AED)'));
    if (v.outcome === 'Vendor debit note' && !v.vendorId)
      return Promise.reject(new Error('No vendor on this variance — a debit note is not possible'));
    if (v.outcome === 'Vendor debit note' && !(v.value > 0))
      return Promise.reject(new Error('A debit note needs a value above 0'));
    const rule = approvalNeeded('Variance outcome', v.value);
    if (rule) {
      const approval = requestApproval({
        docType: 'Variance outcome',
        rule,
        entity: 'Variance',
        entityId: v.id,
        entityRef: v.number,
        summary: `${v.outcome} — ${v.source} ${v.sourceRef} (${lookupName.customer(v.customerId)})`,
        amount: v.value,
        href: `/variances/${v.id}`,
      });
      const next: Variance = { ...v, approval, status: 'Pending approval' };
      save(next);
      return latency(next, 150);
    }
    try {
      return latency(applyOutcome(id), 150);
    } catch (e) {
      return Promise.reject(e);
    }
  },
};

export function useVariances(params: VarianceListParams) {
  return useQuery({
    queryKey: ['variances', 'list', params],
    queryFn: () => variancesApi.list(params),
    placeholderData: (p) => p,
  });
}

export function useVariance(id: string) {
  return useQuery({ queryKey: ['variances', 'detail', id], queryFn: () => variancesApi.get(id) });
}

export function useJobVariances(workOrderId: string) {
  return useQuery({
    queryKey: ['variances', 'job', workOrderId],
    queryFn: () => variancesApi.forJob(workOrderId),
  });
}

export function usePendingVarianceDocs(workOrderId?: string) {
  return useQuery({
    queryKey: ['variances', 'pending-docs', workOrderId ?? 'all'],
    queryFn: () => variancesApi.pendingDocs(workOrderId),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['variances'] });
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
    void qc.invalidateQueries({ queryKey: ['warehouse'] });
    void qc.invalidateQueries({ queryKey: ['approvals'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
  };
}

export function useVarianceAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      a:
        | { kind: 'update'; id: string; patch: VarianceUpdate }
        | { kind: 'submit'; id: string }
        | { kind: 'fromDoc'; workOrderId: string; source: 'GRN' | 'POD'; docId: string }
        | { kind: 'fromCount'; countId: string },
    ): Promise<Variance> => {
      switch (a.kind) {
        case 'update':
          return variancesApi.update(a.id, a.patch);
        case 'submit':
          return variancesApi.submitOutcome(a.id);
        case 'fromDoc':
          return variancesApi.createFromDoc(a);
        case 'fromCount':
          return variancesApi.createFromCount(a.countId);
      }
    },
    onSuccess: invalidate,
  });
}
