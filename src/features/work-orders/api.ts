import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workOrderFinancials } from '@/domain/calc';
import type {
  Attachment,
  Cargo,
  CustomerRequest,
  DocLine,
  Grn,
  Invoice,
  Milestone,
  Pod,
  PriceLine,
  ServiceCategory,
  StockMovement,
  TransportMode,
  VendorAssignment,
  VendorBill,
  WorkOrder,
  WorkOrderStatus,
} from '@/domain/types';
import { reconcile } from '@/domain/reconcile';
import { milestoneLabels } from '@/domain/workflow';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';

/**
 * Work orders (= Jobs) data source. PROTOTYPE ADAPTER — replace the bodies of `workOrdersApi`
 * with calls to the generated OpenAPI client when the Jobs (Phase 4) contract is published.
 */
export const PROTO_TODAY = '2026-11-23';

/** Document status chips shown on lists (PL → GRN, request → POD). */
export interface DocFlags {
  awaitingGrn: boolean;
  grnVariance: boolean;
  awaitingPod: number;
  podVariance: number;
}

export interface WorkOrderRow extends WorkOrder {
  customerName: string;
  sourceRef?: string;
  docFlags: DocFlags;
  revenue: number;
  cost: number;
  marginPct: number;
  progress: number;
  currentMilestone: string;
}

export interface PurchaseInvoiceRef {
  id: string;
  number: string;
  vendorName: string;
  amount: number;
  vat: number;
  status: VendorBill['status'];
}

export interface WorkOrderDetail extends WorkOrderRow {
  invoiceNumber?: string;
  salesOrderNumber?: string;
  purchaseInvoices: PurchaseInvoiceRef[];
  movements: (StockMovement & { customerName: string })[];
  assignments: (VendorAssignment & { vendorName: string; serviceName: string })[];
}

export interface WorkOrderInput {
  customerId: string;
  source: WorkOrder['source'];
  salesOrderId?: string;
  serviceCategory: ServiceCategory;
  /** Transport only. */
  mode?: TransportMode;
  /** Optional product list for warehouse jobs (saved as a Draft PL). */
  packingLines?: DocLine[];
  origin: string;
  destination: string;
  cargo: Cargo;
  eta: string;
  priority: WorkOrder['priority'];
  hasWarehouse: boolean;
  lines: Omit<PriceLine, 'id'>[];
  status: 'Draft' | 'Confirmed';
}

export interface PrefillSearch {
  quotationId?: string;
  contractId?: string;
  customerId?: string;
  salesOrderId?: string;
}

export interface WorkOrderPrefill {
  customerId?: string;
  source: WorkOrder['source'];
  sourceRef?: string;
  salesOrderId?: string;
  serviceCategory?: ServiceCategory;
  mode?: TransportMode;
  origin?: string;
  destination?: string;
  cargo?: Cargo;
  lines: Omit<PriceLine, 'id'>[];
}

function sourceRef(wo: WorkOrder): string | undefined {
  const db = protoDb.get();
  if (wo.source.type === 'Quotation') return db.quotations.find((q) => q.id === wo.source.refId)?.number;
  if (wo.source.type === 'Contract') return db.contracts.find((c) => c.id === wo.source.refId)?.number;
  if (wo.source.type === 'Sales order') return db.salesOrders.find((o) => o.id === wo.source.refId)?.number;
  return undefined;
}

export function grnResult(wo: Pick<WorkOrder, 'packingList' | 'grn'>) {
  if (!wo.packingList || !wo.grn) return undefined;
  return reconcile(
    wo.packingList.lines,
    wo.grn.lines.map((l) => ({ sku: l.sku, qty: l.receivedQty, damaged: l.damagedQty, remarks: l.remarks })),
  );
}

export function podResult(req: CustomerRequest) {
  if (!req.pod) return undefined;
  return reconcile(
    req.lines,
    req.pod.lines.map((l) => ({ sku: l.sku, qty: l.deliveredQty, remarks: l.remarks })),
  );
}

export function docFlags(wo: WorkOrder): DocFlags {
  const grn = grnResult(wo);
  return {
    awaitingGrn: wo.packingList?.status === 'Sent to warehouse' && !wo.grn,
    grnVariance: wo.grn?.status === 'Variance raised' || (!!grn && !grn.ok && wo.grn?.status !== 'Verified'),
    awaitingPod: wo.customerRequests.filter((r) => !r.pod && r.status !== 'Closed').length,
    podVariance: wo.customerRequests.filter(
      (r) => r.status === 'Variance raised' || (r.pod && r.status !== 'Closed' && !podResult(r)?.ok),
    ).length,
  };
}

/** Good (received − damaged) quantity per SKU available to release on a warehouse job, net of open/closed requests. */
export function availableToRelease(wo: WorkOrder, excludeRequestId?: string): Map<string, number> {
  const avail = new Map<string, number>();
  for (const l of wo.grn?.lines ?? [])
    avail.set(l.sku, (avail.get(l.sku) ?? 0) + l.receivedQty - l.damagedQty);
  for (const r of wo.customerRequests) {
    if (r.id === excludeRequestId) continue;
    for (const l of r.lines) avail.set(l.sku, (avail.get(l.sku) ?? 0) - l.quantity);
  }
  return avail;
}

function toRow(wo: WorkOrder): WorkOrderRow {
  const fin = workOrderFinancials(wo);
  const done = wo.milestones.filter((m) => m.status === 'Done').length;
  return {
    ...wo,
    customerName: lookupName.customer(wo.customerId),
    sourceRef: sourceRef(wo),
    docFlags: docFlags(wo),
    revenue: fin.revenue,
    cost: fin.cost,
    marginPct: fin.marginPct,
    progress: wo.milestones.length ? Math.round((done / wo.milestones.length) * 100) : 0,
    currentMilestone:
      wo.status === 'Cancelled'
        ? 'Cancelled'
        : (wo.milestones.find((m) => m.status === 'Current')?.label ??
          (done === wo.milestones.length ? 'All milestones done' : 'Not started')),
  };
}

function buildMilestones(
  category: ServiceCategory,
  mode: TransportMode | undefined,
  confirmed: boolean,
): Milestone[] {
  return milestoneLabels(category, mode).map((label, i) => ({
    id: newId('ms'),
    label,
    status: confirmed
      ? i === 0
        ? 'Done'
        : i === 1
          ? 'Current'
          : 'Pending'
      : i === 0
        ? 'Current'
        : 'Pending',
    at: confirmed && i === 0 ? nowIso() : undefined,
  }));
}

/**
 * Status follows milestone progress. Transport: 0–1 done Confirmed, 2–3 In progress, 4+ In transit,
 * all Delivered. Warehouse / direct service: 0–1 Confirmed, then In progress, all Delivered.
 */
function statusForProgress(done: number, total: number, category: ServiceCategory): WorkOrderStatus {
  if (done >= total) return 'Delivered';
  if (category === 'Transport' && done >= 4) return 'In transit';
  if (done >= 2) return 'In progress';
  return 'Confirmed';
}

/** Mark the milestone with this label done (and the next one current) if it is the current one. */
function advanceIfCurrent(w: WorkOrder, label: string): WorkOrder {
  const idx = w.milestones.findIndex((m) => m.status === 'Current' && m.label === label);
  if (idx < 0) return w;
  const milestones: Milestone[] = w.milestones.map((m, i) =>
    i === idx ? { ...m, status: 'Done', at: nowIso() } : i === idx + 1 ? { ...m, status: 'Current' } : m,
  );
  const done = milestones.filter((m) => m.status === 'Done').length;
  const status = ['Confirmed', 'In progress', 'In transit'].includes(w.status)
    ? statusForProgress(done, milestones.length, w.serviceCategory)
    : w.status;
  return { ...w, milestones, status };
}

const addDaysIso = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function actor() {
  return protoDb.get().session?.displayName ?? 'Prototype user';
}

function notify(title: string, body: string, href: string) {
  protoDb.update((s) => ({
    ...s,
    notifications: [{ id: newId('n'), at: nowIso(), title, body, read: false, href }, ...s.notifications],
  }));
}

function patch(id: string, fn: (wo: WorkOrder) => WorkOrder) {
  protoDb.update((s) => ({ ...s, workOrders: s.workOrders.map((w) => (w.id === id ? fn(w) : w)) }));
  return protoDb.get().workOrders.find((w) => w.id === id)!;
}

export function canComplete(wo: Pick<WorkOrder, 'status' | 'serviceCategory'>): boolean {
  if (wo.serviceCategory === 'Transport') return wo.status === 'Delivered';
  return ['In progress', 'In transit', 'Delivered'].includes(wo.status);
}

function findOrThrow(id: string): WorkOrder {
  const wo = protoDb.get().workOrders.find((w) => w.id === id);
  if (!wo) throw new Error('Work order not found');
  return wo;
}

export const workOrdersApi = {
  list(params: ListParams): Promise<Page<WorkOrderRow>> {
    const rows = [...protoDb.get().workOrders]
      .filter((w) => !params.type || w.serviceCategory === params.type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.customerName} ${r.origin} ${r.destination} ${r.cargo.description} ${r.sourceRef ?? ''}`,
        status: (r) => r.status,
      }),
    );
  },

  get(id: string): Promise<WorkOrderDetail> {
    const db = protoDb.get();
    const wo = db.workOrders.find((w) => w.id === id);
    if (!wo) return Promise.reject(new Error('Not found'));
    return latency({
      ...toRow(wo),
      invoiceNumber: wo.invoiceId ? db.invoices.find((i) => i.id === wo.invoiceId)?.number : undefined,
      salesOrderNumber: wo.salesOrderId
        ? db.salesOrders.find((o) => o.id === wo.salesOrderId)?.number
        : undefined,
      purchaseInvoices: db.vendorBills
        .filter((b) => b.workOrderId === id)
        .map((b) => ({
          id: b.id,
          number: b.number,
          vendorName: lookupName.vendor(b.vendorId),
          amount: b.amount,
          vat: b.vat,
          status: b.status,
        })),
      movements: db.stockMovements
        .filter((m) => m.workOrderId === id)
        .map((m) => ({ ...m, customerName: lookupName.customer(m.customerId) })),
      assignments: wo.vendorAssignments.map((a) => ({
        ...a,
        vendorName: lookupName.vendor(a.vendorId),
        serviceName: lookupName.service(a.serviceId),
      })),
    });
  },

  prefill(search: PrefillSearch): Promise<WorkOrderPrefill> {
    const db = protoDb.get();
    const strip = (lines: PriceLine[]): Omit<PriceLine, 'id'>[] =>
      lines.map((l) => ({
        serviceId: l.serviceId,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        unitCost: l.unitCost,
      }));
    if (search.salesOrderId) {
      const so = db.salesOrders.find((x) => x.id === search.salesOrderId);
      if (so) {
        const enquiry = so.enquiryId ? db.enquiries.find((e) => e.id === so.enquiryId) : undefined;
        return latency({
          customerId: so.customerId,
          source: { type: 'Sales order', refId: so.id },
          sourceRef: so.number,
          salesOrderId: so.id,
          serviceCategory: so.serviceCategory,
          mode: so.mode,
          origin: so.origin,
          destination: so.destination,
          cargo: enquiry?.cargo ?? {
            description: so.notes || so.lines[0]?.description || '',
            packages: 0,
            weightKg: 0,
            volumeCbm: 0,
          },
          lines: strip(so.lines),
        });
      }
    }
    if (search.quotationId) {
      const q = db.quotations.find((x) => x.id === search.quotationId);
      if (q) {
        const enquiry = q.enquiryId ? db.enquiries.find((e) => e.id === q.enquiryId) : undefined;
        return latency({
          customerId: q.customerId,
          source: { type: 'Quotation', refId: q.id },
          sourceRef: q.number,
          serviceCategory: q.serviceCategory,
          mode: q.mode,
          origin: q.origin,
          destination: q.destination,
          cargo: enquiry?.cargo,
          lines: strip(q.lines),
        });
      }
    }
    if (search.contractId) {
      const c = db.contracts.find((x) => x.id === search.contractId);
      if (c) {
        const firstMode = db.services.find((s) => s.id === c.lines[0]?.serviceId)?.mode;
        const category: ServiceCategory =
          firstMode === 'Warehouse' ? 'Warehouse' : firstMode === 'Customs' ? 'Service' : 'Transport';
        return latency({
          customerId: c.customerId,
          source: { type: 'Contract', refId: c.id },
          sourceRef: c.number,
          serviceCategory: category,
          mode:
            category !== 'Transport'
              ? undefined
              : firstMode === 'Sea' || firstMode === 'Air'
                ? firstMode
                : 'Road',
          lines: strip(c.lines),
        });
      }
    }
    return latency({ customerId: search.customerId, source: { type: 'Direct' }, lines: [] });
  },

  create(input: WorkOrderInput): Promise<WorkOrder> {
    const db = protoDb.get();
    const next = Math.max(...db.workOrders.map((w) => Number(w.number.split('-')[1]))) + 1;
    const confirmed = input.status === 'Confirmed';
    const wo: WorkOrder = {
      id: newId('wo'),
      number: `JOB-${next}`,
      customerId: input.customerId,
      serviceCategory: input.serviceCategory,
      salesOrderId: input.salesOrderId,
      source: input.source,
      mode: input.serviceCategory === 'Transport' ? input.mode : undefined,
      origin: input.origin,
      destination: input.destination,
      cargo: input.cargo,
      status: input.status,
      priority: input.priority,
      milestones: buildMilestones(input.serviceCategory, input.mode, confirmed),
      vendorAssignments: [],
      lines: input.lines.map((l) => ({ ...l, id: newId('ln') })),
      hasWarehouse: input.serviceCategory === 'Warehouse' || input.hasWarehouse,
      packingList: input.packingLines?.length
        ? {
            number: `PL-${next}`,
            status: 'Draft',
            lines: input.packingLines.map((l) => ({ ...l, sku: l.sku.trim().toUpperCase() })),
          }
        : undefined,
      customerRequests: [],
      createdAt: nowIso(),
      eta: input.eta,
      owner: db.session?.displayName ?? 'Prototype user',
    };
    protoDb.update((s) => ({
      ...s,
      workOrders: [wo, ...s.workOrders],
      quotations:
        input.source.type === 'Quotation'
          ? s.quotations.map((q) =>
              q.id === input.source.refId && q.status !== 'Accepted'
                ? { ...q, status: 'Accepted' as const }
                : q,
            )
          : s.quotations,
      salesOrders: input.salesOrderId
        ? s.salesOrders.map((o) =>
            o.id === input.salesOrderId && (o.status === 'Draft' || o.status === 'Confirmed')
              ? { ...o, status: 'In progress' as const }
              : o,
          )
        : s.salesOrders,
    }));
    logActivity({
      entity: 'Work order',
      entityId: wo.id,
      entityRef: wo.number,
      action:
        input.source.type === 'Direct'
          ? 'created a direct work order'
          : `created a work order from ${input.source.type.toLowerCase()}`,
    });
    return latency(wo, 300);
  },

  confirm(id: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (wo.status !== 'Draft') return Promise.reject(new Error('Only draft work orders can be confirmed'));
    const updated = patch(id, (w) => ({
      ...w,
      status: 'Confirmed',
      milestones: w.milestones.map((m, i) =>
        i === 0
          ? { ...m, status: 'Done', at: nowIso() }
          : i === 1
            ? { ...m, status: 'Current' }
            : { ...m, status: 'Pending' },
      ),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: 'confirmed the work order',
    });
    return latency(updated, 200);
  },

  advanceMilestone(id: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (!['Confirmed', 'In progress', 'In transit'].includes(wo.status)) {
      return Promise.reject(new Error('Milestones can only be advanced on confirmed, running jobs'));
    }
    const idx = wo.milestones.findIndex((m) => m.status === 'Current');
    if (idx < 0) return Promise.reject(new Error('No milestone in progress'));
    const label = wo.milestones[idx]!.label;
    const updated = patch(id, (w) => {
      const milestones: Milestone[] = w.milestones.map((m, i) =>
        i === idx ? { ...m, status: 'Done', at: nowIso() } : i === idx + 1 ? { ...m, status: 'Current' } : m,
      );
      const done = milestones.filter((m) => m.status === 'Done').length;
      return { ...w, milestones, status: statusForProgress(done, milestones.length, w.serviceCategory) };
    });
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `completed milestone “${label}”`,
    });
    return latency(updated, 200);
  },

  cancel(id: string, reason: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (wo.status !== 'Draft' && wo.status !== 'Confirmed')
      return Promise.reject(new Error('Only draft or confirmed jobs can be cancelled'));
    const updated = patch(id, (w) => ({ ...w, status: 'Cancelled' }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `cancelled the work order (${reason})`,
    });
    return latency(updated, 200);
  },

  /**
   * Complete the job. Transport jobs complete after delivery; warehouse / direct-service jobs may
   * complete from In progress. Drafts one purchase invoice per vendor assignment not yet billed.
   */
  complete(id: string): Promise<{ wo: WorkOrder; drafted: VendorBill[] }> {
    const db = protoDb.get();
    const wo = findOrThrow(id);
    if (!canComplete(wo)) {
      return Promise.reject(
        new Error(
          wo.serviceCategory === 'Transport'
            ? 'Only delivered transport jobs can be completed'
            : 'Only running or delivered jobs can be completed',
        ),
      );
    }
    const billed = new Set(db.vendorBills.filter((b) => b.workOrderId === id).map((b) => b.vendorId));
    let seq = Math.max(7800, ...db.vendorBills.map((b) => Number(b.number.split('-')[1]) || 0));
    const drafted: VendorBill[] = [];
    for (const a of wo.vendorAssignments) {
      if (billed.has(a.vendorId) && drafted.every((d) => d.vendorId !== a.vendorId)) continue;
      const existing = drafted.find((d) => d.vendorId === a.vendorId);
      if (existing) {
        existing.amount = Math.round((existing.amount + a.agreedCost) * 100) / 100;
        existing.vat = Math.round(existing.amount * 0.05 * 100) / 100;
        continue;
      }
      seq += 1;
      const terms = db.vendors.find((v) => v.id === a.vendorId)?.paymentTermsDays ?? 30;
      drafted.push({
        id: newId('bill'),
        number: `PI-${seq}`,
        vendorRef: '',
        vendorId: a.vendorId,
        workOrderId: id,
        billDate: PROTO_TODAY,
        dueDate: addDaysIso(PROTO_TODAY, terms),
        amount: a.agreedCost,
        vat: Math.round(a.agreedCost * 0.05 * 100) / 100,
        paid: 0,
        status: 'Draft',
      });
    }
    protoDb.update((s) => ({
      ...s,
      vendorBills: [...drafted, ...s.vendorBills],
      workOrders: s.workOrders.map((w) =>
        w.id === id
          ? {
              ...w,
              status: 'Completed',
              completedAt: nowIso(),
              milestones: w.milestones.map((m) =>
                m.status === 'Done' ? m : { ...m, status: 'Done', at: nowIso() },
              ),
              vendorAssignments: w.vendorAssignments.map((a) => ({ ...a, status: 'Completed' })),
              purchaseInvoiceIds: [...(w.purchaseInvoiceIds ?? []), ...drafted.map((d) => d.id)],
            }
          : w,
      ),
      salesOrders: s.salesOrders.map((o) => {
        if (o.id !== wo.salesOrderId) return o;
        const open = s.workOrders.some(
          (w) => w.salesOrderId === o.id && w.id !== id && !['Completed', 'Cancelled'].includes(w.status),
        );
        return open ? o : { ...o, status: 'Completed' as const };
      }),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: drafted.length
        ? `completed the job and drafted ${drafted.length} purchase invoice${drafted.length === 1 ? '' : 's'}`
        : 'completed the job',
    });
    return latency({ wo: findOrThrow(id), drafted }, 250);
  },

  // ---------- Documents: PL → GRN ----------
  savePackingList(id: string, lines: DocLine[]): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (wo.packingList?.status === 'Sent to warehouse')
      return Promise.reject(new Error('The PL was already sent to the warehouse'));
    const updated = patch(id, (w) => ({
      ...w,
      hasWarehouse: true,
      packingList: {
        number: w.packingList?.number ?? `PL-${w.number.split('-')[1]}`,
        status: 'Draft',
        lines,
      },
    }));
    return latency(updated, 150);
  },

  sendPackingList(id: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (!wo.packingList?.lines.length)
      return Promise.reject(new Error('Add at least one product line first'));
    const updated = patch(id, (w) =>
      advanceIfCurrent(
        { ...w, packingList: { ...w.packingList!, status: 'Sent to warehouse', sentAt: nowIso() } },
        'PL sent to warehouse',
      ),
    );
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `sent ${wo.packingList.number} to the warehouse team`,
    });
    return latency(updated, 200);
  },

  uploadGrn(id: string, grn: Omit<Grn, 'status'>): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (wo.packingList?.status !== 'Sent to warehouse')
      return Promise.reject(new Error('Send the PL to the warehouse before uploading a GRN'));
    const updated = patch(id, (w) =>
      advanceIfCurrent({ ...w, grn: { ...grn, status: 'Uploaded' } }, 'GRN received'),
    );
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `uploaded ${grn.number}`,
    });
    return latency(updated, 250);
  },

  verifyGrn(id: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (!wo.grn) return Promise.reject(new Error('No GRN uploaded'));
    if (!grnResult(wo)?.ok)
      return Promise.reject(new Error('The GRN does not match the PL — raise a variance instead'));
    const updated = patch(id, (w) =>
      advanceIfCurrent({ ...w, grn: { ...w.grn!, status: 'Verified' } }, 'Goods stored'),
    );
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `verified ${wo.grn.number} against the PL`,
    });
    return latency(updated, 200);
  },

  raiseGrnVariance(id: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (!wo.grn) return Promise.reject(new Error('No GRN uploaded'));
    const r = grnResult(wo);
    const updated = patch(id, (w) => ({ ...w, grn: { ...w.grn!, status: 'Variance raised' } }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `raised a GRN variance on ${wo.grn.number}`,
    });
    notify(
      `GRN variance on ${wo.number}`,
      `${wo.grn.number}: ${r?.mismatches ?? 0} line(s) differ from ${wo.packingList?.number ?? 'the PL'}`,
      `/work-orders/${id}`,
    );
    return latency(updated, 200);
  },

  // ---------- Documents: customer request → POD ----------
  createRequest(
    id: string,
    input: { requiredBy: string; deliverTo: string; lines: DocLine[] },
  ): Promise<CustomerRequest> {
    const db = protoDb.get();
    const wo = findOrThrow(id);
    if (!input.lines.length) return Promise.reject(new Error('Add at least one line'));
    if (wo.serviceCategory === 'Warehouse' && wo.grn) {
      const avail = availableToRelease(wo);
      const over = input.lines.find((l) => l.quantity > (avail.get(l.sku) ?? 0));
      if (over)
        return Promise.reject(
          new Error(`Only ${Math.max(0, avail.get(over.sku) ?? 0)} ${over.sku} available to release`),
        );
    }
    const seq =
      Math.max(
        300,
        ...db.workOrders.flatMap((w) => w.customerRequests.map((r) => Number(r.number.split('-')[1]) || 0)),
      ) + 1;
    const req: CustomerRequest = {
      id: newId('cr'),
      number: `CR-${String(seq).padStart(4, '0')}`,
      requestedAt: nowIso(),
      requiredBy: input.requiredBy,
      deliverTo: input.deliverTo,
      lines: input.lines,
      status: 'Open',
    };
    patch(id, (w) =>
      advanceIfCurrent({ ...w, customerRequests: [...w.customerRequests, req] }, 'Out request received'),
    );
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `logged customer request ${req.number}`,
    });
    return latency(req, 200);
  },

  sendRequest(id: string, requestId: string, vendorId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const req = wo.customerRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'Open') return Promise.reject(new Error('Only open requests can be sent'));
    const updated = patch(id, (w) =>
      advanceIfCurrent(
        {
          ...w,
          customerRequests: w.customerRequests.map((r) =>
            r.id === requestId ? { ...r, status: 'Sent to vendor' as const } : r,
          ),
        },
        'Dispatched',
      ),
    );
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `sent ${req.number} to ${lookupName.vendor(vendorId)}`,
    });
    return latency(updated, 200);
  },

  uploadPod(id: string, requestId: string, pod: Pod): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const req = wo.customerRequests.find((r) => r.id === requestId);
    if (!req || (req.status !== 'Sent to vendor' && req.status !== 'Open'))
      return Promise.reject(new Error('Upload a POD for an open or sent request'));
    const updated = patch(id, (w) =>
      advanceIfCurrent(
        {
          ...w,
          customerRequests: w.customerRequests.map((r) =>
            r.id === requestId ? { ...r, status: 'Delivered', pod } : r,
          ),
        },
        'POD received',
      ),
    );
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `uploaded ${pod.number} for ${req.number}`,
    });
    return latency(updated, 250);
  },

  closeRequest(id: string, requestId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const req = wo.customerRequests.find((r) => r.id === requestId);
    if (!req?.pod) return Promise.reject(new Error('Upload the POD first'));
    if (!podResult(req)?.ok)
      return Promise.reject(new Error('The POD does not match the request — raise a variance'));
    const updated = patch(id, (w) => ({
      ...w,
      customerRequests: w.customerRequests.map((r) => (r.id === requestId ? { ...r, status: 'Closed' } : r)),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `closed ${req.number} (POD matches)`,
    });
    return latency(updated, 200);
  },

  raiseRequestVariance(id: string, requestId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const req = wo.customerRequests.find((r) => r.id === requestId);
    if (!req?.pod) return Promise.reject(new Error('Upload the POD first'));
    const r = podResult(req);
    const updated = patch(id, (w) => ({
      ...w,
      customerRequests: w.customerRequests.map((x) =>
        x.id === requestId ? { ...x, status: 'Variance raised' } : x,
      ),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `raised a POD variance on ${req.number}`,
    });
    notify(
      `POD variance on ${wo.number}`,
      `${req.number}: ${r?.mismatches ?? 0} line(s) differ from ${req.pod.number}`,
      `/work-orders/${id}`,
    );
    return latency(updated, 200);
  },

  assignVendor(
    id: string,
    input: { vendorId: string; serviceId: string; agreedCost: number },
  ): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const updated = patch(id, (w) => ({
      ...w,
      vendorAssignments: [...w.vendorAssignments, { id: newId('va'), status: 'Requested', ...input }],
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `assigned ${lookupName.vendor(input.vendorId)}`,
    });
    return latency(updated, 200);
  },

  createInvoice(id: string): Promise<Invoice> {
    const db = protoDb.get();
    const wo = findOrThrow(id);
    if (wo.invoiceId) return Promise.reject(new Error('This job is already invoiced'));
    if (wo.status !== 'Delivered' && wo.status !== 'Completed')
      return Promise.reject(new Error('Invoice after delivery'));
    const next = Math.max(...db.invoices.map((i) => Number(i.number.split('-')[1]))) + 1;
    const terms = db.customers.find((c) => c.id === wo.customerId)?.paymentTermsDays ?? 30;
    const due = new Date(Date.parse(`${PROTO_TODAY}T00:00:00Z`) + terms * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const invoice: Invoice = {
      id: newId('inv'),
      number: `INV-${next}`,
      customerId: wo.customerId,
      workOrderId: wo.id,
      issueDate: PROTO_TODAY,
      dueDate: due,
      lines: wo.lines.map((l) => ({
        id: newId('il'),
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: 0.05,
      })),
      paid: 0,
      status: 'Draft',
    };
    protoDb.update((s) => ({
      ...s,
      invoices: [invoice, ...s.invoices],
      workOrders: s.workOrders.map((w) => (w.id === id ? { ...w, invoiceId: invoice.id } : w)),
    }));
    logActivity({
      entity: 'Invoice',
      entityId: invoice.id,
      entityRef: invoice.number,
      action: `drafted an invoice for ${wo.number}`,
    });
    return latency(invoice, 300);
  },
};

/** Suggested agreed cost from the vendor rate card (rate × quantity of the matching job line). */
export function suggestedCost(
  wo: Pick<WorkOrder, 'lines'>,
  vendorId: string,
  serviceId: string,
): number | undefined {
  const rate = protoDb.get().vendorRates.find((r) => r.vendorId === vendorId && r.serviceId === serviceId);
  if (!rate) return undefined;
  const qty = wo.lines.find((l) => l.serviceId === serviceId)?.quantity ?? 1;
  return Math.round(rate.rate * qty * 100) / 100;
}

export function useWorkOrders(params: ListParams) {
  return useQuery({
    queryKey: ['work-orders', 'list', params],
    queryFn: () => workOrdersApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useWorkOrder(id: string) {
  return useQuery({ queryKey: ['work-orders', 'detail', id], queryFn: () => workOrdersApi.get(id) });
}

export function useWorkOrderPrefill(search: PrefillSearch) {
  return useQuery({
    queryKey: ['work-orders', 'prefill', search],
    queryFn: () => workOrdersApi.prefill(search),
    staleTime: Infinity,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['quotations'] });
    void qc.invalidateQueries({ queryKey: ['vendor-bills'] });
    void qc.invalidateQueries({ queryKey: ['sales-orders'] });
    void qc.invalidateQueries({ queryKey: ['warehouse'] });
  };
}

export function useCreateWorkOrder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: workOrdersApi.create, onSuccess: invalidate });
}

export function useWorkOrderAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      a: { id: string; kind: 'confirm' | 'advance' } | { id: string; kind: 'cancel'; reason: string },
    ) => {
      switch (a.kind) {
        case 'confirm':
          return workOrdersApi.confirm(a.id);
        case 'advance':
          return workOrdersApi.advanceMilestone(a.id);
        case 'cancel':
          return workOrdersApi.cancel(a.id, a.reason);
      }
    },
    onSuccess: invalidate,
  });
}

export function useAssignVendor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; vendorId: string; serviceId: string; agreedCost: number }) =>
      workOrdersApi.assignVendor(id, input),
    onSuccess: invalidate,
  });
}

export function useCreateJobInvoice() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: workOrdersApi.createInvoice, onSuccess: invalidate });
}

export function useCompleteWorkOrder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => workOrdersApi.complete(id), onSuccess: invalidate });
}

export type DocAction =
  | { kind: 'savePl'; id: string; lines: DocLine[] }
  | { kind: 'sendPl'; id: string }
  | { kind: 'uploadGrn'; id: string; grn: Omit<Grn, 'status'> }
  | { kind: 'verifyGrn'; id: string }
  | { kind: 'grnVariance'; id: string }
  | { kind: 'sendRequest'; id: string; requestId: string; vendorId: string }
  | { kind: 'uploadPod'; id: string; requestId: string; pod: Pod }
  | { kind: 'closeRequest'; id: string; requestId: string }
  | { kind: 'requestVariance'; id: string; requestId: string };

export function useDocAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (a: DocAction): Promise<WorkOrder> => {
      switch (a.kind) {
        case 'savePl':
          return workOrdersApi.savePackingList(a.id, a.lines);
        case 'sendPl':
          return workOrdersApi.sendPackingList(a.id);
        case 'uploadGrn':
          return workOrdersApi.uploadGrn(a.id, a.grn);
        case 'verifyGrn':
          return workOrdersApi.verifyGrn(a.id);
        case 'grnVariance':
          return workOrdersApi.raiseGrnVariance(a.id);
        case 'sendRequest':
          return workOrdersApi.sendRequest(a.id, a.requestId, a.vendorId);
        case 'uploadPod':
          return workOrdersApi.uploadPod(a.id, a.requestId, a.pod);
        case 'closeRequest':
          return workOrdersApi.closeRequest(a.id, a.requestId);
        case 'requestVariance':
          return workOrdersApi.raiseRequestVariance(a.id, a.requestId);
      }
    },
    onSuccess: invalidate,
  });
}

export function useCreateRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; requiredBy: string; deliverTo: string; lines: DocLine[] }) =>
      workOrdersApi.createRequest(id, input),
    onSuccess: invalidate,
  });
}

/** File metadata only — the prototype never reads file contents. */
export function toAttachment(file: File): Attachment {
  return {
    fileName: file.name,
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
    uploadedAt: nowIso(),
    uploadedBy: actor(),
  };
}
