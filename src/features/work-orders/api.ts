import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workOrderFinancials } from '@/domain/calc';
import type {
  Attachment,
  Cargo,
  CustomerRequest,
  DocLine,
  Grn,
  Inbound,
  Milestone,
  PackingList,
  Pod,
  PriceLine,
  PurchaseOrder,
  ServiceCategory,
  StockMovement,
  TransportMode,
  VendorAssignment,
  VendorBill,
  WorkOrder,
  WorkOrderStatus,
} from '@/domain/types';
import { nextDocNumber } from '@/domain/numbering';
import { reconcile } from '@/domain/reconcile';
import { jobStock } from '@/domain/stock';
import { milestoneLabels, primaryCategory, SERVICE_CATEGORIES } from '@/domain/workflow';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';
// FLOW-003 WP-B
import { suggestPicks } from '@/domain/controls';
import type { StockItem, WarehouseLocation } from '@/domain/types';
import { createVarianceFromDoc } from '@/features/variances/api';
import { estimatePallets, occupancy, suggestPutaway } from '@/features/warehouse/floor';
import {
  HANDLING_SERVICE_ID,
  handlingDocs,
  proposeHandlingCharges,
  unitsPerPalletFromCargo,
  type HandlingProposal,
} from './wh-handling';

/**
 * Work orders (= Jobs) data source. PROTOTYPE ADAPTER — replace the bodies of `workOrdersApi`
 * with calls to the generated OpenAPI client when the Jobs (Phase 4) contract is published.
 */
export const PROTO_TODAY = '2026-11-23';

/** Document status chips shown on lists (PL → GRN, request → POD). */
export interface DocFlags {
  /** Inbound receipts whose PL was sent but no GRN has come back yet. */
  awaitingGrn: number;
  /** Inbound receipts with an unresolved GRN variance. */
  grnVariance: number;
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

export interface PurchaseOrderRef {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  serviceName: string;
  amount: number;
  status: PurchaseOrder['status'];
  vendorBillId?: string;
}

export interface WorkOrderDetail extends WorkOrderRow {
  invoiceNumber?: string;
  purchaseOrders: PurchaseOrderRef[];
  salesOrderNumber?: string;
  purchaseInvoices: PurchaseInvoiceRef[];
  movements: (StockMovement & { customerName: string })[];
  assignments: (VendorAssignment & {
    vendorName: string;
    serviceName: string;
    poNumber?: string;
    poStatus?: PurchaseOrder['status'];
  })[];
}

export interface WorkOrderInput {
  customerId: string;
  source: WorkOrder['source'];
  salesOrderId?: string;
  /** Every service type on the job (transport, warehouse and/or direct service). */
  serviceCategories: ServiceCategory[];
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
  serviceCategories?: ServiceCategory[];
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

export function grnResult(ib: Pick<Inbound, 'packingList' | 'grn'>) {
  if (!ib.grn) return undefined;
  return reconcile(
    ib.packingList.lines,
    ib.grn.lines.map((l) => ({ sku: l.sku, qty: l.receivedQty, damaged: l.damagedQty, remarks: l.remarks })),
  );
}

export type InboundStage = 'Draft PL' | 'Expected' | 'GRN uploaded' | 'Verified' | 'Variance raised';

/** Where one inbound receipt is in its PL → GRN → check cycle. */
export function inboundStage(ib: Inbound): InboundStage {
  if (!ib.grn) return ib.packingList.status === 'Sent to warehouse' ? 'Expected' : 'Draft PL';
  if (ib.grn.status === 'Verified') return 'Verified';
  if (ib.grn.status === 'Variance raised') return 'Variance raised';
  return 'GRN uploaded';
}

export function podResult(req: CustomerRequest) {
  if (!req.pod) return undefined;
  return reconcile(
    req.lines,
    req.pod.lines.map((l) => ({ sku: l.sku, qty: l.deliveredQty, remarks: l.remarks })),
  );
}

export function docFlags(wo: WorkOrder): DocFlags {
  return {
    awaitingGrn: wo.inbounds.filter((ib) => inboundStage(ib) === 'Expected').length,
    grnVariance: wo.inbounds.filter(
      (ib) =>
        ib.grn?.status === 'Variance raised' ||
        (!!ib.grn && ib.grn.status !== 'Verified' && !grnResult(ib)?.ok),
    ).length,
    awaitingPod: wo.customerRequests.filter((r) => !r.pod && r.status !== 'Closed').length,
    podVariance: wo.customerRequests.filter(
      (r) => r.status === 'Variance raised' || (r.pod && r.status !== 'Closed' && !podResult(r)?.ok),
    ).length,
  };
}

/** Good quantity per SKU still available to release (running stock across ALL inbounds and releases). */
export function availableToRelease(wo: WorkOrder, excludeRequestId?: string): Map<string, number> {
  return new Map(jobStock(wo, excludeRequestId).map((s) => [s.sku, s.available]));
}

/** Release checks apply once the job has received goods on at least one GRN. */
export function hasReceivedStock(wo: WorkOrder): boolean {
  return wo.inbounds.some((ib) => !!ib.grn);
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

/** Milestone labels for a multi-service job: Transport (by mode) → Warehouse → Service, one confirmation step. */
export function composedMilestoneLabels(categories: ServiceCategory[], mode?: TransportMode): string[] {
  const ordered = SERVICE_CATEGORIES.filter((c) => categories.includes(c));
  const firstSteps = new Set(['Booking confirmed', 'Order confirmed']);
  const labels: string[] = [];
  ordered.forEach((c, i) => {
    for (const label of milestoneLabels(c, mode)) {
      if (i > 0 && firstSteps.has(label)) continue;
      if (!labels.includes(label)) labels.push(label);
    }
  });
  return labels.length ? labels : [...milestoneLabels('Service')];
}

function buildMilestones(
  categories: ServiceCategory[],
  mode: TransportMode | undefined,
  confirmed: boolean,
): Milestone[] {
  return composedMilestoneLabels(categories, mode).map((label, i) => ({
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

function findInbound(id: string, inboundId: string): Inbound {
  const ib = findOrThrow(id).inbounds.find((x) => x.id === inboundId);
  if (!ib) throw new Error('Inbound receipt not found');
  return ib;
}

function patchInbound(id: string, inboundId: string, fn: (ib: Inbound) => Inbound): WorkOrder {
  return patch(id, (w) => ({ ...w, inbounds: w.inbounds.map((x) => (x.id === inboundId ? fn(x) : x)) }));
}

export const workOrdersApi = {
  list(params: ListParams): Promise<Page<WorkOrderRow>> {
    const rows = [...protoDb.get().workOrders]
      .filter((w) => !params.type || w.serviceCategories.includes(params.type as ServiceCategory))
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
      purchaseOrders: db.purchaseOrders
        .filter((p) => p.workOrderId === id)
        .map((p) => ({
          id: p.id,
          number: p.number,
          vendorId: p.vendorId,
          vendorName: lookupName.vendor(p.vendorId),
          serviceName: lookupName.service(p.serviceId),
          amount: p.amount,
          status: p.status,
          vendorBillId: p.vendorBillId,
        })),
      assignments: wo.vendorAssignments.map((a) => {
        const po = a.purchaseOrderId ? db.purchaseOrders.find((p) => p.id === a.purchaseOrderId) : undefined;
        return {
          ...a,
          vendorName: lookupName.vendor(a.vendorId),
          serviceName: lookupName.service(a.serviceId),
          poNumber: po?.number,
          poStatus: po?.status,
        };
      }),
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
          serviceCategories: so.serviceCategories,
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
          serviceCategories: q.serviceCategories,
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
          serviceCategories: [category],
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
    const categories = SERVICE_CATEGORIES.filter((c) => input.serviceCategories.includes(c));
    const primary = primaryCategory(categories);
    const hasTransport = categories.includes('Transport');
    const wo: WorkOrder = {
      id: newId('wo'),
      number: `JOB-${next}`,
      customerId: input.customerId,
      serviceCategory: primary,
      serviceCategories: categories,
      salesOrderId: input.salesOrderId,
      source: input.source,
      mode: hasTransport ? input.mode : undefined,
      origin: input.origin,
      destination: input.destination,
      cargo: input.cargo,
      status: input.status,
      priority: input.priority,
      milestones: buildMilestones(categories, hasTransport ? input.mode : undefined, confirmed),
      vendorAssignments: [],
      lines: input.lines.map((l) => ({ ...l, id: newId('ln') })),
      hasWarehouse: categories.includes('Warehouse') || input.hasWarehouse,
      inbounds: input.packingLines?.length
        ? [
            {
              id: newId('ib'),
              number: `IN-${next}-01`,
              reference: 'First consignment',
              expectedAt: input.eta,
              packingList: {
                number: `PL-${next}-01`,
                status: 'Draft',
                source: 'Staff',
                lines: input.packingLines.map((l) => ({ ...l, sku: l.sku.trim().toUpperCase() })),
              },
            },
          ]
        : [],
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
          ? 'created a direct job'
          : `created a job from ${input.source.type.toLowerCase()}`,
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
      action: 'confirmed the job',
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
      action: `cancelled the job (${reason})`,
    });
    return latency(updated, 200);
  },

  /**
   * Complete the job. Transport jobs complete after delivery; warehouse / direct-service jobs may
   * complete from In progress. Industry standard: vendor POs were issued at assignment, so
   * completion marks those POs Completed; vendor invoices are then recorded against them
   * (3-way match) and the customer is invoiced from the sales order.
   */
  complete(id: string): Promise<{ wo: WorkOrder; awaitingInvoice: PurchaseOrder[] }> {
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
    protoDb.update((s) => ({
      ...s,
      purchaseOrders: s.purchaseOrders.map((p) =>
        p.workOrderId === id && !['Billed', 'Cancelled', 'Completed'].includes(p.status)
          ? { ...p, status: 'Completed' as const }
          : p,
      ),
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
    const awaitingInvoice = protoDb
      .get()
      .purchaseOrders.filter((p) => p.workOrderId === id && p.status === 'Completed' && !p.vendorBillId);
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: awaitingInvoice.length
        ? `completed the job — ${awaitingInvoice.length} PO${awaitingInvoice.length === 1 ? '' : 's'} awaiting vendor invoice`
        : 'completed the job',
    });
    return latency({ wo: findOrThrow(id), awaitingInvoice }, 250);
  },

  // ---------- Documents: inbound receipts (many per job): PL → GRN ----------
  addInbound(
    id: string,
    input: {
      reference: string;
      expectedAt: string;
      lines: DocLine[];
      attachment?: Attachment;
      source: NonNullable<PackingList['source']>;
      send: boolean;
      /** Shipment header (ASN, BOE, container, seal, BL, supplier, location). */
      header?: InboundHeader;
    },
  ): Promise<Inbound> {
    const wo = findOrThrow(id);
    if (!input.lines.length) return Promise.reject(new Error('Add at least one product line'));
    const seq = wo.inbounds.length + 1;
    const n = wo.number.split('-')[1];
    const ib: Inbound = {
      id: newId('ib'),
      number: `IN-${n}-${String(seq).padStart(2, '0')}`,
      reference: input.reference,
      expectedAt: input.expectedAt,
      ...input.header,
      packingList: {
        number: `PL-${n}-${String(seq).padStart(2, '0')}`,
        status: input.send ? 'Sent to warehouse' : 'Draft',
        sentAt: input.send ? nowIso() : undefined,
        lines: input.lines.map((l) => ({ ...l, sku: l.sku.trim().toUpperCase() })),
        attachment: input.attachment,
        source: input.source,
      },
    };
    patch(id, (w) => {
      const next = { ...w, hasWarehouse: true, inbounds: [...w.inbounds, ib] };
      return input.send ? advanceIfCurrent(next, 'PL sent to warehouse') : next;
    });
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `added inbound ${ib.number} (${ib.packingList.lines.length} PL lines${input.source === 'Excel import' ? ', imported from Excel' : ''})`,
    });
    return latency(ib, 200);
  },

  savePackingList(id: string, inboundId: string, lines: DocLine[]): Promise<WorkOrder> {
    const ib = findInbound(id, inboundId);
    if (ib.packingList.status === 'Sent to warehouse')
      return Promise.reject(new Error('The PL was already sent to the warehouse'));
    const updated = patchInbound(id, inboundId, (x) => ({
      ...x,
      packingList: { ...x.packingList, lines: lines.map((l) => ({ ...l, sku: l.sku.trim().toUpperCase() })) },
    }));
    return latency(updated, 150);
  },

  sendPackingList(id: string, inboundId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const ib = findInbound(id, inboundId);
    if (!ib.packingList.lines.length) return Promise.reject(new Error('Add at least one product line first'));
    patchInbound(id, inboundId, (x) => ({
      ...x,
      packingList: { ...x.packingList, status: 'Sent to warehouse', sentAt: nowIso() },
    }));
    const updated = patch(id, (w) => advanceIfCurrent(w, 'PL sent to warehouse'));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `sent ${ib.packingList.number} (${ib.number}) to the warehouse team`,
    });
    return latency(updated, 200);
  },

  /** Issue Aenix's own GRN to the customer (AEN061 layout) from an uploaded vendor GRN. */
  issueCustomerGrn(id: string, inboundId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const ib = findInbound(id, inboundId);
    if (!ib.grn) return Promise.reject(new Error('Upload the vendor GRN first'));
    if (ib.grn.customerGrnNumber) return latency(wo, 100);
    const db = protoDb.get();
    const existing = db.workOrders.flatMap((w) => w.inbounds.map((x) => x.grn?.customerGrnNumber ?? ''));
    const number = nextDocNumber(existing, db.company.grnPrefix, 3, 60);
    const updated = patchInbound(id, inboundId, (x) => ({
      ...x,
      grn: { ...x.grn!, customerGrnNumber: number, customerGrnIssuedAt: nowIso() },
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `issued customer GRN ${number} for ${ib.number}`,
    });
    return latency(updated, 200);
  },

  uploadGrn(id: string, inboundId: string, grn: Omit<Grn, 'status'>): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const ib = findInbound(id, inboundId);
    if (ib.packingList.status !== 'Sent to warehouse')
      return Promise.reject(new Error('Send the PL to the warehouse before uploading a GRN'));
    patchInbound(id, inboundId, (x) => ({
      ...x,
      grn: {
        ...grn,
        lines: grn.lines.map((l) => ({ ...l, sku: l.sku.trim().toUpperCase() })),
        status: 'Uploaded',
      },
    }));
    const updated = patch(id, (w) => advanceIfCurrent(w, 'GRN received'));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `uploaded ${grn.number} for ${ib.number}`,
    });
    return latency(updated, 250);
  },

  verifyGrn(id: string, inboundId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const ib = findInbound(id, inboundId);
    if (!ib.grn) return Promise.reject(new Error('No GRN uploaded'));
    if (!grnResult(ib)?.ok)
      return Promise.reject(new Error('The GRN does not match the PL — raise a variance instead'));
    patchInbound(id, inboundId, (x) => ({ ...x, grn: { ...x.grn!, status: 'Verified' } }));
    const updated = patch(id, (w) => advanceIfCurrent(w, 'Goods stored'));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `verified ${ib.grn.number} against ${ib.packingList.number}`,
    });
    return latency(updated, 200);
  },

  raiseGrnVariance(id: string, inboundId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const ib = findInbound(id, inboundId);
    if (!ib.grn) return Promise.reject(new Error('No GRN uploaded'));
    const r = grnResult(ib);
    const updated = patchInbound(id, inboundId, (x) => ({
      ...x,
      grn: { ...x.grn!, status: 'Variance raised' },
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `raised a GRN variance on ${ib.grn.number} (${ib.number})`,
    });
    // FLOW-003 W3: open the variance record (lines, photos, outcome, approval).
    const variance = createVarianceFromDoc({ workOrderId: id, source: 'GRN', docId: inboundId });
    notify(
      `GRN variance on ${wo.number}`,
      `${ib.grn.number}: ${r?.mismatches ?? 0} line(s) differ from ${ib.packingList.number} — ${variance.number}`,
      `/variances/${variance.id}`,
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
    if (hasReceivedStock(wo)) {
      const avail = availableToRelease(wo);
      const over = input.lines.find((l) => l.quantity > (avail.get(l.sku.trim().toUpperCase()) ?? 0));
      if (over)
        return Promise.reject(
          new Error(
            `Only ${Math.max(0, avail.get(over.sku.trim().toUpperCase()) ?? 0)} ${over.sku} available to release`,
          ),
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
      lines: input.lines.map((l) => ({ ...l, sku: l.sku.trim().toUpperCase() })),
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
    // FLOW-003 W7: the delivered quantities leave the picked lots (never below zero).
    try {
      releasePickedLots(wo, req, pod);
    } catch (e) {
      return Promise.reject(e);
    }
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
    // FLOW-003 W3: open the variance record (lines, photos, outcome, approval).
    const variance = createVarianceFromDoc({ workOrderId: id, source: 'POD', docId: requestId });
    notify(
      `POD variance on ${wo.number}`,
      `${req.number}: ${r?.mismatches ?? 0} line(s) differ from ${req.pod.number} — ${variance.number}`,
      `/variances/${variance.id}`,
    );
    return latency(updated, 200);
  },

  /** Assign a vendor and issue the purchase order (industry standard: PO before the work). */
  assignVendor(
    id: string,
    input: { vendorId: string; serviceId: string; agreedCost: number },
  ): Promise<{ wo: WorkOrder; po: PurchaseOrder }> {
    const db = protoDb.get();
    const wo = findOrThrow(id);
    const next = Math.max(6100, ...db.purchaseOrders.map((p) => Number(p.number.split('-')[1]) || 0)) + 1;
    const assignmentId = newId('va');
    const po: PurchaseOrder = {
      id: newId('po'),
      number: `PO-${next}`,
      vendorId: input.vendorId,
      workOrderId: id,
      salesOrderId: wo.salesOrderId,
      serviceId: input.serviceId,
      description: `${lookupName.service(input.serviceId)} — ${wo.number}`,
      amount: input.agreedCost,
      vatRate: 0.05,
      issuedAt: nowIso(),
      status: 'Issued',
    };
    protoDb.update((s) => ({
      ...s,
      purchaseOrders: [po, ...s.purchaseOrders],
      workOrders: s.workOrders.map((w) =>
        w.id === id
          ? {
              ...w,
              vendorAssignments: [
                ...w.vendorAssignments,
                { id: assignmentId, status: 'Requested', purchaseOrderId: po.id, ...input },
              ],
            }
          : w,
      ),
    }));
    logActivity({
      entity: 'Purchase order',
      entityId: po.id,
      entityRef: po.number,
      action: `issued to ${lookupName.vendor(input.vendorId)} for ${wo.number}`,
    });
    return latency({ wo: findOrThrow(id), po }, 200);
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
    void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
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

export function useCompleteWorkOrder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => workOrdersApi.complete(id), onSuccess: invalidate });
}

export type InboundHeader = Partial<
  Pick<
    Inbound,
    | 'asnNo'
    | 'boeNo'
    | 'containerNo'
    | 'sealNo'
    | 'blNo'
    | 'supplierName'
    | 'location'
    // FLOW-003 W1 / W12
    | 'expectedTime'
    | 'kind'
  >
>;

export type DocAction =
  | { kind: 'savePl'; id: string; inboundId: string; lines: DocLine[] }
  | { kind: 'sendPl'; id: string; inboundId: string }
  | { kind: 'uploadGrn'; id: string; inboundId: string; grn: Omit<Grn, 'status'> }
  | { kind: 'verifyGrn'; id: string; inboundId: string }
  | { kind: 'grnVariance'; id: string; inboundId: string }
  | { kind: 'issueCustomerGrn'; id: string; inboundId: string }
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
          return workOrdersApi.savePackingList(a.id, a.inboundId, a.lines);
        case 'sendPl':
          return workOrdersApi.sendPackingList(a.id, a.inboundId);
        case 'uploadGrn':
          return workOrdersApi.uploadGrn(a.id, a.inboundId, a.grn);
        case 'verifyGrn':
          return workOrdersApi.verifyGrn(a.id, a.inboundId);
        case 'grnVariance':
          return workOrdersApi.raiseGrnVariance(a.id, a.inboundId);
        case 'issueCustomerGrn':
          return workOrdersApi.issueCustomerGrn(a.id, a.inboundId);
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

export function useAddInbound() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof workOrdersApi.addInbound>[1]) =>
      workOrdersApi.addInbound(id, input),
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

/** The job's warehouse vendor (for remembered GRN column mappings); falls back to the own warehouse team. */
export function warehouseVendorOf(wo: Pick<WorkOrder, 'vendorAssignments'>): { id: string; name: string } {
  const db = protoDb.get();
  for (const a of wo.vendorAssignments) {
    const v = db.vendors.find((x) => x.id === a.vendorId);
    if (v?.category === 'Warehouse') return { id: v.id, name: v.name };
  }
  return { id: 'warehouse', name: 'the warehouse team' };
}

// ---- FLOW-003 WP-B ----
// Warehouse floor on the job (optional module "own warehouse floor"): put-away of verified GRNs into
// bin locations as lot-level stock (W4/W12), FEFO pick lists and delivery notes (W6/W7), stock out on
// POD, and handling charges proposed from GRN / POD activity (W14). PROTOTYPE ADAPTER.

export interface PutawayLine {
  sku: string;
  description: string;
  uom: string;
  goodQty: number;
  damagedQty: number;
  batch?: string;
  expiryDate?: string;
  pallets: number;
  /** Suggested bin (empty when no bin has space). */
  locationId: string;
}

export interface PutawayPlan {
  isReturn: boolean;
  lines: PutawayLine[];
  locations: { value: string; label: string; zone: WarehouseLocation['zone']; free: number }[];
}

export interface PickLine {
  lotId: string;
  sku: string;
  batch?: string;
  expiryDate?: string;
  locationCode: string;
  qty: number;
}

export interface PickPlan {
  lines: {
    sku: string;
    description: string;
    uom: string;
    requested: number;
    picks: PickLine[];
    short: number;
  }[];
  short: number;
}

/** Lots of the customer still free to pick: on-hand minus picks confirmed on other undelivered requests. */
function pickableLots(customerId: string, excludeRequestId?: string): StockItem[] {
  const db = protoDb.get();
  const reserved = new Map<string, number>();
  for (const w of db.workOrders)
    for (const r of w.customerRequests)
      if (r.id !== excludeRequestId && r.picks && !r.pod && r.status !== 'Closed')
        for (const p of r.picks) reserved.set(p.lotId, (reserved.get(p.lotId) ?? 0) + p.qty);
  return db.stockItems
    .filter((s) => s.customerId === customerId)
    .map((s) => ({ ...s, qtyOnHand: Math.max(0, s.qtyOnHand - (reserved.get(s.id) ?? 0)) }));
}

function buildPickPlan(wo: WorkOrder, req: CustomerRequest): PickPlan {
  const lots = pickableLots(wo.customerId, req.id);
  const lines = req.lines.map((l) => {
    const { picks, short } = suggestPicks(lots, l.sku.trim().toUpperCase(), l.quantity);
    // Consume the suggestion so two lines of the same SKU do not pick the same units.
    for (const p of picks) {
      const lot = lots.find((x) => x.id === p.lot.id);
      if (lot) lot.qtyOnHand -= p.qty;
    }
    return {
      sku: l.sku,
      description: l.description,
      uom: l.uom,
      requested: l.quantity,
      picks: picks.map((p) => ({
        lotId: p.lot.id,
        sku: p.lot.sku,
        batch: p.lot.batch,
        expiryDate: p.lot.expiryDate,
        locationCode: p.lot.location,
        qty: p.qty,
      })),
      short,
    };
  });
  return { lines, short: lines.reduce((s, l) => s + l.short, 0) };
}

/**
 * W7: when the POD comes back, the delivered quantities leave the picked lots (FEFO order of the
 * pick list). Throws — and changes nothing — if any lot would go below zero.
 */
function releasePickedLots(wo: WorkOrder, req: CustomerRequest, pod: Pod): void {
  if (!req.picks?.length) return;
  const db = protoDb.get();
  const stock = db.stockItems.map((s) => ({ ...s }));
  const moved: { stockItemId: string; quantity: number }[] = [];
  for (const line of pod.lines) {
    let left = line.deliveredQty;
    for (const p of req.picks.filter((x) => x.sku === line.sku.trim().toUpperCase())) {
      if (left <= 0) break;
      const lot = stock.find((s) => s.id === p.lotId);
      if (!lot) throw new Error(`Picked lot for ${p.sku} no longer exists`);
      const take = Math.min(p.qty, left);
      if (lot.qtyOnHand < take)
        throw new Error(
          `${p.sku} at ${p.locationCode}: only ${lot.qtyOnHand} on hand — cannot release ${take}. Check the stock first.`,
        );
      const perPallet = lot.qtyOnHand > 0 && lot.pallets > 0 ? lot.qtyOnHand / lot.pallets : 0;
      lot.qtyOnHand -= take;
      lot.pallets =
        lot.qtyOnHand === 0
          ? 0
          : perPallet > 0
            ? Math.max(1, Math.round(lot.qtyOnHand / perPallet))
            : lot.pallets;
      moved.push({ stockItemId: lot.id, quantity: take });
      left -= take;
    }
  }
  if (!moved.length) return;
  const lastNo = Math.max(
    0,
    ...db.stockMovements.filter((m) => m.type === 'Dispatch').map((m) => Number(m.number.split('-')[1]) || 0),
  );
  const movement: StockMovement = {
    id: newId('mv'),
    number: `DSP-${String(lastNo + 1).padStart(4, '0')}`,
    type: 'Dispatch',
    customerId: wo.customerId,
    workOrderId: wo.id,
    date: pod.deliveredAt.slice(0, 10),
    warehouse: db.stockItems.find((s) => s.id === moved[0]!.stockItemId)?.warehouse ?? 'JAFZA WH-1',
    lines: moved,
    status: 'Posted',
    reference: `${req.number} · ${pod.number}${req.dispatchNoteNumber ? ` · ${req.dispatchNoteNumber}` : ''}`,
  };
  protoDb.update((s) => ({ ...s, stockItems: stock, stockMovements: [movement, ...s.stockMovements] }));
}

function handlingRate(wo: WorkOrder): { unitPrice: number; unitCost: number; unit: string } {
  const db = protoDb.get();
  const so = wo.salesOrderId ? db.salesOrders.find((o) => o.id === wo.salesOrderId) : undefined;
  const line =
    wo.lines.find((l) => l.serviceId === HANDLING_SERVICE_ID) ??
    so?.lines.find((l) => l.serviceId === HANDLING_SERVICE_ID);
  if (line) return { unitPrice: line.unitPrice, unitCost: line.unitCost, unit: line.unit };
  const svc = db.services.find((s) => s.id === HANDLING_SERVICE_ID);
  return { unitPrice: 0, unitCost: 0, unit: svc?.unit ?? 'Pallet' };
}

export const whApi = {
  /** W4: suggested bin per GRN line (same SKU's bin, else first ambient with space; returns → quarantine). */
  putawayPlan(id: string, inboundId: string): Promise<PutawayPlan> {
    const db = protoDb.get();
    const wo = findOrThrow(id);
    const ib = findInbound(id, inboundId);
    if (!ib.grn) return Promise.reject(new Error('Upload the GRN first'));
    const isReturn = ib.kind === 'Return';
    const planned = new Map<string, number>();
    const lines: PutawayLine[] = ib.grn.lines.map((g) => {
      const pl = ib.packingList.lines.find((l) => l.sku === g.sku);
      const goodQty = Math.max(0, g.receivedQty - g.damagedQty);
      const pallets = estimatePallets(goodQty);
      const loc = suggestPutaway(
        { sku: g.sku, customerId: wo.customerId, pallets, quarantine: isReturn },
        db.warehouseLocations,
        db.stockItems,
        planned,
      );
      if (loc) planned.set(loc.id, (planned.get(loc.id) ?? 0) + pallets);
      return {
        sku: g.sku,
        description: pl?.description ?? g.sku,
        uom: pl?.uom ?? 'Unit',
        goodQty,
        damagedQty: g.damagedQty,
        batch: g.batch ?? pl?.batch,
        expiryDate: g.expiryDate ?? pl?.expiryDate,
        pallets,
        locationId: loc?.id ?? '',
      };
    });
    const locations = occupancy(
      db.warehouseLocations.filter((l) => l.active && l.zone !== 'Dispatch'),
      db.stockItems,
    )
      .sort((a, b) => a.location.code.localeCompare(b.location.code))
      .map((o) => ({
        value: o.location.id,
        label: `${o.location.code} · ${o.location.zone} · ${o.free} free`,
        zone: o.location.zone,
        free: o.free,
      }));
    return latency({ isReturn, lines, locations }, 80);
  },

  /** W4/W12: create lot-level stock at the chosen bins (damaged units go to quarantine as Damaged). */
  confirmPutaway(
    id: string,
    inboundId: string,
    lines: { sku: string; locationId: string; pallets: number }[],
  ): Promise<WorkOrder> {
    const db = protoDb.get();
    const wo = findOrThrow(id);
    const ib = findInbound(id, inboundId);
    if (!db.company.modules?.ownWarehouseFloor)
      return Promise.reject(new Error('The own warehouse floor module is switched off'));
    if (!ib.grn || (ib.grn.status !== 'Verified' && ib.grn.status !== 'Variance raised'))
      return Promise.reject(new Error('Verify the GRN (or raise its variance) before put-away'));
    if (ib.putawayDone) return Promise.reject(new Error('Put-away is already confirmed'));
    const isReturn = ib.kind === 'Return';
    const planned = new Map<string, number>();
    const quarantine = db.warehouseLocations.find((l) => l.active && l.zone === 'Quarantine');
    const receivedAt = ib.grn.receivedAt.slice(0, 10);
    const lots: StockItem[] = [];
    for (const g of ib.grn.lines) {
      const pl = ib.packingList.lines.find((l) => l.sku === g.sku);
      const chosen = lines.find((l) => l.sku === g.sku);
      const goodQty = Math.max(0, g.receivedQty - g.damagedQty);
      const base = {
        sku: g.sku,
        customerId: wo.customerId,
        description: pl?.description ?? g.sku,
        uom: pl?.uom ?? 'Unit',
        receivedAt,
        batch: g.batch ?? pl?.batch,
        expiryDate: g.expiryDate ?? pl?.expiryDate,
        workOrderId: wo.id,
      };
      if (goodQty > 0) {
        const loc = db.warehouseLocations.find((l) => l.id === chosen?.locationId && l.active);
        if (!loc) return Promise.reject(new Error(`Choose a bin for ${g.sku}`));
        const pallets = Math.round(chosen?.pallets ?? 0);
        if (!(pallets > 0)) return Promise.reject(new Error(`Enter the pallets for ${g.sku}`));
        planned.set(loc.id, (planned.get(loc.id) ?? 0) + pallets);
        lots.push({
          ...base,
          id: newId('stk'),
          warehouse: loc.warehouse,
          location: loc.code,
          locationId: loc.id,
          qtyOnHand: goodQty,
          pallets,
          stockStatus: isReturn || loc.zone === 'Quarantine' ? 'Quarantine' : 'Available',
        });
      }
      if (g.damagedQty > 0) {
        const pallets = estimatePallets(g.damagedQty);
        if (quarantine) planned.set(quarantine.id, (planned.get(quarantine.id) ?? 0) + pallets);
        lots.push({
          ...base,
          id: newId('stk'),
          warehouse: quarantine?.warehouse ?? 'JAFZA WH-1',
          location: quarantine?.code ?? 'QUARANTINE',
          locationId: quarantine?.id,
          qtyOnHand: g.damagedQty,
          pallets,
          stockStatus: 'Damaged',
        });
      }
    }
    // Capacity check per bin (quarantine may overflow: damaged goods must be segregated anyway).
    for (const o of occupancy(db.warehouseLocations, db.stockItems, planned)) {
      if (
        o.location.zone !== 'Quarantine' &&
        planned.has(o.location.id) &&
        o.used > o.location.capacityPallets
      )
        return Promise.reject(
          new Error(
            `${o.location.code} has space for ${o.location.capacityPallets - (o.used - planned.get(o.location.id)!)} pallet(s) only`,
          ),
        );
    }
    const lastNo = Math.max(
      0,
      ...db.stockMovements
        .filter((m) => m.type === 'Receipt')
        .map((m) => Number(m.number.split('-')[1]) || 0),
    );
    const movement: StockMovement = {
      id: newId('mv'),
      number: `GRN-${String(lastNo + 1).padStart(4, '0')}`,
      type: 'Receipt',
      customerId: wo.customerId,
      workOrderId: wo.id,
      date: receivedAt,
      warehouse: lots[0]?.warehouse ?? 'JAFZA WH-1',
      lines: lots.map((l) => ({ stockItemId: l.id, quantity: l.qtyOnHand })),
      status: 'Posted',
      reference: `${ib.number} put-away (${ib.grn.number})${isReturn ? ' — customer return' : ''}`,
    };
    protoDb.update((s) => ({
      ...s,
      stockItems: [...lots, ...s.stockItems],
      stockMovements: lots.length ? [movement, ...s.stockMovements] : s.stockMovements,
    }));
    const updated = patchInbound(id, inboundId, (x) => ({ ...x, putawayDone: true }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `confirmed put-away of ${ib.number} (${lots.length} lot${lots.length === 1 ? '' : 's'})`,
    });
    return latency(updated, 200);
  },

  /** W6: FEFO pick suggestion over the customer's available lots. */
  pickPlan(id: string, requestId: string): Promise<PickPlan> {
    const wo = findOrThrow(id);
    const req = wo.customerRequests.find((r) => r.id === requestId);
    if (!req) return Promise.reject(new Error('Request not found'));
    return latency(buildPickPlan(wo, req), 80);
  },

  confirmPicks(id: string, requestId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const req = wo.customerRequests.find((r) => r.id === requestId);
    if (!req) return Promise.reject(new Error('Request not found'));
    if (req.pod) return Promise.reject(new Error('The POD is already recorded'));
    const plan = buildPickPlan(wo, req);
    const picks = plan.lines.flatMap((l) => l.picks);
    if (!picks.length) return Promise.reject(new Error('No available stock to pick for this request'));
    const updated = patch(id, (w) => ({
      ...w,
      customerRequests: w.customerRequests.map((r) =>
        r.id === requestId ? { ...r, picks, pickedAt: nowIso() } : r,
      ),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `confirmed the pick list for ${req.number} (${picks.length} lot${picks.length === 1 ? '' : 's'}${plan.short ? `, ${plan.short} short` : ''})`,
    });
    return latency(updated, 200);
  },

  /** W7: delivery note number (DLV-###) for a picked request. */
  issueDispatchNote(id: string, requestId: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    const req = wo.customerRequests.find((r) => r.id === requestId);
    if (!req?.picks?.length) return Promise.reject(new Error('Confirm the pick list first'));
    if (req.dispatchNoteNumber) return latency(wo, 50);
    const existing = protoDb
      .get()
      .workOrders.flatMap((w) => w.customerRequests.map((r) => r.dispatchNoteNumber ?? ''));
    const number = nextDocNumber(existing, 'DLV-');
    const updated = patch(id, (w) => ({
      ...w,
      customerRequests: w.customerRequests.map((r) =>
        r.id === requestId ? { ...r, dispatchNoteNumber: number } : r,
      ),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `issued delivery note ${number} for ${req.number}`,
    });
    return latency(updated, 150);
  },

  /** W14: handling lines proposed from verified GRNs and closed PODs not billed yet. */
  handlingProposal(id: string): Promise<HandlingProposal[]> {
    const wo = findOrThrow(id);
    return latency(
      proposeHandlingCharges(handlingDocs(wo), wo.lines, handlingRate(wo), unitsPerPalletFromCargo(wo.cargo)),
      80,
    );
  },

  addHandlingCharges(
    id: string,
    lines: Pick<HandlingProposal, 'description' | 'quantity' | 'unit' | 'unitPrice' | 'unitCost'>[],
  ): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (wo.invoiceId)
      return Promise.reject(new Error('This job is already invoiced — bill the handling on a new invoice'));
    if (wo.status === 'Cancelled') return Promise.reject(new Error('The job is cancelled'));
    const fresh = lines.filter(
      (l) => l.quantity > 0 && !wo.lines.some((x) => x.description === l.description),
    );
    if (!fresh.length) return Promise.reject(new Error('Nothing new to add'));
    if (fresh.some((l) => l.unitPrice < 0)) return Promise.reject(new Error('Rates cannot be negative'));
    const updated = patch(id, (w) => ({
      ...w,
      lines: [
        ...w.lines,
        ...fresh.map((l): PriceLine => ({
          id: newId('pl'),
          serviceId: HANDLING_SERVICE_ID,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          unitCost: l.unitCost,
        })),
      ],
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: `added ${fresh.length} handling charge line${fresh.length === 1 ? '' : 's'} from warehouse activity`,
    });
    return latency(updated, 200);
  },
};

export function usePutawayPlan(id: string, inboundId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['work-orders', 'putaway', id, inboundId],
    queryFn: () => whApi.putawayPlan(id, inboundId),
    enabled,
  });
}

export function usePickPlan(id: string, requestId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['work-orders', 'pick-plan', id, requestId],
    queryFn: () => whApi.pickPlan(id, requestId),
    enabled,
  });
}

export function useHandlingProposal(id: string) {
  return useQuery({
    queryKey: ['work-orders', 'handling', id],
    queryFn: () => whApi.handlingProposal(id),
  });
}

export type WhAction =
  | {
      kind: 'putaway';
      id: string;
      inboundId: string;
      lines: { sku: string; locationId: string; pallets: number }[];
    }
  | { kind: 'confirmPicks'; id: string; requestId: string }
  | { kind: 'dispatchNote'; id: string; requestId: string }
  | {
      kind: 'addHandling';
      id: string;
      lines: Pick<HandlingProposal, 'description' | 'quantity' | 'unit' | 'unitPrice' | 'unitCost'>[];
    };

export function useWhAction() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: WhAction): Promise<WorkOrder> => {
      switch (a.kind) {
        case 'putaway':
          return whApi.confirmPutaway(a.id, a.inboundId, a.lines);
        case 'confirmPicks':
          return whApi.confirmPicks(a.id, a.requestId);
        case 'dispatchNote':
          return whApi.issueDispatchNote(a.id, a.requestId);
        case 'addHandling':
          return whApi.addHandlingCharges(a.id, a.lines);
      }
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ['variances'] });
    },
  });
}
