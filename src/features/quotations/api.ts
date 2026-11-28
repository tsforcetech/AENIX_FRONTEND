import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { linesRevenue, marginPct, VAT_RATE } from '@/domain/calc';
import { toAed } from '@/domain/controls';
import type {
  ApprovalRequest,
  Contract,
  Currency,
  PriceLine,
  Quotation,
  QuotationStatus,
  SalesOrder,
  ServiceCategory,
  TransportMode,
  WorkOrder,
} from '@/domain/types';
import { categoriesFromLines, primaryCategory, servicesLabel } from '@/domain/workflow';
import { locationTextMulti } from '@/features/sales-orders/commercial-ui';
import { rateCardPriceAed, suggestLine } from '@/features/sales-orders/commercial-api';
import { quotationApprovalCheck } from '@/features/sales-orders/pricing';
import {
  approvalFor,
  approvalNeeded,
  decideApproval,
  onApprovalDecided,
  requestApproval,
} from '@/shared/data/approvals';
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
  /** C2: discount vs rate card and margin checked by the approval matrix. */
  pricingCheck: { maxDiscountPct: number; marginPct: number };
  /** Latest approval request in the approvals inbox (C2). */
  approvalRequest?: Pick<ApprovalRequest, 'id' | 'docType' | 'summary'>;
  enquiryNumber?: string;
  salesOrders: Pick<SalesOrder, 'id' | 'number' | 'status' | 'customerPoRef'>[];
  workOrders: Pick<WorkOrder, 'id' | 'number' | 'status' | 'salesOrderId'>[];
  contracts: Pick<Contract, 'id' | 'number' | 'status'>[];
  versions: Pick<Quotation, 'id' | 'number' | 'version' | 'status' | 'createdAt'>[];
}

export interface QuotationInput {
  enquiryId?: string;
  customerId: string;
  /** Selected service types; the stored list also includes every type found on the lines. */
  serviceCategories: ServiceCategory[];
  mode?: TransportMode;
  origin: string;
  destination: string;
  agreement: Quotation['agreement'];
  validUntil: string;
  terms: string;
  lines: Omit<PriceLine, 'id'>[];
  submit: boolean;
  /** C10: document currency and rate to AED (multi-currency module only). */
  currency?: Currency;
  exchangeRate?: number;
}

/** Result of "Submit for approval" (C2): pending with the matrix, or sent straight away. */
export interface SubmitResult {
  quotation: Quotation;
  status: QuotationStatus;
  reasons: string[];
  approverRole?: string;
}

export interface QuotationDraftPrefill {
  customerId: string;
  serviceCategory: ServiceCategory;
  serviceCategories: ServiceCategory[];
  mode?: TransportMode;
  origin: string;
  destination: string;
  enquiryNumber: string;
  lines: Omit<PriceLine, 'id'>[];
}

export function totals(
  lines: (Pick<PriceLine, 'quantity' | 'unitPrice' | 'unitCost'> & { minimumCharge?: number })[],
) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = linesRevenue(lines);
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

const QUOTE_APPROVALS = ['Quotation discount %', 'Quotation margin % below'] as const;

/** C2: worst discount vs the rate card and overall margin, as the approval matrix sees them. */
function pricingCheckOf(q: Quotation) {
  const rate = q.currency && q.currency !== 'AED' ? (q.exchangeRate ?? 1) : 1;
  const { maxDiscountPct, marginPct: margin } = quotationApprovalCheck(
    q.lines.map((l) => ({
      ...l,
      listPriceAed: rateCardPriceAed(l.serviceId, { origin: q.origin, destination: q.destination }),
    })),
    rate,
  );
  return { maxDiscountPct, marginPct: margin };
}

function pendingQuoteRequest(id: string): ApprovalRequest | undefined {
  return protoDb
    .get()
    .approvalRequests.find(
      (r) =>
        r.entityId === id &&
        r.record.status === 'Pending' &&
        (QUOTE_APPROVALS as readonly string[]).includes(r.docType),
    );
}

function patchQuotation(id: string, patch: Partial<Quotation>) {
  protoDb.update((s) => ({
    ...s,
    quotations: s.quotations.map((x) => (x.id === id ? { ...x, ...patch } : x)),
  }));
}

/** C2: "Submit for approval" — the approval matrix decides whether an approver must see it. */
function submitQuotation(id: string): SubmitResult {
  const q = protoDb.get().quotations.find((x) => x.id === id);
  if (!q) throw new Error('Not found');
  if (q.status !== 'Draft') throw new Error(`Only a draft can be submitted (this one is ${q.status}).`);
  const check = pricingCheckOf(q);
  const disc = approvalNeeded('Quotation discount %', check.maxDiscountPct);
  const marg = approvalNeeded('Quotation margin % below', check.marginPct);
  const reasons: string[] = [];
  if (disc) reasons.push(`Discount ${check.maxDiscountPct}% below the rate card (limit ${disc.threshold}%)`);
  if (marg) reasons.push(`Margin ${check.marginPct}% is below ${marg.threshold}%`);
  const rule = disc ?? marg;
  const ref = `${q.number} v${q.version}`;
  if (rule) {
    const rate = q.currency && q.currency !== 'AED' ? q.exchangeRate : undefined;
    const record = requestApproval({
      docType: rule.docType,
      rule,
      entity: 'Quotation',
      entityId: q.id,
      entityRef: ref,
      summary: `${lookupName.customer(q.customerId)} — ${reasons.join('; ')}`,
      amount: toAed(linesRevenue(q.lines), q.currency, rate),
      href: `/quotations/${q.id}`,
    });
    patchQuotation(id, { status: 'Pending approval', approval: record });
    logActivity({
      entity: 'Quotation',
      entityId: id,
      entityRef: q.number,
      action: `submitted for approval (${rule.approverRole})`,
    });
    const updated = protoDb.get().quotations.find((x) => x.id === id)!;
    return { quotation: updated, status: 'Pending approval', reasons, approverRole: rule.approverRole };
  }
  patchQuotation(id, { status: 'Sent', approval: undefined });
  setEnquiryStatus(q.enquiryId, 'Quoted');
  logActivity({
    entity: 'Quotation',
    entityId: id,
    entityRef: q.number,
    action: 'sent to the customer (no approval needed by the approval matrix)',
  });
  const updated = protoDb.get().quotations.find((x) => x.id === id)!;
  return { quotation: updated, status: 'Sent', reasons };
}

/** Applies the approver's decision (from the approvals inbox or this page). */
function applyQuoteDecision(req: ApprovalRequest) {
  if (req.entity !== 'Quotation') return;
  const q = protoDb.get().quotations.find((x) => x.id === req.entityId);
  if (!q || q.status !== 'Pending approval') return;
  const approved = req.record.status === 'Approved';
  patchQuotation(q.id, { status: approved ? 'Sent' : 'Draft', approval: req.record });
  if (approved) setEnquiryStatus(q.enquiryId, 'Quoted');
  logActivity({
    entity: 'Quotation',
    entityId: q.id,
    entityRef: q.number,
    action: approved
      ? 'approved and sent to the customer'
      : `returned to draft${req.record.reason ? ` — ${req.record.reason}` : ''}`,
  });
}
for (const docType of QUOTE_APPROVALS) onApprovalDecided(docType, applyQuoteDecision);

/** Approve / reject a pending quotation through its approval request (legacy: direct transition). */
function decideQuotation(id: string, decision: 'Approved' | 'Rejected', reason?: string) {
  const req = pendingQuoteRequest(id);
  if (req) {
    decideApproval(req.id, decision, reason);
    return latency(undefined, 250);
  }
  if (decision === 'Approved') return transition(id, 'Sent', 'approved and sent to the customer');
  const q = protoDb.get().quotations.find((x) => x.id === id);
  if (q && reason)
    patchQuotation(id, {
      approval: {
        status: 'Rejected',
        requestedBy: q.owner,
        requestedAt: q.createdAt,
        approverRole: 'Sales manager',
        decidedBy: protoDb.get().session?.displayName ?? 'Prototype user',
        decidedAt: nowIso(),
        reason,
      },
    });
  return transition(id, 'Draft', `returned the quotation to draft${reason ? ` — ${reason}` : ''}`);
}

export const quotationsApi = {
  list(params: ListParams): Promise<Page<QuotationRow>> {
    const rows = [...protoDb.get().quotations]
      .filter((q) => !params.type || q.serviceCategories.includes(params.type as ServiceCategory))
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
    const req = approvalFor(id, 'Quotation discount %') ?? approvalFor(id, 'Quotation margin % below');
    return latency({
      ...toRow(q),
      pricingCheck: pricingCheckOf(q),
      approvalRequest: req ? { id: req.id, docType: req.docType, summary: req.summary } : undefined,
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
      // C3: cost from the cheapest vendor rate valid today (lane match preferred).
      const sug = suggestLine(serviceId, { origin: e.origin, destination: e.destination });
      return {
        serviceId,
        description: `${svc?.name ?? 'Service'} — ${locationTextMulti(e.serviceCategories, e.origin, e.destination)}`,
        quantity: 1,
        unit: svc?.unit ?? 'Unit',
        unitCost: Number(sug.unitCost ?? 0),
        unitPrice: Number(sug.unitPrice ?? 0),
        minimumCharge: sug.minimumCharge,
      };
    });
    return latency(
      {
        customerId: e.customerId,
        serviceCategory: e.serviceCategory,
        serviceCategories: e.serviceCategories,
        mode: e.mode,
        origin: e.origin,
        destination: e.destination,
        enquiryNumber: e.number,
        lines,
      },
      120,
    );
  },
  create(input: QuotationInput): Promise<SubmitResult> {
    const db = protoDb.get();
    const next = Math.max(...db.quotations.map((q) => Number(q.number.split('-')[1]))) + 1;
    const { submit, lines, serviceCategories: selected, ...rest } = input;
    const modeOf = (serviceId: string) => db.services.find((x) => x.id === serviceId)?.mode;
    const serviceCategories = categoriesFromLines(lines, modeOf, selected);
    const q: Quotation = {
      serviceCategories,
      serviceCategory: primaryCategory(serviceCategories),
      id: newId('qt'),
      number: `QT-${next}`,
      version: 1,
      status: 'Draft',
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
      action: 'started a draft quotation',
    });
    if (submit) {
      try {
        return latency(submitQuotation(q.id), 300);
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
    return latency({ quotation: q, status: q.status, reasons: [] }, 300);
  },
  submit(id: string): Promise<SubmitResult> {
    try {
      return latency(submitQuotation(id), 250);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  },
  approve: (id: string) => decideQuotation(id, 'Approved'),
  sendBack: (id: string, reason?: string) => decideQuotation(id, 'Rejected', reason),
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
      approval: undefined,
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
      title: `${locationTextMulti(q.serviceCategories, q.origin, q.destination)} — ${servicesLabel(q.serviceCategories, q.mode).toLowerCase()} rates`,
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
    void qc.invalidateQueries({ queryKey: ['approvals'] });
  };
}

export function useCreateQuotation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: quotationsApi.create, onSuccess: invalidate });
}

export type QuotationAction = 'approve' | 'sendBack' | 'accept' | 'reject';

export function useQuotationAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: QuotationAction; reason?: string }) =>
      action === 'sendBack' ? quotationsApi.sendBack(id, reason) : quotationsApi[action](id),
    onSuccess: invalidate,
  });
}

export function useSubmitQuotation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: quotationsApi.submit, onSuccess: invalidate });
}

export function useReviseQuotation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: quotationsApi.revise, onSuccess: invalidate });
}

export function useCreateContractFromQuotation() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: quotationsApi.createContract, onSuccess: invalidate });
}
