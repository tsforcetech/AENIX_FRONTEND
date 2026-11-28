import { nextDocNumber } from '@/domain/numbering';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { daysBetween, invoiceTotals } from '@/domain/calc';
import { customerBalance, invoiceAed, invoiceSettlement } from '@/domain/balances';
import { assertOpenPeriod, DEFAULT_RATES } from '@/domain/controls';
import type {
  ApprovalRequest,
  Collection,
  CreditNote,
  Currency,
  Customer,
  Invoice,
  InvoiceLine,
  SalesOrder,
  WorkOrderStatus,
} from '@/domain/types';
import { approvalFor, approvalNeeded, onApprovalDecided, requestApproval } from '@/shared/data/approvals';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';
import { ACCOUNTS, nextSeries, postJournal } from '@/features/accounting/ledger';
import { emirateFor } from '@/features/accounting/vatReturn';
import { invoicePostingLines } from './billing';

/**
 * Invoices data source. PROTOTYPE ADAPTER — replace `invoicesApi` bodies with the generated
 * OpenAPI client once the Billing (Phase 7) contract is published. Totals here are display
 * maths only; the backend is the calculation authority.
 *
 * Money: invoice amounts are in the invoice currency (C10, default AED); journals and balances
 * are in AED. `paid` holds everything that settled the invoice (receipts, credit notes,
 * write-offs) so every screen's "outstanding" stays consistent.
 */
export interface InvoiceRow extends Invoice {
  customerName: string;
  subtotal: number;
  vat: number;
  total: number;
  outstanding: number;
  /** AED equivalents (equal to the amounts above for AED invoices). */
  totalAed: number;
  outstandingAed: number;
  currencyCode: Currency;
  rate: number;
  /** Disbursements (rebilled at cost) — shown as a separate subtotal (A9). */
  disbursementSubtotal: number;
  cashReceived: number;
  daysOverdue: number;
  sourceLabel: string;
  sourceType: 'Job' | 'Storage' | 'Manual' | 'Sales orders';
  /** Sales orders billed by this invoice (one invoice may bill several). */
  salesOrders: { id: string; number: string }[];
}

export interface InvoiceDetail extends InvoiceRow {
  customer: Pick<
    Customer,
    | 'id'
    | 'name'
    | 'code'
    | 'city'
    | 'country'
    | 'trnMasked'
    | 'contactName'
    | 'contactEmail'
    | 'contactPhone'
    | 'postalAddress'
    | 'paymentTermsDays'
  >;
  payments: (Pick<Collection, 'id' | 'number' | 'date' | 'method' | 'reference' | 'status'> & {
    amount: number;
  })[];
  creditNotes: (CreditNote & { total: number })[];
  pendingCredit?: ApprovalRequest;
  pendingWriteOff?: ApprovalRequest;
  /** Customer net position after this invoice's credits / write-offs (AED). */
  customerBalance: number;
}

export interface InvoiceKpis {
  outstanding: number;
  overdue: number;
  overdueCount: number;
  dueNext7: number;
  collectedMonth: number;
}

export const OPEN_STATUSES: Invoice['status'][] = ['Posted', 'Partially paid', 'Overdue'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Rate to AED for one unit of the invoice currency. */
export function rateOf(doc: { currency?: Currency; exchangeRate?: number }): number {
  const cur = doc.currency ?? 'AED';
  return cur === 'AED' ? 1 : (doc.exchangeRate ?? DEFAULT_RATES[cur]);
}

function toRow(inv: Invoice): InvoiceRow {
  const t = invoiceTotals(inv);
  const db = protoDb.get();
  const wo = inv.workOrderId ? db.workOrders.find((w) => w.id === inv.workOrderId) : undefined;
  const run = inv.storageRunId ? db.storageRuns.find((r) => r.id === inv.storageRunId) : undefined;
  const soIds = [
    ...new Set([
      ...(inv.salesOrderIds ?? []),
      ...inv.lines.flatMap((l) => (l.salesOrderId ? [l.salesOrderId] : [])),
    ]),
  ];
  const salesOrders = soIds.map((id) => ({
    id,
    number: db.salesOrders.find((x) => x.id === id)?.number ?? id,
  }));
  return {
    ...inv,
    customerName: lookupName.customer(inv.customerId),
    ...t,
    totalAed: invoiceAed(inv, t.total),
    outstandingAed: invoiceAed(inv, t.outstanding),
    currencyCode: inv.currency ?? 'AED',
    rate: rateOf(inv),
    disbursementSubtotal: r2(
      inv.lines.filter((l) => l.isDisbursement).reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    ),
    cashReceived: invoiceSettlement(inv).cash,
    daysOverdue: inv.status === 'Overdue' ? Math.max(0, daysBetween(inv.dueDate, PROTO_TODAY)) : 0,
    sourceLabel: wo
      ? wo.number
      : run
        ? run.number
        : salesOrders.length
          ? salesOrders.map((x) => x.number).join(', ')
          : 'Manual',
    sourceType: wo ? 'Job' : run ? 'Storage' : salesOrders.length ? 'Sales orders' : 'Manual',
    salesOrders,
  };
}

function statusAfterPayment(inv: Invoice, paid: number): Invoice['status'] {
  const { total } = invoiceTotals({ ...inv, paid });
  if (paid >= total - 0.01) return 'Paid';
  if (inv.dueDate < PROTO_TODAY) return 'Overdue';
  return paid > 0 ? 'Partially paid' : 'Posted';
}

function revenueAccount(inv: Invoice) {
  return inv.storageRunId ? ACCOUNTS.storageRevenue : ACCOUNTS.freightRevenue;
}

/** Posts a credit note (A2): stored CN-###, invoice settled by the credit, reversing journal. */
function postCreditNote(invoiceId: string, gross: number, reason: string): CreditNote {
  const db = protoDb.get();
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv || !OPEN_STATUSES.includes(inv.status))
    throw new Error('Only open posted invoices can be credited');
  assertOpenPeriod(db.company, PROTO_TODAY);
  const t = invoiceTotals(inv);
  const amt = r2(Math.min(gross, t.outstanding));
  if (amt <= 0) throw new Error('Nothing left to credit on this invoice');
  const vatRate = t.subtotal > 0 ? Math.round((t.vat / t.subtotal) * 10_000) / 10_000 : 0;
  const net = r2(amt / (1 + vatRate));
  const cn: CreditNote = {
    id: newId('cn'),
    number: nextSeries(
      'CN',
      db.creditNotes.map((c) => c.number),
    ),
    customerId: inv.customerId,
    invoiceId,
    date: PROTO_TODAY,
    reason,
    amount: net,
    vatRate,
    status: 'Posted',
  };
  const disbShare =
    t.subtotal > 0
      ? inv.lines.filter((l) => l.isDisbursement).reduce((s, l) => s + l.quantity * l.unitPrice, 0) /
        t.subtotal
      : 0;
  const netAed = invoiceAed(inv, net);
  const disbAed = r2(netAed * disbShare);
  const vatAed = invoiceAed(inv, r2(amt - net));
  postJournal({
    date: PROTO_TODAY,
    source: 'Credit note',
    reference: cn.number,
    memo: `Credit note ${cn.number} against ${inv.number} — ${reason}`,
    lines: [
      { account: revenueAccount(inv), debit: r2(netAed - disbAed), credit: 0 },
      { account: ACCOUNTS.disbursements, debit: disbAed, credit: 0 },
      { account: ACCOUNTS.vatOut, debit: vatAed, credit: 0 },
      { account: ACCOUNTS.ar, debit: 0, credit: r2(netAed + vatAed) },
    ],
  });
  protoDb.update((s) => ({
    ...s,
    creditNotes: [cn, ...s.creditNotes],
    invoices: s.invoices.map((i) => {
      if (i.id !== invoiceId) return i;
      const paid = r2(i.paid + amt);
      const fullyCredited = i.paid === 0 && amt >= t.total - 0.01;
      return {
        ...i,
        paid,
        credited: r2((i.credited ?? 0) + amt),
        status: fullyCredited ? ('Cancelled' as const) : statusAfterPayment(i, paid),
      };
    }),
  }));
  logActivity({
    entity: 'Invoice',
    entityId: invoiceId,
    entityRef: inv.number,
    action: `issued credit note ${cn.number} (${reason})`,
  });
  return cn;
}

/** Posts a bad-debt write-off (A16): Dr 6500 / Cr AR. */
function postWriteOff(invoiceId: string, amount: number, reason: string): void {
  const db = protoDb.get();
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv || !OPEN_STATUSES.includes(inv.status)) throw new Error('Invoice is not open');
  assertOpenPeriod(db.company, PROTO_TODAY);
  const amt = r2(Math.min(amount, invoiceTotals(inv).outstanding));
  const aed = invoiceAed(inv, amt);
  postJournal({
    date: PROTO_TODAY,
    source: 'Write-off',
    reference: inv.number,
    memo: `Bad debt written off on ${inv.number} — ${reason}`,
    lines: [
      { account: ACCOUNTS.badDebts, debit: aed, credit: 0 },
      { account: ACCOUNTS.ar, debit: 0, credit: aed },
    ],
  });
  protoDb.update((s) => ({
    ...s,
    invoices: s.invoices.map((i) => {
      if (i.id !== invoiceId) return i;
      const paid = r2(i.paid + amt);
      return {
        ...i,
        paid,
        writtenOff: r2((i.writtenOff ?? 0) + amt),
        status: statusAfterPayment(i, paid),
      };
    }),
  }));
  logActivity({
    entity: 'Invoice',
    entityId: invoiceId,
    entityRef: inv.number,
    action: `wrote off ${amt.toFixed(2)} as bad debt (${reason})`,
  });
}

/** Summary text carries the reason so the approved effect can be applied later. */
const REASON_SEP = ' — ';
const reasonFrom = (summary: string) => summary.split(REASON_SEP).slice(1).join(REASON_SEP) || 'Approved';

onApprovalDecided('Credit note', (req) => {
  if (req.record.status !== 'Approved') {
    logActivity({
      entity: 'Invoice',
      entityId: req.entityId,
      entityRef: req.entityRef,
      action: 'credit note rejected',
    });
    return;
  }
  const inv = protoDb.get().invoices.find((i) => i.id === req.entityId);
  if (!inv) return;
  postCreditNote(inv.id, r2((req.amount ?? 0) / rateOf(inv)), reasonFrom(req.summary));
});

onApprovalDecided('Write-off', (req) => {
  const inv = protoDb.get().invoices.find((i) => i.id === req.entityId);
  if (!inv) return;
  protoDb.update((s) => ({
    ...s,
    invoices: s.invoices.map((i) => (i.id === inv.id ? { ...i, writeOff: req.record } : i)),
  }));
  if (req.record.status === 'Approved')
    postWriteOff(inv.id, r2((req.amount ?? 0) / rateOf(inv)), reasonFrom(req.summary));
});

export const invoicesApi = {
  list(params: ListParams): Promise<Page<InvoiceRow>> {
    const rows = [...protoDb.get().invoices].sort((a, b) => b.number.localeCompare(a.number)).map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.customerName} ${r.sourceLabel} ${r.salesOrders.map((x) => x.number).join(' ')}`,
        status: (r) => r.status,
      }),
    );
  },
  kpis(): Promise<InvoiceKpis> {
    const db = protoDb.get();
    const open = db.invoices.filter((i) => OPEN_STATUSES.includes(i.status)).map(toRow);
    const in7 = new Date(Date.parse(PROTO_TODAY) + 7 * 86_400_000).toISOString().slice(0, 10);
    const overdue = open.filter((i) => i.status === 'Overdue');
    return latency({
      outstanding: open.reduce((s, i) => s + i.outstandingAed, 0),
      overdue: overdue.reduce((s, i) => s + i.outstandingAed, 0),
      overdueCount: overdue.length,
      dueNext7: open
        .filter((i) => i.status !== 'Overdue' && i.dueDate >= PROTO_TODAY && i.dueDate <= in7)
        .reduce((s, i) => s + i.outstandingAed, 0),
      collectedMonth: db.collections
        .filter(
          (c) =>
            c.date.startsWith(PROTO_TODAY.slice(0, 7)) &&
            (c.status === 'Allocated' || c.status === 'Unallocated'),
        )
        .reduce((s, c) => s + c.amount, 0),
    });
  },
  get(id: string): Promise<InvoiceDetail> {
    const db = protoDb.get();
    const inv = db.invoices.find((i) => i.id === id);
    const c = inv ? db.customers.find((x) => x.id === inv.customerId) : undefined;
    if (!inv || !c) return Promise.reject(new Error('Not found'));
    const payments = db.collections.flatMap((col) =>
      col.allocations
        .filter((a) => a.invoiceId === id)
        .map((a) => ({
          id: col.id,
          number: col.number,
          date: col.date,
          method: col.method,
          reference: col.reference,
          status: col.status,
          amount: a.amount,
        })),
    );
    const pending = (docType: 'Credit note' | 'Write-off') => {
      const req = approvalFor(id, docType);
      return req?.record.status === 'Pending' ? req : undefined;
    };
    return latency({
      ...toRow(inv),
      customer: {
        id: c.id,
        name: c.name,
        code: c.code,
        city: c.city,
        country: c.country,
        trnMasked: c.trnMasked,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        postalAddress: c.postalAddress,
        paymentTermsDays: c.paymentTermsDays,
      },
      payments,
      creditNotes: db.creditNotes
        .filter((cn) => cn.invoiceId === id)
        .map((cn) => ({ ...cn, total: r2(cn.amount * (1 + cn.vatRate)) })),
      pendingCredit: pending('Credit note'),
      pendingWriteOff: pending('Write-off'),
      customerBalance: customerBalance(c.id, db).balance,
    });
  },
  /** Sales orders of a customer that still have something to invoice (drafts count as billed). */
  invoiceableSalesOrders(customerId: string): Promise<InvoiceableSalesOrder[]> {
    return latency(invoiceableSalesOrders(customerId), 80);
  },
  /** One invoice can bill several sales orders of the same customer and currency. */
  create(input: NewInvoiceInput): Promise<Invoice> {
    const db = protoDb.get();
    const lines = input.lines.filter((l) => l.quantity > 0);
    if (!lines.length) return Promise.reject(new Error('Select at least one line to invoice'));
    const soIds = [...new Set(lines.map((l) => l.salesOrderId))];
    const sos = soIds.map((id) => db.salesOrders.find((x) => x.id === id));
    if (sos.some((x) => !x || x.customerId !== input.customerId))
      return Promise.reject(new Error('All sales orders must belong to the selected customer'));
    const currencies = [...new Set(sos.map((x) => x!.currency ?? 'AED'))];
    if (currencies.length > 1)
      return Promise.reject(
        new Error(
          `One invoice can only combine sales orders in the same currency (selected: ${currencies.join(', ')}).`,
        ),
      );
    for (const l of lines) {
      const so = sos.find((x) => x!.id === l.salesOrderId)!;
      const src = l.sourceLineId ? so.lines.find((x) => x.id === l.sourceLineId) : undefined;
      const svc = src ? db.services.find((s) => s.id === src.serviceId) : undefined;
      if (src && svc?.isSurcharge && src.customerApproved === false)
        return Promise.reject(
          new Error(
            `"${src.description}" is a surcharge the customer has not approved — it cannot be billed.`,
          ),
        );
    }
    const currency = currencies[0] as Currency;
    const firstSo = sos[0]!;
    const customer = db.customers.find((c) => c.id === input.customerId);
    const jobs = db.workOrders.filter((w) => w.salesOrderId && soIds.includes(w.salesOrderId));
    const inv: Invoice = {
      id: newId('inv'),
      number: nextDocNumber(
        db.invoices.map((i) => i.number),
        db.company.invoicePrefix,
      ),
      customerId: input.customerId,
      workOrderId: jobs.length === 1 ? jobs[0]!.id : undefined,
      salesOrderIds: soIds,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      lines: lines.map((l): InvoiceLine => ({
        id: newId('il'),
        salesOrderId: l.salesOrderId,
        uom: l.uom,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate ?? (l.isDisbursement ? 0 : 0.05),
        ...(l.isDisbursement ? { isDisbursement: true } : {}),
      })),
      paid: 0,
      status: 'Draft',
      ...(currency !== 'AED'
        ? { currency, exchangeRate: firstSo.exchangeRate ?? DEFAULT_RATES[currency] }
        : {}),
      emirate: customer ? emirateFor(customer) : undefined,
    };
    protoDb.update((s) => ({
      ...s,
      invoices: [inv, ...s.invoices],
      workOrders: s.workOrders.map((w) =>
        w.id === inv.workOrderId && !w.invoiceId ? { ...w, invoiceId: inv.id } : w,
      ),
    }));
    logActivity({
      entity: 'Invoice',
      entityId: inv.id,
      entityRef: inv.number,
      action: `drafted an invoice for ${sos.map((x) => x!.number).join(', ')}`,
    });
    return latency(inv, 250);
  },
  /** Draft → Posted: the invoice becomes read-only and posts AR / revenue / disbursements / VAT. */
  post(id: string): Promise<void> {
    const db = protoDb.get();
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv || inv.status !== 'Draft') return Promise.reject(new Error('Only draft invoices can be posted'));
    try {
      assertOpenPeriod(db.company, PROTO_TODAY);
      postJournal({
        date: PROTO_TODAY,
        source: inv.storageRunId ? 'Storage billing' : 'Invoice',
        reference: inv.number,
        memo: `Customer invoice ${inv.number}${inv.currency && inv.currency !== 'AED' ? ` (${inv.currency} at ${rateOf(inv)})` : ''}`,
        lines: invoicePostingLines(inv, {
          ar: ACCOUNTS.ar,
          revenue: revenueAccount(inv),
          disbursements: ACCOUNTS.disbursements,
          vatOut: ACCOUNTS.vatOut,
        }),
      });
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Could not post'));
    }
    protoDb.update((s) => ({
      ...s,
      invoices: s.invoices.map((i) =>
        i.id === id ? { ...i, status: 'Posted' as const, issueDate: PROTO_TODAY } : i,
      ),
    }));
    logActivity({ entity: 'Invoice', entityId: id, entityRef: inv.number, action: 'posted the invoice' });
    return latency(undefined, 300);
  },
  deleteDraft(id: string): Promise<void> {
    const inv = protoDb.get().invoices.find((i) => i.id === id);
    if (!inv || inv.status !== 'Draft') return Promise.reject(new Error('Only drafts can be deleted'));
    protoDb.update((s) => ({
      ...s,
      invoices: s.invoices.filter((i) => i.id !== id),
      workOrders: s.workOrders.map((w) => (w.invoiceId === id ? { ...w, invoiceId: undefined } : w)),
    }));
    logActivity({
      entity: 'Invoice',
      entityId: id,
      entityRef: inv.number,
      action: 'deleted the draft invoice',
    });
    return latency(undefined, 250);
  },
  /**
   * Credit note (A2) for part or all of the open balance (incl. VAT, invoice currency).
   * At or above the 'Credit note' approval rule it waits for approval; otherwise it posts now.
   */
  creditNote(id: string, gross: number, reason: string): Promise<{ number?: string; pending: boolean }> {
    const db = protoDb.get();
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv || !OPEN_STATUSES.includes(inv.status))
      return Promise.reject(new Error('Only open posted invoices can be credited'));
    const { outstanding } = invoiceTotals(inv);
    const amt = r2(gross);
    if (amt <= 0 || amt > outstanding + 0.005)
      return Promise.reject(new Error('The credit must be more than 0 and not more than the open balance'));
    try {
      assertOpenPeriod(db.company, PROTO_TODAY);
      const aed = invoiceAed(inv, amt);
      const rule = approvalNeeded('Credit note', aed);
      if (rule) {
        requestApproval({
          docType: 'Credit note',
          rule,
          entity: 'Invoice',
          entityId: inv.id,
          entityRef: inv.number,
          summary: `Credit note on ${inv.number} for ${lookupName.customer(inv.customerId)}${REASON_SEP}${reason}`,
          amount: aed,
          href: `/invoices/${inv.id}`,
        });
        return latency({ pending: true }, 250);
      }
      const cn = postCreditNote(id, amt, reason);
      return latency({ number: cn.number, pending: false }, 300);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Could not issue the credit note'));
    }
  },
  /** A16: bad-debt write-off on an overdue invoice — always through the 'Write-off' approval rule. */
  writeOff(id: string, amount: number, reason: string): Promise<{ pending: boolean }> {
    const db = protoDb.get();
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv || inv.status !== 'Overdue')
      return Promise.reject(new Error('Only overdue invoices can be written off'));
    const amt = r2(amount);
    if (amt <= 0 || amt > invoiceTotals(inv).outstanding + 0.005)
      return Promise.reject(new Error('The amount must be more than 0 and not more than the open balance'));
    try {
      assertOpenPeriod(db.company, PROTO_TODAY);
      const aed = invoiceAed(inv, amt);
      const rule = approvalNeeded('Write-off', aed);
      if (rule) {
        const record = requestApproval({
          docType: 'Write-off',
          rule,
          entity: 'Invoice',
          entityId: inv.id,
          entityRef: inv.number,
          summary: `Bad-debt write-off on ${inv.number} for ${lookupName.customer(inv.customerId)}${REASON_SEP}${reason}`,
          amount: aed,
          href: `/invoices/${inv.id}`,
        });
        protoDb.update((s) => ({
          ...s,
          invoices: s.invoices.map((i) => (i.id === id ? { ...i, writeOff: record } : i)),
        }));
        return latency({ pending: true }, 250);
      }
      postWriteOff(id, amt, reason);
      return latency({ pending: false }, 250);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Could not write off'));
    }
  },
  /** A6: payment reminder recorded on the invoice (delivery by email / WhatsApp is backend work). */
  sendReminder(id: string, level: 1 | 2 | 3, channel: 'Email' | 'WhatsApp' | 'Letter'): Promise<void> {
    const inv = protoDb.get().invoices.find((i) => i.id === id);
    if (!inv || !OPEN_STATUSES.includes(inv.status))
      return Promise.reject(new Error('Reminders are only for open invoices'));
    protoDb.update((s) => ({
      ...s,
      invoices: s.invoices.map((i) =>
        i.id === id ? { ...i, reminders: [...(i.reminders ?? []), { level, at: nowIso(), channel }] } : i,
      ),
    }));
    logActivity({
      entity: 'Invoice',
      entityId: id,
      entityRef: inv.number,
      action: `sent payment reminder ${level} by ${channel}`,
    });
    return latency(undefined, 200);
  },
};

/** Used by Collections when cash (AED) is allocated to an invoice. */
export function applyPaymentToInvoice(invoiceId: string, amountAed: number): void {
  protoDb.update((s) => ({
    ...s,
    invoices: s.invoices.map((i) => {
      if (i.id !== invoiceId) return i;
      const paid = r2(i.paid + amountAed / rateOf(i));
      return { ...i, paid, status: statusAfterPayment(i, paid) };
    }),
  }));
}

/** Bounced cheque (A5): takes a receipt (AED) back off the invoice, which becomes unpaid again. */
export function reversePaymentOnInvoice(invoiceId: string, amountAed: number): void {
  protoDb.update((s) => ({
    ...s,
    invoices: s.invoices.map((i) => {
      if (i.id !== invoiceId) return i;
      const paid = r2(Math.max(0, i.paid - amountAed / rateOf(i)));
      const status: Invoice['status'] =
        i.status === 'Cancelled'
          ? i.status
          : paid >= invoiceTotals(i).total - 0.01
            ? 'Paid'
            : statusAfterPayment(i, paid);
      return { ...i, paid, status };
    }),
  }));
}

/** Draft invoice for a single charge (e.g. a bounced-cheque charge, A5). */
export function draftChargeInvoice(customerId: string, description: string, amount: number): Invoice {
  const db = protoDb.get();
  const terms = db.customers.find((c) => c.id === customerId)?.paymentTermsDays ?? 30;
  const inv: Invoice = {
    id: newId('inv'),
    number: nextDocNumber(
      db.invoices.map((i) => i.number),
      db.company.invoicePrefix,
    ),
    customerId,
    issueDate: PROTO_TODAY,
    dueDate: new Date(Date.parse(PROTO_TODAY) + terms * 86_400_000).toISOString().slice(0, 10),
    lines: [{ id: newId('il'), description, quantity: 1, unitPrice: r2(amount), vatRate: 0, uom: 'Charge' }],
    paid: 0,
    status: 'Draft',
  };
  protoDb.update((s) => ({ ...s, invoices: [inv, ...s.invoices] }));
  logActivity({
    entity: 'Invoice',
    entityId: inv.id,
    entityRef: inv.number,
    action: `drafted: ${description}`,
  });
  return inv;
}

export function openInvoicesForCustomer(customerId: string): InvoiceRow[] {
  return protoDb
    .get()
    .invoices.filter((i) => i.customerId === customerId && OPEN_STATUSES.includes(i.status))
    .map(toRow)
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Open invoices of every customer (collections follow-up, A6). */
export function allOpenInvoices(): InvoiceRow[] {
  return protoDb
    .get()
    .invoices.filter((i) => OPEN_STATUSES.includes(i.status))
    .map(toRow)
    .filter((r) => r.outstanding > 0.005);
}

export interface InvoiceableLine {
  key: string;
  salesOrderId: string;
  /** Sales-order price line this bills (undefined for a cancellation fee). */
  sourceLineId?: string;
  description: string;
  unit: string;
  unitPrice: number;
  /** Quantity still to bill (order quantity minus what earlier invoices already billed). */
  quantity: number;
  vatRate: number;
  /** A9: rebilled at cost, not revenue. */
  isDisbursement: boolean;
  /** T8: surcharge not approved by the customer — cannot be billed. */
  blockedReason?: string;
}

export interface InvoiceableSalesOrder {
  id: string;
  number: string;
  customerPoRef: string;
  status: SalesOrder['status'];
  orderDate: string;
  orderValue: number;
  invoiced: number;
  notInvoiced: number;
  currency: Currency;
  exchangeRate: number;
  jobs: { id: string; number: string; status: WorkOrderStatus }[];
  lines: InvoiceableLine[];
}

export interface NewInvoiceInput {
  customerId: string;
  issueDate: string;
  dueDate: string;
  lines: {
    salesOrderId: string;
    sourceLineId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    uom?: string;
    vatRate?: number;
    isDisbursement?: boolean;
  }[];
}

/**
 * Remaining billable lines per sales order. Every non-cancelled invoice (drafts included) counts,
 * so a line is never billed twice. Matching is by sales order + description (prototype rule).
 * A cancelled order offers only its cancellation fee (C9).
 */
export function invoiceableSalesOrders(customerId: string): InvoiceableSalesOrder[] {
  const db = protoDb.get();
  const balance = customerBalance(customerId, db);
  const billedQty = new Map<string, number>();
  for (const inv of db.invoices) {
    if (inv.customerId !== customerId || inv.status === 'Cancelled') continue;
    for (const l of inv.lines) {
      const soId = l.salesOrderId ?? (inv.salesOrderIds?.length === 1 ? inv.salesOrderIds[0] : undefined);
      if (!soId) continue;
      const k = `${soId}|${l.description}`;
      billedQty.set(k, (billedQty.get(k) ?? 0) + l.quantity);
    }
  }
  const take = (soId: string, description: string, qty: number) => {
    const k = `${soId}|${description}`;
    const left = Math.max(0, qty - (billedQty.get(k) ?? 0));
    billedQty.set(k, Math.max(0, (billedQty.get(k) ?? 0) - qty));
    return left;
  };
  return db.salesOrders
    .filter(
      (so) =>
        so.customerId === customerId &&
        so.status !== 'Draft' &&
        (so.status !== 'Cancelled' || (so.cancellationFee ?? 0) > 0),
    )
    .map((so) => {
      let lines: InvoiceableLine[];
      if (so.status === 'Cancelled') {
        const description = `Cancellation fee — ${so.number}`;
        lines = [
          {
            key: `${so.id}|cancel-fee`,
            salesOrderId: so.id,
            description,
            unit: 'Order',
            unitPrice: so.cancellationFee ?? 0,
            quantity: take(so.id, description, 1),
            vatRate: 0.05,
            isDisbursement: false,
          },
        ];
      } else {
        lines = so.lines.map((l) => {
          const svc = db.services.find((s) => s.id === l.serviceId);
          const isDisbursement = !!svc?.isDisbursement;
          return {
            key: `${so.id}|${l.id}`,
            salesOrderId: so.id,
            sourceLineId: l.id,
            description: l.description,
            unit: l.unit,
            unitPrice: l.unitPrice,
            quantity: take(so.id, l.description, l.quantity),
            vatRate: isDisbursement ? 0 : 0.05,
            isDisbursement,
            blockedReason:
              svc?.isSurcharge && l.customerApproved === false
                ? 'Surcharge not approved by the customer — get approval on the sales order first.'
                : undefined,
          };
        });
      }
      lines = lines.filter((l) => l.quantity > 0);
      const b = balance.salesOrders.find((x) => x.salesOrderId === so.id);
      const currency = so.currency ?? 'AED';
      return {
        id: so.id,
        number: so.number,
        customerPoRef: so.customerPoRef,
        status: so.status,
        orderDate: so.orderDate,
        orderValue: b?.orderValue ?? 0,
        invoiced: b?.invoiced ?? 0,
        notInvoiced: r2(
          lines
            .filter((l) => !l.blockedReason)
            .reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate), 0),
        ),
        currency,
        exchangeRate: currency === 'AED' ? 1 : (so.exchangeRate ?? DEFAULT_RATES[currency]),
        jobs: db.workOrders
          .filter((w) => w.salesOrderId === so.id)
          .map((w) => ({ id: w.id, number: w.number, status: w.status })),
        lines,
      };
    })
    .filter((so) => so.lines.length > 0);
}

export function useInvoiceableSalesOrders(customerId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'invoiceable', customerId],
    queryFn: () => invoicesApi.invoiceableSalesOrders(customerId!),
    enabled: !!customerId,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, post }: { input: NewInvoiceInput; post: boolean }) => {
      const inv = await invoicesApi.create(input);
      if (post) await invoicesApi.post(inv.id);
      return inv;
    },
    onSuccess: () => {
      invalidateFinance(qc);
      void qc.invalidateQueries({ queryKey: ['sales-orders'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function invalidateFinance(qc: QueryClient) {
  for (const key of [
    'invoices',
    'vendor-bills',
    'collections',
    'payments',
    'purchase-orders',
    'accounting',
    'expenses',
    'approvals',
    'customers',
    'vendors',
    'home',
  ])
    void qc.invalidateQueries({ queryKey: [key] });
}

export function useInvoices(params: ListParams) {
  return useQuery({
    queryKey: ['invoices', 'list', params],
    queryFn: () => invoicesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useInvoiceKpis() {
  return useQuery({ queryKey: ['invoices', 'kpis'], queryFn: () => invoicesApi.kpis() });
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: ['invoices', 'detail', id], queryFn: () => invoicesApi.get(id) });
}

export function usePostInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: invoicesApi.post, onSuccess: () => invalidateFinance(qc) });
}

export function useDeleteDraftInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: invoicesApi.deleteDraft, onSuccess: () => invalidateFinance(qc) });
}

export function useCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      invoicesApi.creditNote(id, amount, reason),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useWriteOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      invoicesApi.writeOff(id, amount, reason),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useSendReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      level,
      channel,
    }: {
      id: string;
      level: 1 | 2 | 3;
      channel: 'Email' | 'WhatsApp' | 'Letter';
    }) => invoicesApi.sendReminder(id, level, channel),
    onSuccess: () => invalidateFinance(qc),
  });
}
