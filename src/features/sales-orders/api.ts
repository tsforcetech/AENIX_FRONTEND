import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerBalance, type SalesOrderBalance } from '@/domain/balances';
import { invoiceTotals, workOrderFinancials } from '@/domain/calc';
import { creditCheck, toAed, type CreditCheckResult } from '@/domain/controls';
import type {
  ApprovalRecord,
  ApprovalRequest,
  Attachment,
  Currency,
  Invoice,
  PaymentMethod,
  PriceLine,
  Revision,
  SalesOrder,
  SalesOrderStatus,
  ServiceCategory,
  TransportMode,
  WorkOrder,
} from '@/domain/types';
import { totals } from '@/features/quotations/api';
import { approvalNeeded, currentUser, onApprovalDecided, requestApproval } from '@/shared/data/approvals';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';
import { categoriesFromLines, primaryCategory } from '@/domain/workflow';
import { suggestLine } from './commercial-api';
import { locationTextMulti, SITE_PREFIX } from './commercial-ui';
import { creditInputs } from './credit';
import { fuelSurchargeAmount, valueChange } from './pricing';

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

/** C5: credit position of the customer for this order (AED incl. VAT). */
export interface SalesOrderCredit extends CreditCheckResult {
  creditLimit: number;
  customerStatus: string;
  openBalance: number;
  uninvoicedOrders: number;
  orderValue: number;
  oldestOverdueDays: number;
  /** A credit override was approved for this order. */
  overrideApproved: boolean;
}

export interface SalesOrderDetail extends SalesOrderRow {
  credit: SalesOrderCredit;
  /** C8: the 'Sales order change' threshold (AED) when the rule is active. */
  changeApprovalThreshold?: number;
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
  /** C10: currency carried from the quotation. */
  currency?: Currency;
  exchangeRate?: number;
  /** C6: contract fuel surcharge % (added on the transport subtotal when the order is saved). */
  fuelSurchargePct?: number;
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
  currency?: Currency;
  exchangeRate?: number;
  /** C4: customer's confirmation document, required to confirm. */
  confirmationFile?: { fileName: string; sizeKb: number };
}

/** Result of saving / confirming an order: confirmation can be held by the credit check (C5). */
export interface SalesOrderSaveResult {
  salesOrder: SalesOrder;
  confirmed: boolean;
  credit?: SalesOrderCredit;
}

export interface ConfirmInput {
  customerPoRef: string;
  confirmationFile?: { fileName: string; sizeKb: number };
}

export interface AmendInput {
  lines: Omit<PriceLine, 'id'>[];
  notes: string;
  note: string;
}

const stripId = (l: PriceLine): Omit<PriceLine, 'id'> => ({
  serviceId: l.serviceId,
  description: l.description,
  quantity: l.quantity,
  unit: l.unit,
  unitPrice: l.unitPrice,
  unitCost: l.unitCost,
  ...(l.minimumCharge ? { minimumCharge: l.minimumCharge } : {}),
  ...(l.customerApproved !== undefined ? { customerApproved: l.customerApproved } : {}),
});

const fxOf = (so: Pick<SalesOrder, 'currency' | 'exchangeRate'>) =>
  so.currency && so.currency !== 'AED' ? so.exchangeRate : undefined;

/** C5: credit check for one order (shared creditCheck + customer balance, read only). */
function creditFor(so: SalesOrder): SalesOrderCredit {
  const db = protoDb.get();
  const customer = db.customers.find((c) => c.id === so.customerId);
  const bal = customerBalance(so.customerId, {
    salesOrders: db.salesOrders,
    invoices: db.invoices,
    collections: db.collections,
  });
  const inputs = creditInputs({
    balance: bal,
    invoices: db.invoices,
    customerId: so.customerId,
    today: PROTO_TODAY,
    excludeOrderId: so.id,
  });
  const own = bal.salesOrders.find((x) => x.salesOrderId === so.id);
  const orderValue =
    so.status === 'Draft' || !own ? toAed(totals(so.lines).total, so.currency, fxOf(so)) : own.notInvoiced;
  const check = creditCheck({
    customer: {
      name: customer?.name ?? 'Customer',
      creditLimit: customer?.creditLimit ?? 0,
      status: customer?.status ?? 'Active',
    },
    ...inputs,
    orderValue,
  });
  return {
    ...check,
    ...inputs,
    orderValue,
    creditLimit: customer?.creditLimit ?? 0,
    customerStatus: customer?.status ?? 'Active',
    overrideApproved: so.creditOverride?.status === 'Approved',
  };
}

function patchOrder(id: string, patch: Partial<SalesOrder>) {
  protoDb.update((s) => ({
    ...s,
    salesOrders: s.salesOrders.map((x) => (x.id === id ? { ...x, ...patch } : x)),
  }));
}

const findOrder = (id: string) => protoDb.get().salesOrders.find((x) => x.id === id);

const toAttachment = (f: { fileName: string; sizeKb: number }): Attachment => ({
  fileName: f.fileName,
  sizeKb: f.sizeKb,
  uploadedAt: nowIso(),
  uploadedBy: currentUser(),
});

/** C4 + C5: confirm when the PO reference, the confirmation document and the credit check allow it. */
function tryConfirm(id: string): SalesOrderSaveResult {
  const so = findOrder(id);
  if (!so) throw new Error('Not found');
  if (!so.customerPoRef || so.customerPoRef.trim().length < 2)
    throw new Error('Enter the customer’s PO / reference before confirming.');
  if (!so.confirmationAttachment)
    throw new Error('Attach the customer’s confirmation (signed quote or PO) before confirming.');
  const credit = creditFor(so);
  if (credit.blocked && !credit.overrideApproved) {
    logActivity({
      entity: 'Sales order',
      entityId: id,
      entityRef: so.number,
      action: `confirmation held by the credit check — ${credit.reasons.join('; ')}`,
    });
    return { salesOrder: so, confirmed: false, credit };
  }
  patchOrder(id, { status: 'Confirmed', version: so.version ?? 1 });
  setEnquiryWon(so.enquiryId);
  logActivity({
    entity: 'Sales order',
    entityId: id,
    entityRef: so.number,
    action:
      credit.overrideApproved && credit.blocked
        ? 'confirmed the sales order (credit override approved)'
        : 'confirmed the sales order',
  });
  return { salesOrder: findOrder(id)!, confirmed: true, credit };
}

/** C8: applies an amendment (new version + revision entry). */
function applyAmendment(id: string, a: { lines: PriceLine[]; notes: string; note: string }, by: string) {
  const so = findOrder(id);
  if (!so) return;
  const version = (so.version ?? 1) + 1;
  const revision: Revision = { version, at: nowIso(), by, note: a.note };
  patchOrder(id, {
    lines: a.lines,
    notes: a.notes,
    version,
    revisions: [...(so.revisions ?? []), revision],
    pendingAmendment: undefined,
  });
  logActivity({
    entity: 'Sales order',
    entityId: id,
    entityRef: so.number,
    action: `amended the order — v${version}: ${a.note}`,
  });
}

// ---------- approval handlers (X2) ----------
onApprovalDecided('Credit override', (req: ApprovalRequest) => {
  if (req.entity !== 'Sales order') return;
  const so = findOrder(req.entityId);
  if (!so) return;
  patchOrder(so.id, { creditOverride: req.record });
  logActivity({
    entity: 'Sales order',
    entityId: so.id,
    entityRef: so.number,
    action: `credit override ${req.record.status.toLowerCase()}${req.record.reason ? ` — ${req.record.reason}` : ''}`,
  });
  // Approved: the held confirmation proceeds.
  if (req.record.status === 'Approved' && so.status === 'Draft' && so.confirmationAttachment) {
    try {
      tryConfirm(so.id);
    } catch {
      /* stays draft — the page shows what is missing */
    }
  }
});

onApprovalDecided('Sales order change', (req: ApprovalRequest) => {
  if (req.entity !== 'Sales order') return;
  const so = findOrder(req.entityId);
  const p = so?.pendingAmendment;
  if (!so || !p) return;
  if (req.record.status === 'Approved') {
    applyAmendment(so.id, p, p.approval.requestedBy);
  } else {
    patchOrder(so.id, { pendingAmendment: { ...p, approval: req.record } });
    logActivity({
      entity: 'Sales order',
      entityId: so.id,
      entityRef: so.number,
      action: `change rejected${req.record.reason ? ` — ${req.record.reason}` : ''}`,
    });
  }
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
      credit: creditFor(so),
      changeApprovalThreshold: db.approvalRules.find((r) => r.active && r.docType === 'Sales order change')
        ?.threshold,
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
        currency: q.currency,
        exchangeRate: q.exchangeRate,
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
        fuelSurchargePct: c.fuelSurchargePct,
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
          // C3: cost from the cheapest vendor rate valid today.
          const sug = suggestLine(serviceId, { origin: e.origin, destination: e.destination });
          return {
            serviceId,
            description: `${svc?.name ?? 'Service'} — ${locationTextMulti(e.serviceCategories, e.origin, e.destination)}`,
            quantity: 1,
            unit: svc?.unit ?? 'Unit',
            unitPrice: 0,
            unitCost: Number(sug.unitCost ?? 0),
            ...(sug.minimumCharge ? { minimumCharge: sug.minimumCharge } : {}),
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

  create(input: SalesOrderInput): Promise<SalesOrderSaveResult> {
    const db = protoDb.get();
    const { confirm, lines, serviceCategories: selected, confirmationFile, ...rest } = input;
    const modeOf = (serviceId: string) => db.services.find((x) => x.id === serviceId)?.mode;
    const serviceCategories = categoriesFromLines(lines, modeOf, selected);
    // C6: contract fuel surcharge on the transport subtotal.
    const contract = rest.contractId ? db.contracts.find((c) => c.id === rest.contractId) : undefined;
    const pct = contract?.fuelSurchargePct ?? 0;
    const isTransport = (id: string) => {
      const m = modeOf(id);
      return m === 'Road' || m === 'Sea' || m === 'Air';
    };
    const fuel = fuelSurchargeAmount(lines, pct, isTransport);
    const firstTransport = lines.find((l) => isTransport(l.serviceId));
    const allLines: Omit<PriceLine, 'id'>[] =
      fuel > 0 && firstTransport
        ? [
            ...lines,
            {
              serviceId: firstTransport.serviceId,
              description: `Fuel surcharge ${pct}% (contract ${contract!.number})`,
              quantity: 1,
              unit: 'Lump sum',
              unitPrice: fuel,
              unitCost: 0,
              customerApproved: true,
            },
          ]
        : lines;
    const so: SalesOrder = {
      serviceCategories,
      serviceCategory: primaryCategory(serviceCategories),
      id: newId('so'),
      number: nextNumber(),
      status: 'Draft',
      owner: db.session?.displayName ?? 'Prototype user',
      lines: allLines.map((l) => ({ ...l, id: newId('ln') })),
      version: 1,
      ...rest,
      ...(confirmationFile ? { confirmationAttachment: toAttachment(confirmationFile) } : {}),
      mode: serviceCategories.includes('Transport') ? rest.mode : undefined,
    };
    protoDb.update((s) => ({ ...s, salesOrders: [so, ...s.salesOrders] }));
    logActivity({
      entity: 'Sales order',
      entityId: so.id,
      entityRef: so.number,
      action: 'saved a draft sales order',
    });
    if (!confirm) return latency({ salesOrder: so, confirmed: false }, 300);
    try {
      return latency(tryConfirm(so.id), 300);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  },

  /** C4/C5: confirm a draft (PO reference + confirmation document + credit check). */
  confirm(id: string, input: ConfirmInput): Promise<SalesOrderSaveResult> {
    const so = findOrder(id);
    if (!so) return Promise.reject(new Error('Not found'));
    if (so.status !== 'Draft') return Promise.reject(new Error('Only a draft can be confirmed.'));
    patchOrder(id, {
      customerPoRef: input.customerPoRef.trim(),
      ...(input.confirmationFile ? { confirmationAttachment: toAttachment(input.confirmationFile) } : {}),
    });
    try {
      return latency(tryConfirm(id), 300);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  },

  /** C5: ask the approver (approval matrix 'Credit override') to release a credit block. */
  requestCreditOverride(id: string, reason: string): Promise<ApprovalRecord> {
    const so = findOrder(id);
    if (!so) return Promise.reject(new Error('Not found'));
    if (reason.trim().length < 3) return Promise.reject(new Error('Give a reason for the override.'));
    const credit = creditFor(so);
    const rule = approvalNeeded('Credit override', credit.exposure);
    if (!rule)
      return Promise.reject(
        new Error('No approver is set for credit overrides in the approval matrix. Ask an administrator.'),
      );
    const record = requestApproval({
      docType: 'Credit override',
      rule,
      entity: 'Sales order',
      entityId: so.id,
      entityRef: so.number,
      summary: `${lookupName.customer(so.customerId)} — ${credit.reasons.join('; ')}`,
      amount: credit.orderValue,
      href: `/sales-orders/${so.id}`,
      reason: reason.trim(),
    });
    patchOrder(id, { creditOverride: record });
    return latency(record, 250);
  },

  /** C8: change lines / notes after confirmation; big changes go to the approval matrix. */
  amend(id: string, input: AmendInput): Promise<{ applied: boolean; approverRole?: string }> {
    const so = findOrder(id);
    if (!so) return Promise.reject(new Error('Not found'));
    if (so.status !== 'Confirmed' && so.status !== 'In progress')
      return Promise.reject(new Error('Only a confirmed or in-progress order can be amended.'));
    if (input.note.trim().length < 3)
      return Promise.reject(new Error('Say what changed and why (at least 3 characters).'));
    if (so.pendingAmendment?.approval.status === 'Pending')
      return Promise.reject(new Error('A change is already waiting for approval.'));
    const lines = input.lines.map((l) => ({ ...l, id: newId('ln') }));
    const change = valueChange(so.lines, lines);
    const changeAed = toAed(change, so.currency, fxOf(so));
    const rule = approvalNeeded('Sales order change', Math.abs(changeAed));
    if (rule) {
      const approval = requestApproval({
        docType: 'Sales order change',
        rule,
        entity: 'Sales order',
        entityId: so.id,
        entityRef: so.number,
        summary: `${lookupName.customer(so.customerId)} — value ${changeAed >= 0 ? '+' : ''}${changeAed.toFixed(2)} AED: ${input.note.trim()}`,
        amount: Math.abs(changeAed),
        href: `/sales-orders/${so.id}`,
        reason: input.note.trim(),
      });
      patchOrder(id, {
        pendingAmendment: {
          lines,
          notes: input.notes,
          note: input.note.trim(),
          valueChange: changeAed,
          approval,
        },
      });
      logActivity({
        entity: 'Sales order',
        entityId: id,
        entityRef: so.number,
        action: `requested a change (${rule.approverRole})`,
      });
      return latency({ applied: false, approverRole: rule.approverRole }, 250);
    }
    applyAmendment(id, { lines, notes: input.notes, note: input.note.trim() }, currentUser());
    return latency({ applied: true }, 250);
  },

  /** C9: cancel with a reason and an optional billable cancellation fee (AED). */
  cancel(id: string, input: { reason: string; fee?: number }): Promise<void> {
    const db = protoDb.get();
    const so = findOrder(id);
    if (!so) return Promise.reject(new Error('Not found'));
    if (so.status === 'Cancelled' || so.status === 'Completed')
      return Promise.reject(new Error(`A ${so.status.toLowerCase()} order cannot be cancelled.`));
    if (input.reason.trim().length < 3) return Promise.reject(new Error('Give the reason for cancelling.'));
    if (input.fee !== undefined && (!Number.isFinite(input.fee) || input.fee < 0))
      return Promise.reject(new Error('The cancellation fee cannot be negative.'));
    const invoiced = db.invoices.some(
      (i) =>
        i.status !== 'Cancelled' &&
        (i.salesOrderIds?.includes(id) || i.lines.some((l) => l.salesOrderId === id)),
    );
    if (invoiced)
      return Promise.reject(new Error('This order is already invoiced. Raise a credit note instead.'));
    const openJobs = db.workOrders.filter((w) => w.salesOrderId === id && w.status !== 'Cancelled');
    if (openJobs.length)
      return Promise.reject(
        new Error(`Cancel its jobs first (${openJobs.map((w) => w.number).join(', ')}).`),
      );
    patchOrder(id, {
      status: 'Cancelled',
      cancelReason: input.reason.trim(),
      cancellationFee: input.fee && input.fee > 0 ? Math.round(input.fee * 100) / 100 : undefined,
    });
    logActivity({
      entity: 'Sales order',
      entityId: id,
      entityRef: so.number,
      action: `cancelled the sales order — ${input.reason.trim()}${input.fee ? ` (fee AED ${input.fee.toFixed(2)})` : ''}`,
    });
    return latency(undefined, 250);
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
    for (const key of [
      'sales-orders',
      'quotations',
      'enquiries',
      'contracts',
      'customers',
      'home',
      'approvals',
    ]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useCreateSalesOrder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: salesOrdersApi.create, onSuccess: invalidate });
}

export function useConfirmSalesOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: ConfirmInput & { id: string }) => salesOrdersApi.confirm(id, input),
    onSuccess: invalidate,
  });
}

export function useRequestCreditOverride() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      salesOrdersApi.requestCreditOverride(id, reason),
    onSuccess: invalidate,
  });
}

export function useAmendSalesOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: AmendInput & { id: string }) => salesOrdersApi.amend(id, input),
    onSuccess: invalidate,
  });
}

export function useCancelSalesOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason, fee }: { id: string; reason: string; fee?: number }) =>
      salesOrdersApi.cancel(id, { reason, fee }),
    onSuccess: invalidate,
  });
}

export function useSetSalesOrderStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SalesOrderStatus }) =>
      salesOrdersApi.setStatus(id, status),
    onSuccess: invalidate,
  });
}
