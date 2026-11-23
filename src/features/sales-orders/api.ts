import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workOrderFinancials } from '@/domain/calc';
import type {
  PriceLine,
  SalesOrder,
  SalesOrderStatus,
  ServiceCategory,
  TransportMode,
  WorkOrder,
} from '@/domain/types';
import { totals } from '@/features/quotations/api';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { locationText } from './commercial-ui';

/**
 * Sales orders data source. PROTOTYPE ADAPTER — replace the bodies of `salesOrdersApi` with the
 * generated OpenAPI client when the Commercial (Phase 3) contract is published. Screens only use
 * the hooks below.
 *
 * Flow (owner instruction 2026-11-23): Enquiry → optional Quotation → Sales order → Work order(s).
 */
export interface SalesOrderRow extends SalesOrder {
  customerName: string;
  value: number;
  workOrderCount: number;
  workOrdersCompleted: number;
}

export interface SalesOrderWorkOrder extends Pick<
  WorkOrder,
  'id' | 'number' | 'status' | 'serviceCategory' | 'mode' | 'eta' | 'invoiceId'
> {
  progress: number;
  currentMilestone: string;
  revenue: number;
}

export interface SalesOrderDetail extends SalesOrderRow {
  enquiryNumber?: string;
  quotationNumber?: string;
  contractNumber?: string;
  workOrders: SalesOrderWorkOrder[];
}

export interface SalesOrderPrefill {
  source: 'quotation' | 'contract' | 'enquiry' | 'direct';
  sourceNumber?: string;
  customerId: string;
  serviceCategory: ServiceCategory;
  mode?: TransportMode;
  origin: string;
  destination: string;
  enquiryId?: string;
  quotationId?: string;
  contractId?: string;
  lines: Omit<PriceLine, 'id'>[];
}

export interface SalesOrderInput {
  customerId: string;
  serviceCategory: ServiceCategory;
  mode?: TransportMode;
  origin: string;
  destination: string;
  enquiryId?: string;
  quotationId?: string;
  contractId?: string;
  customerPoRef: string;
  orderDate: string;
  notes: string;
  lines: Omit<PriceLine, 'id'>[];
  confirm: boolean;
}

const stripId = (l: PriceLine): Omit<PriceLine, 'id'> => ({
  serviceId: l.serviceId,
  description: l.description,
  quantity: l.quantity,
  unit: l.unit,
  unitPrice: l.unitPrice,
  unitCost: l.unitCost,
});

function toRow(so: SalesOrder): SalesOrderRow {
  const wos = protoDb.get().workOrders.filter((w) => w.salesOrderId === so.id);
  return {
    ...so,
    customerName: lookupName.customer(so.customerId),
    value: totals(so.lines).subtotal,
    workOrderCount: wos.length,
    workOrdersCompleted: wos.filter((w) => w.status === 'Completed').length,
  };
}

function setEnquiryWon(enquiryId: string | undefined) {
  if (!enquiryId) return;
  protoDb.update((s) => ({
    ...s,
    enquiries: s.enquiries.map((e) => (e.id === enquiryId ? { ...e, status: 'Won' } : e)),
  }));
}

function nextNumber(): string {
  const nums = protoDb.get().salesOrders.map((s) => Number(s.number.split('-')[1]) || 0);
  return `SO-${Math.max(5100, ...nums) + 1}`;
}

export const salesOrdersApi = {
  list(params: ListParams): Promise<Page<SalesOrderRow>> {
    const rows = [...protoDb.get().salesOrders]
      .filter((so) => !params.type || so.serviceCategory === params.type)
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.number.localeCompare(a.number))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.customerName} ${r.customerPoRef} ${r.origin} ${r.destination} ${r.serviceCategory}`,
        status: (r) => r.status,
      }),
    );
  },

  get(id: string): Promise<SalesOrderDetail> {
    const db = protoDb.get();
    const so = db.salesOrders.find((x) => x.id === id);
    if (!so) return Promise.reject(new Error('Not found'));
    return latency({
      ...toRow(so),
      enquiryNumber: db.enquiries.find((e) => e.id === so.enquiryId)?.number,
      quotationNumber: db.quotations.find((q) => q.id === so.quotationId)?.number,
      contractNumber: db.contracts.find((c) => c.id === so.contractId)?.number,
      workOrders: db.workOrders
        .filter((w) => w.salesOrderId === id)
        .map((w) => {
          const done = w.milestones.filter((m) => m.status === 'Done').length;
          return {
            id: w.id,
            number: w.number,
            status: w.status,
            serviceCategory: w.serviceCategory,
            mode: w.mode,
            eta: w.eta,
            invoiceId: w.invoiceId,
            progress: w.milestones.length ? Math.round((done / w.milestones.length) * 100) : 0,
            currentMilestone: w.milestones.find((m) => m.status === 'Current')?.label ?? '—',
            revenue: workOrderFinancials(w).revenue,
          };
        }),
    });
  },

  /** Prefill priority: quotation → contract → enquiry → blank (direct). */
  prefill(p: {
    quotationId?: string;
    contractId?: string;
    enquiryId?: string;
    customerId?: string;
  }): Promise<SalesOrderPrefill> {
    const db = protoDb.get();
    const q = p.quotationId ? db.quotations.find((x) => x.id === p.quotationId) : undefined;
    if (q) {
      return latency({
        source: 'quotation',
        sourceNumber: `${q.number} v${q.version}`,
        customerId: q.customerId,
        serviceCategory: q.serviceCategory,
        mode: q.mode,
        origin: q.origin,
        destination: q.destination,
        enquiryId: q.enquiryId,
        quotationId: q.id,
        lines: q.lines.map(stripId),
      });
    }
    const c = p.contractId ? db.contracts.find((x) => x.id === p.contractId) : undefined;
    if (c) {
      const firstMode = db.services.find((s) => s.id === c.lines[0]?.serviceId)?.mode;
      const serviceCategory: ServiceCategory =
        firstMode === 'Warehouse' ? 'Warehouse' : firstMode === 'Customs' ? 'Service' : 'Transport';
      return latency({
        source: 'contract',
        sourceNumber: c.number,
        customerId: c.customerId,
        serviceCategory,
        mode:
          serviceCategory === 'Transport' && firstMode && firstMode !== 'Customs'
            ? (firstMode as TransportMode)
            : undefined,
        origin: '',
        destination: '',
        contractId: c.id,
        lines: c.lines.map(stripId),
      });
    }
    const e = p.enquiryId ? db.enquiries.find((x) => x.id === p.enquiryId) : undefined;
    if (e) {
      return latency({
        source: 'enquiry',
        sourceNumber: e.number,
        customerId: e.customerId,
        serviceCategory: e.serviceCategory,
        mode: e.mode,
        origin: e.origin,
        destination: e.destination,
        enquiryId: e.id,
        lines: e.serviceIds.map((serviceId) => {
          const svc = db.services.find((s) => s.id === serviceId);
          return {
            serviceId,
            description: `${svc?.name ?? 'Service'} — ${locationText(e.serviceCategory, e.origin, e.destination)}`,
            quantity: 1,
            unit: svc?.unit ?? 'Unit',
            unitPrice: 0,
            unitCost: db.vendorRates.find((r) => r.serviceId === serviceId)?.rate ?? 0,
          };
        }),
      });
    }
    return latency({
      source: 'direct',
      customerId: p.customerId ?? '',
      serviceCategory: 'Transport',
      mode: 'Road',
      origin: '',
      destination: '',
      lines: [],
    });
  },

  create(input: SalesOrderInput): Promise<SalesOrder> {
    const db = protoDb.get();
    const { confirm, lines, ...rest } = input;
    const so: SalesOrder = {
      id: newId('so'),
      number: nextNumber(),
      status: confirm ? 'Confirmed' : 'Draft',
      owner: db.session?.displayName ?? 'Prototype user',
      lines: lines.map((l) => ({ ...l, id: newId('ln') })),
      ...rest,
      mode: rest.serviceCategory === 'Transport' ? rest.mode : undefined,
    };
    protoDb.update((s) => ({ ...s, salesOrders: [so, ...s.salesOrders] }));
    if (confirm) setEnquiryWon(so.enquiryId);
    logActivity({
      entity: 'Quotation',
      entityId: so.id,
      entityRef: so.number,
      action: confirm ? 'confirmed a sales order' : 'saved a draft sales order',
    });
    return latency(so, 300);
  },

  setStatus(id: string, status: SalesOrderStatus): Promise<void> {
    const so = protoDb.get().salesOrders.find((x) => x.id === id);
    if (!so) return Promise.reject(new Error('Not found'));
    protoDb.update((s) => ({
      ...s,
      salesOrders: s.salesOrders.map((x) => (x.id === id ? { ...x, status } : x)),
    }));
    if (status === 'Confirmed') setEnquiryWon(so.enquiryId);
    logActivity({
      entity: 'Quotation',
      entityId: id,
      entityRef: so.number,
      action:
        status === 'Confirmed'
          ? 'confirmed the sales order'
          : `marked the sales order ${status.toLowerCase()}`,
    });
    return latency(undefined, 250);
  },
};

export function useSalesOrders(params: ListParams) {
  return useQuery({
    queryKey: ['sales-orders', 'list', params],
    queryFn: () => salesOrdersApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useSalesOrder(id: string) {
  return useQuery({ queryKey: ['sales-orders', 'detail', id], queryFn: () => salesOrdersApi.get(id) });
}

export function useSalesOrderPrefill(p: {
  quotationId?: string;
  contractId?: string;
  enquiryId?: string;
  customerId?: string;
}) {
  return useQuery({
    queryKey: ['sales-orders', 'prefill', p],
    queryFn: () => salesOrdersApi.prefill(p),
    staleTime: Infinity,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const key of ['sales-orders', 'quotations', 'enquiries', 'contracts', 'home']) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useCreateSalesOrder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: salesOrdersApi.create, onSuccess: invalidate });
}

export function useSetSalesOrderStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SalesOrderStatus }) =>
      salesOrdersApi.setStatus(id, status),
    onSuccess: invalidate,
  });
}
