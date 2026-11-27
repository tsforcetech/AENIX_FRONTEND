import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerBalance, type SalesOrderBalance } from '@/domain/balances';
import { invoiceTotals, workOrderFinancials } from '@/domain/calc';
import type {
  Invoice,
  PaymentMethod,
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
import { categoriesFromLines, primaryCategory } from '@/domain/workflow';
import { locationTextMulti, SITE_PREFIX } from './commercial-ui';

const siteLines = (notes: string | undefined) =>
  (notes ?? '')
    .split('\n')
    .filter((l) => l.startsWith(SITE_PREFIX.Warehouse) || l.startsWith(SITE_PREFIX.Service))
    .join('\n');

/**
 * Sales orders data source. PROTOTYPE ADAPTER — replace the bodies of `salesOrdersApi` with the
 * generated OpenAPI client when the Commercial (Phase 3) contract is published. Screens only use
 * the hooks below.
 *
 * Flow (FLOW-002, industry standard): Enquiry? → Quotation? → Sales order → Job(s) (= work order).
 * One invoice may bill several sales orders; receipts can be advances against a sales order.
 */
export interface SalesOrderRow extends SalesOrder {
  customerName: string;
  value: number;
  workOrderCount: number;
  workOrdersCompleted: number;
  /** Billing position of this order (incl. VAT), from the customer balance. */
  billing: SalesOrderBalance;
}

export interface SalesOrderInvoiceRef {
  id: string;
  number: string;
  status: Invoice['status'];
  issueDate: string;
  total: number;
  outstanding: number;
  /** Other sales orders billed on the same invoice. */
  otherOrders: string[];
}

export interface SalesOrderReceiptRef {
  id: string;
  number: string;
  date: string;
  method: PaymentMethod;
  amount: number;
  /** "Advance" or the invoice number the receipt was applied to. */
  appliedTo: string;
}

export interface SalesOrderWorkOrder extends Pick<
  WorkOrder,
  'id' | 'number' | 'status' | 'serviceCategory' | 'serviceCategories' | 'mode' | 'eta' | 'invoiceId'
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
  invoices: SalesOrderInvoiceRef[];
  receipts: SalesOrderReceiptRef[];
}

export interface SalesOrderPrefill {
  source: 'quotation' | 'contract' | 'enquiry' | 'direct';
  sourceNumber?: string;
  customerId: string;
  serviceCategory: ServiceCategory;
  serviceCategories: ServiceCategory[];
  mode?: TransportMode;
  origin: string;
  destination: string;
  enquiryId?: string;
  quotationId?: string;
  contractId?: string;
  lines: Omit<PriceLine, 'id'>[];
  /** Site lines (warehouse / service location) carried from the enquiry. */
  notes?: string;
}

export interface SalesOrderInput {
  customerId: string;
  /** Selected service types; the stored list also includes every type found on the lines. */
  serviceCategories: ServiceCategory[];
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

const emptyBilling = (so: SalesOrder): SalesOrderBalance => ({
  salesOrderId: so.id,
  number: so.number,
  status: so.status,
  orderValue: 0,
  invoiced: 0,
  notInvoiced: 0,
  received: 0,
  advance: 0,
  balance: 0,
});

/** Billing position per sales order, computed once per customer. */
function billingFor(customerId: string): Map<string, SalesOrderBalance> {
  const db = protoDb.get();
  const b = customerBalance(customerId, {
    salesOrders: db.salesOrders,
    invoices: db.invoices,
    collections: db.collections,
  });
  return new Map(b.salesOrders.map((x) => [x.salesOrderId, x]));
}

function toRow(so: SalesOrder, billing?: Map<string, SalesOrderBalance>): SalesOrderRow {
  const wos = protoDb.get().workOrders.filter((w) => w.salesOrderId === so.id);
  const b = (billing ?? billingFor(so.customerId)).get(so.id) ?? emptyBilling(so);
  return {
    billing: b,
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
    const all = protoDb.get().salesOrders;
    const billing = new Map<string, Map<string, SalesOrderBalance>>();
    for (const c of new Set(all.map((so) => so.customerId))) billing.set(c, billingFor(c));
    const rows = [...all]
      .filter((so) => !params.type || so.serviceCategories.includes(params.type as ServiceCategory))
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.number.localeCompare(a.number))
      .map((so) => toRow(so, billing.get(so.customerId)))
      .filter(
        (r) =>
          params.billing !== 'not-invoiced' ||
          (r.status !== 'Draft' && r.status !== 'Cancelled' && r.billing.notInvoiced > 0.005),
      );
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.customerName} ${r.customerPoRef} ${r.origin} ${r.destination} ${r.serviceCategories.join(' ')}`,
        status: (r) => r.status,
      }),
    );
  },

  get(id: string): Promise<SalesOrderDetail> {
    const db = protoDb.get();
    const so = db.salesOrders.find((x) => x.id === id);
    if (!so) return Promise.reject(new Error('Not found'));
    const soInvoices = db.invoices.filter(
      (i) => i.salesOrderIds?.includes(id) || i.lines.some((l) => l.salesOrderId === id),
    );
    const invoices: SalesOrderInvoiceRef[] = soInvoices.map((i) => {
      const t = invoiceTotals(i);
      return {
        id: i.id,
        number: i.number,
        status: i.status,
        issueDate: i.issueDate,
        total: t.total,
        outstanding: t.outstanding,
        otherOrders: (i.salesOrderIds ?? [])
          .filter((x) => x !== id)
          .map((x) => db.salesOrders.find((o) => o.id === x)?.number ?? x),
      };
    });
    const invIds = new Set(soInvoices.map((i) => i.id));
    const receipts: SalesOrderReceiptRef[] = db.collections
      .filter((c) => c.status !== 'Bounced')
      .flatMap((c) =>
        c.allocations
          .filter((a) => a.salesOrderId === id || (a.invoiceId && invIds.has(a.invoiceId)))
          .map((a) => ({
            id: `${c.id}-${a.invoiceId ?? a.salesOrderId}`,
            number: c.number,
            date: c.date,
            method: c.method,
            amount: a.amount,
            appliedTo: a.invoiceId
              ? (db.invoices.find((i) => i.id === a.invoiceId)?.number ?? 'Invoice')
              : c.status === 'PDC pending'
                ? 'Advance (PDC pending)'
                : 'Advance',
          })),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
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
            serviceCategories: w.serviceCategories,
            mode: w.mode,
            eta: w.eta,
            invoiceId: w.invoiceId,
            progress: w.milestones.length ? Math.round((done / w.milestones.length) * 100) : 0,
            currentMilestone: w.milestones.find((m) => m.status === 'Current')?.label ?? '—',
            revenue: workOrderFinancials(w).revenue,
          };
        }),
      invoices,
      receipts,
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
        serviceCategories: q.serviceCategories,
        mode: q.mode,
        origin: q.origin,
        destination: q.destination,
        enquiryId: q.enquiryId,
        quotationId: q.id,
        lines: q.lines.map(stripId),
        notes: siteLines(db.enquiries.find((x) => x.id === q.enquiryId)?.notes),
      });
    }
    const c = p.contractId ? db.contracts.find((x) => x.id === p.contractId) : undefined;
    if (c) {
      const modeOf = (serviceId: string) => db.services.find((x) => x.id === serviceId)?.mode;
      const serviceCategories = categoriesFromLines(c.lines, modeOf);
      const transportMode = c.lines
        .map((l) => modeOf(l.serviceId))
        .find((m): m is TransportMode => m === 'Road' || m === 'Sea' || m === 'Air');
      return latency({
        source: 'contract',
        sourceNumber: c.number,
        customerId: c.customerId,
        serviceCategory: primaryCategory(serviceCategories),
        serviceCategories,
        mode: transportMode,
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
        serviceCategories: e.serviceCategories,
        mode: e.mode,
        origin: e.origin,
        destination: e.destination,
        enquiryId: e.id,
        notes: siteLines(e.notes),
        lines: e.serviceIds.map((serviceId) => {
          const svc = db.services.find((s) => s.id === serviceId);
          return {
            serviceId,
            description: `${svc?.name ?? 'Service'} — ${locationTextMulti(e.serviceCategories, e.origin, e.destination)}`,
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
      serviceCategories: ['Transport'],
      mode: 'Road',
      origin: '',
      destination: '',
      lines: [],
    });
  },

  create(input: SalesOrderInput): Promise<SalesOrder> {
    const db = protoDb.get();
    const { confirm, lines, serviceCategories: selected, ...rest } = input;
    const modeOf = (serviceId: string) => db.services.find((x) => x.id === serviceId)?.mode;
    const serviceCategories = categoriesFromLines(lines, modeOf, selected);
    const so: SalesOrder = {
      serviceCategories,
      serviceCategory: primaryCategory(serviceCategories),
      id: newId('so'),
      number: nextNumber(),
      status: confirm ? 'Confirmed' : 'Draft',
      owner: db.session?.displayName ?? 'Prototype user',
      lines: lines.map((l) => ({ ...l, id: newId('ln') })),
      ...rest,
      mode: serviceCategories.includes('Transport') ? rest.mode : undefined,
    };
    protoDb.update((s) => ({ ...s, salesOrders: [so, ...s.salesOrders] }));
    if (confirm) setEnquiryWon(so.enquiryId);
    logActivity({
      entity: 'Sales order',
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
      entity: 'Sales order',
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
    for (const key of ['sales-orders', 'quotations', 'enquiries', 'contracts', 'customers', 'home']) {
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
