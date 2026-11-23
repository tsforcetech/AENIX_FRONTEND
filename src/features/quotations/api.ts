import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { marginPct, VAT_RATE } from '@/domain/calc';
import type {
  Contract,
  PriceLine,
  Quotation,
  QuotationStatus,
  SalesOrder,
  ServiceCategory,
  TransportMode,
  WorkOrder,
} from '@/domain/types';
import { jobKindLabel } from '@/domain/workflow';
import { locationText } from '@/features/sales-orders/commercial-ui';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';

/**
 * Quotations data source. PROTOTYPE ADAPTER — replace the bodies of `quotationsApi` with calls
 * to the generated OpenAPI client when the Commercial (Phase 3) contract is published.
 * Screens only use the hooks below, so they do not change.
 */
export interface QuotationRow extends Quotation {
  customerName: string;
  revenue: number;
  cost: number;
  marginPct: number;
}

export interface QuotationDetail extends QuotationRow {
  enquiryNumber?: string;
  salesOrders: Pick<SalesOrder, 'id' | 'number' | 'status' | 'customerPoRef'>[];
  workOrders: Pick<WorkOrder, 'id' | 'number' | 'status' | 'salesOrderId'>[];
  contracts: Pick<Contract, 'id' | 'number' | 'status'>[];
  versions: Pick<Quotation, 'id' | 'number' | 'version' | 'status' | 'createdAt'>[];
}

export interface QuotationInput {
  enquiryId?: string;
  customerId: string;
  serviceCategory: ServiceCategory;
  mode?: TransportMode;
  origin: string;
  destination: string;
  agreement: Quotation['agreement'];
  validUntil: string;
  terms: string;
  lines: Omit<PriceLine, 'id'>[];
  submit: boolean;
}

export interface QuotationDraftPrefill {
  customerId: string;
  serviceCategory: ServiceCategory;
  mode?: TransportMode;
  origin: string;
  destination: string;
  enquiryNumber: string;
  lines: Omit<PriceLine, 'id'>[];
}

export function totals(lines: Pick<PriceLine, 'quantity' | 'unitPrice' | 'unitCost'>[]) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const cost = r2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  return {
    subtotal,
    vat,
    total: r2(subtotal + vat),
    cost,
    margin: r2(subtotal - cost),
    marginPct: marginPct(subtotal, cost),
  };
}

const toRow = (q: Quotation): QuotationRow => {
  const t = totals(q.lines);
  return {
    ...q,
    customerName: lookupName.customer(q.customerId),
    revenue: t.subtotal,
    cost: t.cost,
    marginPct: t.marginPct,
  };
};

/** Family key: revisions share the base number (QT-1084, QT-1084 v2 …). */
const family = (q: Pick<Quotation, 'number'>) => q.number;

function setEnquiryStatus(enquiryId: string | undefined, status: 'Quoting' | 'Quoted' | 'Won' | 'Lost') {
  if (!enquiryId) return;
  protoDb.update((s) => ({
    ...s,
    enquiries: s.enquiries.map((e) => (e.id === enquiryId ? { ...e, status } : e)),
  }));
}

function transition(id: string, status: QuotationStatus, action: string) {
  const q = protoDb.get().quotations.find((x) => x.id === id);
  if (!q) return Promise.reject(new Error('Not found'));
  protoDb.update((s) => ({
    ...s,
    quotations: s.quotations.map((x) => (x.id === id ? { ...x, status } : x)),
  }));
  if (status === 'Sent') setEnquiryStatus(q.enquiryId, 'Quoted');
  if (status === 'Accepted') setEnquiryStatus(q.enquiryId, 'Won');
  if (status === 'Rejected') setEnquiryStatus(q.enquiryId, 'Lost');
  logActivity({ entity: 'Quotation', entityId: id, entityRef: q.number, action });
  return latency(undefined, 250);
}

export const quotationsApi = {
  list(params: ListParams): Promise<Page<QuotationRow>> {
    const rows = [...protoDb.get().quotations]
      .filter((q) => !params.type || q.serviceCategory === params.type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.customerName} ${r.origin} ${r.destination}`,
        status: (r) => r.status,
      }),
    );
  },
  get(id: string): Promise<QuotationDetail> {
    const db = protoDb.get();
    const q = db.quotations.find((x) => x.id === id);
    if (!q) return Promise.reject(new Error('Not found'));
    return latency({
      ...toRow(q),
      enquiryNumber: db.enquiries.find((e) => e.id === q.enquiryId)?.number,
      salesOrders: db.salesOrders
        .filter((so) => so.quotationId === id)
        .map((so) => ({ id: so.id, number: so.number, status: so.status, customerPoRef: so.customerPoRef })),
      workOrders: db.workOrders
        .filter((w) => {
          const so = w.salesOrderId ? db.salesOrders.find((x) => x.id === w.salesOrderId) : undefined;
          return so?.quotationId === id || (w.source.type === 'Quotation' && w.source.refId === id);
        })
        .map((w) => ({ id: w.id, number: w.number, status: w.status, salesOrderId: w.salesOrderId })),
      contracts: db.contracts
        .filter((c) => c.quotationId === id)
        .map((c) => ({ id: c.id, number: c.number, status: c.status })),
      versions: db.quotations
        .filter((x) => family(x) === family(q))
        .sort((a, b) => b.version - a.version)
        .map((x) => ({
          id: x.id,
          number: x.number,
          version: x.version,
          status: x.status,
          createdAt: x.createdAt,
        })),
    });
  },
  /** Suggested draft from an enquiry: vendor-rate cost where known + ~20% markup. */
  prefillFromEnquiry(enquiryId: string): Promise<QuotationDraftPrefill | null> {
    const db = protoDb.get();
    const e = db.enquiries.find((x) => x.id === enquiryId);
    if (!e) return latency(null);
    const lines = e.serviceIds.map((serviceId) => {
      const svc = db.services.find((s) => s.id === serviceId);
      const rate =
        db.vendorRates.find(
          (r) => r.serviceId === serviceId && r.origin === e.origin && r.destination === e.destination,
        ) ?? db.vendorRates.find((r) => r.serviceId === serviceId);
      const unitCost = rate?.rate ?? 0;
      return {
        serviceId,
        description: `${svc?.name ?? 'Service'} — ${locationText(e.serviceCategory, e.origin, e.destination)}`,
        quantity: 1,
        unit: svc?.unit ?? 'Unit',
        unitCost,
        unitPrice: Math.round(unitCost * 1.2 * 100) / 100,
      };
    });
    return latency(
      {
        customerId: e.customerId,
        serviceCategory: e.serviceCategory,
        mode: e.mode,
        origin: e.origin,
        destination: e.destination,
        enquiryNumber: e.number,
        lines,
      },
      120,
    );
  },
  create(input: QuotationInput): Promise<Quotation> {
    const db = protoDb.get();
    const next = Math.max(...db.quotations.map((q) => Number(q.number.split('-')[1]))) + 1;
    const { submit, lines, ...rest } = input;
    const q: Quotation = {
      id: newId('qt'),
      number: `QT-${next}`,
      version: 1,
      status: submit ? 'Pending approval' : 'Draft',
      createdAt: nowIso(),
      owner: db.session?.displayName ?? 'Prototype user',
      lines: lines.map((l) => ({ ...l, id: newId('ln') })),
      ...rest,
    };
    protoDb.update((s) => ({ ...s, quotations: [q, ...s.quotations] }));
    setEnquiryStatus(q.enquiryId, 'Quoting');
    logActivity({
      entity: 'Quotation',
      entityId: q.id,
      entityRef: q.number,
      action: submit ? 'submitted a quotation for approval' : 'started a draft quotation',
    });
    return latency(q, 300);
  },
  submit: (id: string) => transition(id, 'Pending approval', 'submitted for approval'),
  approve: (id: string) => transition(id, 'Sent', 'approved and sent to the customer'),
  sendBack: (id: string) => transition(id, 'Draft', 'returned the quotation to draft'),
  accept: (id: string) => transition(id, 'Accepted', 'marked the quotation accepted'),
  reject: (id: string) => transition(id, 'Rejected', 'marked the quotation rejected'),
  revise(id: string): Promise<Quotation> {
    const q = protoDb.get().quotations.find((x) => x.id === id);
    if (!q) return Promise.reject(new Error('Not found'));
    const maxVersion = Math.max(
      ...protoDb
        .get()
        .quotations.filter((x) => family(x) === family(q))
        .map((x) => x.version),
    );
    const copy: Quotation = {
      ...structuredClone(q),
      id: newId('qt'),
      version: maxVersion + 1,
      status: 'Draft',
      createdAt: nowIso(),
      lines: q.lines.map((l) => ({ ...l, id: newId('ln') })),
    };
    protoDb.update((s) => ({
      ...s,
      quotations: [
        copy,
        ...s.quotations.map((x) => (x.id === id ? { ...x, status: 'Expired' as const } : x)),
      ],
    }));
    logActivity({
      entity: 'Quotation',
      entityId: copy.id,
      entityRef: copy.number,
      action: `created revision v${copy.version}`,
    });
    return latency(copy, 250);
  },
  createContract(id: string): Promise<Contract> {
    const db = protoDb.get();
    const q = db.quotations.find((x) => x.id === id);
    if (!q) return Promise.reject(new Error('Not found'));
    const year = new Date().getFullYear();
    const seq = db.contracts.filter((c) => c.number.startsWith(`CTR-${year}`)).length + 15;
    const start = new Date();
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
    const contract: Contract = {
      id: newId('ctr'),
      number: `CTR-${year}-${String(seq).padStart(3, '0')}`,
      customerId: q.customerId,
      quotationId: q.id,
      title: `${locationText(q.serviceCategory, q.origin, q.destination)} — ${jobKindLabel(q.serviceCategory, q.mode).toLowerCase()} rates`,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      status: 'Active',
      lines: q.lines.map((l) => ({ ...l, id: newId('ln'), quantity: 1 })),
      billingCycle: 'Per job',
    };
    protoDb.update((s) => ({ ...s, contracts: [contract, ...s.contracts] }));
    logActivity({
      entity: 'Contract',
      entityId: contract.id,
      entityRef: contract.number,
      action: `created a contract from ${q.number}`,
    });
    return latency(contract, 300);
  },
};

export function useQuotations(params: ListParams) {
  return useQuery({
    queryKey: ['quotations', 'list', params],
    queryFn: () => quotationsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useQuotation(id: string) {
  return useQuery({ queryKey: ['quotations', 'detail', id], queryFn: () => quotationsApi.get(id) });
}

export function useQuotationPrefill(enquiryId: string | undefined) {
  return useQuery({
    queryKey: ['quotations', 'prefill', enquiryId],
    queryFn: () => quotationsApi.prefillFromEnquiry(enquiryId!),
    enabled: !!enquiryId,
    staleTime: Infinity,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['quotations'] });
    void qc.invalidateQueries({ queryKey: ['enquiries'] });
    void qc.invalidateQueries({ queryKey: ['contracts'] });
    void qc.invalidateQueries({ queryKey: ['sales-orders'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
  };
}

export function useCreateQuotation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: quotationsApi.create, onSuccess: invalidate });
}

export type QuotationAction = 'submit' | 'approve' | 'sendBack' | 'accept' | 'reject';

export function useQuotationAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: QuotationAction }) => quotationsApi[action](id),
    onSuccess: invalidate,
  });
}

export function useReviseQuotation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: quotationsApi.revise, onSuccess: invalidate });
}

export function useCreateContractFromQuotation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: quotationsApi.createContract, onSuccess: invalidate });
}
