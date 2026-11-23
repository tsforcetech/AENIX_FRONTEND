import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workOrderFinancials } from '@/domain/calc';
import type {
  Cargo,
  Invoice,
  Milestone,
  PriceLine,
  StockMovement,
  TransportMode,
  VendorAssignment,
  WorkOrder,
  WorkOrderStatus,
} from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';

/**
 * Work orders (= Jobs) data source. PROTOTYPE ADAPTER — replace the bodies of `workOrdersApi`
 * with calls to the generated OpenAPI client when the Jobs (Phase 4) contract is published.
 */
export const PROTO_TODAY = '2026-11-23';

export const MILESTONE_TEMPLATES: Record<TransportMode, string[]> = {
  Road: [
    'Booking confirmed',
    'Vehicle assigned',
    'Loaded at origin',
    'In transit',
    'Border / customs cleared',
    'Delivered',
  ],
  Sea: [
    'Booking confirmed',
    'Container loaded',
    'Vessel departed',
    'Arrived at port',
    'Customs cleared',
    'Delivered to warehouse',
  ],
  Air: [
    'Booking confirmed',
    'Cargo received at origin',
    'Flight departed',
    'Arrived at DXB',
    'Customs cleared',
    'Delivered',
  ],
};

export interface WorkOrderRow extends WorkOrder {
  customerName: string;
  sourceRef?: string;
  revenue: number;
  cost: number;
  marginPct: number;
  progress: number;
  currentMilestone: string;
}

export interface WorkOrderDetail extends WorkOrderRow {
  invoiceNumber?: string;
  movements: (StockMovement & { customerName: string })[];
  assignments: (VendorAssignment & { vendorName: string; serviceName: string })[];
}

export interface WorkOrderInput {
  customerId: string;
  source: WorkOrder['source'];
  mode: TransportMode;
  origin: string;
  destination: string;
  cargo: Cargo;
  eta: string;
  priority: WorkOrder['priority'];
  hasWarehouse: boolean;
  lines: Omit<PriceLine, 'id'>[];
  status: 'Draft' | 'Confirmed';
}

export interface WorkOrderPrefill {
  customerId?: string;
  source: WorkOrder['source'];
  sourceRef?: string;
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
  return undefined;
}

function toRow(wo: WorkOrder): WorkOrderRow {
  const fin = workOrderFinancials(wo);
  const done = wo.milestones.filter((m) => m.status === 'Done').length;
  return {
    ...wo,
    customerName: lookupName.customer(wo.customerId),
    sourceRef: sourceRef(wo),
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

function buildMilestones(mode: TransportMode, confirmed: boolean): Milestone[] {
  return MILESTONE_TEMPLATES[mode].map((label, i) => ({
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

/** Status follows milestone progress: 0–1 done Confirmed, 2–3 In progress, 4–5 In transit, all Delivered. */
function statusForProgress(done: number, total: number): WorkOrderStatus {
  if (done >= total) return 'Delivered';
  if (done >= 4) return 'In transit';
  if (done >= 2) return 'In progress';
  return 'Confirmed';
}

function patch(id: string, fn: (wo: WorkOrder) => WorkOrder) {
  protoDb.update((s) => ({ ...s, workOrders: s.workOrders.map((w) => (w.id === id ? fn(w) : w)) }));
  return protoDb.get().workOrders.find((w) => w.id === id)!;
}

function findOrThrow(id: string): WorkOrder {
  const wo = protoDb.get().workOrders.find((w) => w.id === id);
  if (!wo) throw new Error('Work order not found');
  return wo;
}

export const workOrdersApi = {
  list(params: ListParams): Promise<Page<WorkOrderRow>> {
    const rows = [...protoDb.get().workOrders]
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

  prefill(search: {
    quotationId?: string;
    contractId?: string;
    customerId?: string;
  }): Promise<WorkOrderPrefill> {
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
    if (search.quotationId) {
      const q = db.quotations.find((x) => x.id === search.quotationId);
      if (q) {
        const enquiry = q.enquiryId ? db.enquiries.find((e) => e.id === q.enquiryId) : undefined;
        return latency({
          customerId: q.customerId,
          source: { type: 'Quotation', refId: q.id },
          sourceRef: q.number,
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
        return latency({
          customerId: c.customerId,
          source: { type: 'Contract', refId: c.id },
          sourceRef: c.number,
          mode: firstMode === 'Sea' || firstMode === 'Air' ? firstMode : 'Road',
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
      source: input.source,
      mode: input.mode,
      origin: input.origin,
      destination: input.destination,
      cargo: input.cargo,
      status: input.status,
      priority: input.priority,
      milestones: buildMilestones(input.mode, confirmed),
      vendorAssignments: [],
      lines: input.lines.map((l) => ({ ...l, id: newId('ln') })),
      hasWarehouse: input.hasWarehouse,
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
      return { ...w, milestones, status: statusForProgress(done, milestones.length) };
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

  complete(id: string): Promise<WorkOrder> {
    const wo = findOrThrow(id);
    if (wo.status !== 'Delivered') return Promise.reject(new Error('Only delivered jobs can be completed'));
    const updated = patch(id, (w) => ({
      ...w,
      status: 'Completed',
      vendorAssignments: w.vendorAssignments.map((a) => ({ ...a, status: 'Completed' })),
    }));
    logActivity({
      entity: 'Work order',
      entityId: id,
      entityRef: wo.number,
      action: 'completed the work order',
    });
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

export function useWorkOrderPrefill(search: {
  quotationId?: string;
  contractId?: string;
  customerId?: string;
}) {
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
      a:
        | { id: string; kind: 'confirm' | 'advance' | 'complete' }
        | { id: string; kind: 'cancel'; reason: string },
    ) => {
      switch (a.kind) {
        case 'confirm':
          return workOrdersApi.confirm(a.id);
        case 'advance':
          return workOrdersApi.advanceMilestone(a.id);
        case 'complete':
          return workOrdersApi.complete(a.id);
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
