import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerBalance, type CustomerBalance } from '@/domain/balances';
import { daysBetween } from '@/domain/calc';
import { assertOpenPeriod } from '@/domain/controls';
import type { Collection, PaymentMethod, PdcStatus, VendorPayment } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { ACCOUNTS, notify, postJournal } from '@/features/accounting/ledger';
import {
  allOpenInvoices,
  applyPaymentToInvoice,
  draftChargeInvoice,
  invalidateFinance,
  openInvoicesForCustomer,
  reversePaymentOnInvoice,
  type InvoiceRow,
} from '@/features/invoices/api';
import { paymentsApi } from '@/features/payments/api';
import { ageingBucket, creditHoldSuggestions, nextReminderLevel, type AgeingBucket } from './followUp';

/**
 * Collections (customer receipts) data source. PROTOTYPE ADAPTER — replace `collectionsApi`
 * bodies with the generated OpenAPI client once the Billing (Phase 7) contract exists.
 * Allocation limits are re-validated server-side; the UI checks are for usability only.
 */
export interface CollectionRow extends Collection {
  customerName: string;
  allocated: number;
  unallocated: number;
  invoiceNumbers: string[];
  /** Human labels for where the money went, e.g. "INV-3029" or "SO-5110 advance". */
  targets: string[];
  /** Part still held as an advance against sales orders. */
  advanceAmount: number;
}

export interface CollectionInput {
  customerId: string;
  date: string;
  method: PaymentMethod;
  reference: string;
  chequeDate?: string;
  /** A5: cheque number and drawee bank (Cheque / PDC). */
  chequeNo?: string;
  bankName?: string;
  amount: number;
  /** To invoices and/or as an advance against a sales order (no invoice yet). */
  allocations: { invoiceId?: string; salesOrderId?: string; amount: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toRow(c: Collection): CollectionRow {
  const allocated = round2(c.allocations.reduce((s, a) => s + a.amount, 0));
  const invoices = protoDb.get().invoices;
  return {
    ...c,
    customerName: lookupName.customer(c.customerId),
    allocated,
    unallocated: round2(c.amount - allocated),
    invoiceNumbers: c.allocations.flatMap((a) =>
      a.invoiceId ? [invoices.find((i) => i.id === a.invoiceId)?.number ?? a.invoiceId] : [],
    ),
    targets: c.allocations.map((a) =>
      a.invoiceId
        ? (invoices.find((i) => i.id === a.invoiceId)?.number ?? a.invoiceId)
        : `${protoDb.get().salesOrders.find((x) => x.id === a.salesOrderId)?.number ?? a.salesOrderId} advance`,
    ),
    advanceAmount: round2(
      c.allocations.filter((a) => a.salesOrderId && !a.invoiceId).reduce((s, a) => s + a.amount, 0),
    ),
  };
}

/** Open invoices with `outstanding` in AED (receipts are in AED; C10). */
function openInvoicesAed(customerId: string): InvoiceRow[] {
  return openInvoicesForCustomer(customerId).map((r) => ({ ...r, outstanding: r.outstandingAed }));
}

function nextNumber(): string {
  const n = Math.max(4400, ...protoDb.get().collections.map((c) => Number(c.number.split('-')[1]) || 0)) + 1;
  return `RCPT-${n}`;
}

/** Receipt status from its allocations: only SO advances → Advance; fully allocated → Allocated. */
function statusFor(amount: number, allocations: Collection['allocations']): Collection['status'] {
  const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
  if (allocated < amount - 0.005) return 'Unallocated';
  return allocations.length > 0 && allocations.every((a) => a.salesOrderId && !a.invoiceId)
    ? 'Advance'
    : 'Allocated';
}

function guardPeriod(): Error | undefined {
  try {
    assertOpenPeriod(protoDb.get().company, PROTO_TODAY);
    return undefined;
  } catch (e) {
    return e instanceof Error ? e : new Error('The period is locked');
  }
}

/**
 * Applies invoice allocations and posts the cash (used on save and on PDC clearance).
 * Invoice part (and any unallocated remainder, held on account) → Cr AR.
 * Sales-order advance part → Cr 2300 Customer advances (moved to AR when applied to an invoice).
 */
function settle(col: Collection): void {
  const advance = round2(
    col.allocations.filter((a) => a.salesOrderId && !a.invoiceId).reduce((s, a) => s + a.amount, 0),
  );
  const toAr = round2(col.amount - advance);
  postJournal({
    date: PROTO_TODAY,
    source: 'Collection',
    reference: col.number,
    memo: `Receipt ${col.number} — ${col.method}${advance ? ' (incl. sales-order advance)' : ''}`,
    lines: [
      { account: ACCOUNTS.bank, debit: col.amount, credit: 0 },
      ...(toAr > 0 ? [{ account: ACCOUNTS.ar, debit: 0, credit: toAr }] : []),
      ...(advance > 0 ? [{ account: ACCOUNTS.customerAdvances, debit: 0, credit: advance }] : []),
    ],
  });
  col.allocations.forEach((a) => {
    if (a.invoiceId) applyPaymentToInvoice(a.invoiceId, a.amount);
  });
}

export const collectionsApi = {
  list(params: ListParams): Promise<Page<CollectionRow>> {
    const rows = [...protoDb.get().collections].sort((a, b) => b.number.localeCompare(a.number)).map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.customerName} ${r.reference} ${r.chequeNo ?? ''} ${r.invoiceNumbers.join(' ')}`,
        status: (r) => r.status,
      }),
    );
  },
  /** Open invoices with `outstanding` in AED (receipts are in AED; C10). */
  openInvoices(customerId: string): Promise<InvoiceRow[]> {
    return latency(openInvoicesAed(customerId), 80);
  },
  invoiceCustomer(invoiceId: string): string | undefined {
    return protoDb.get().invoices.find((i) => i.id === invoiceId)?.customerId;
  },
  salesOrderCustomer(salesOrderId: string): string | undefined {
    return protoDb.get().salesOrders.find((x) => x.id === salesOrderId)?.customerId;
  },
  /** Exact customer position: invoiced, received, advances, outstanding, per sales order. */
  balance(customerId: string): Promise<CustomerBalance> {
    return latency(customerBalance(customerId, protoDb.get()), 80);
  },
  /** Moves a sales-order advance onto one of the customer's open invoices (Dr 2300 / Cr AR). */
  applyAdvance(collectionId: string, invoiceId: string, amount: number): Promise<void> {
    const db = protoDb.get();
    const col = db.collections.find((c) => c.id === collectionId);
    const inv = openInvoicesAed(col?.customerId ?? '').find((i) => i.id === invoiceId);
    if (!col || !inv) return Promise.reject(new Error('Receipt or open invoice not found'));
    const held = round2(
      col.allocations.filter((a) => a.salesOrderId && !a.invoiceId).reduce((s, a) => s + a.amount, 0),
    );
    const amt = round2(amount);
    if (amt <= 0 || amt > held + 0.005 || amt > inv.outstanding + 0.005)
      return Promise.reject(new Error('Amount exceeds the advance held or the invoice outstanding'));
    const locked = guardPeriod();
    if (locked) return Promise.reject(locked);
    let left = amt;
    const allocations: Collection['allocations'] = [];
    for (const a of col.allocations) {
      if (a.salesOrderId && !a.invoiceId && left > 0) {
        const take = round2(Math.min(left, a.amount));
        left = round2(left - take);
        if (a.amount - take > 0.005) allocations.push({ ...a, amount: round2(a.amount - take) });
      } else allocations.push(a);
    }
    allocations.push({ invoiceId, amount: amt });
    postJournal({
      date: PROTO_TODAY,
      source: 'Collection',
      reference: col.number,
      memo: `Advance ${col.number} applied to ${inv.number}`,
      lines: [
        { account: ACCOUNTS.customerAdvances, debit: amt, credit: 0 },
        { account: ACCOUNTS.ar, debit: 0, credit: amt },
      ],
    });
    const updated: Collection = { ...col, allocations, status: statusFor(col.amount, allocations) };
    protoDb.update((s) => ({
      ...s,
      collections: s.collections.map((c) => (c.id === collectionId ? updated : c)),
    }));
    applyPaymentToInvoice(invoiceId, amt);
    logActivity({
      entity: 'Collection',
      entityId: col.id,
      entityRef: col.number,
      action: `applied the advance to ${inv.number}`,
    });
    return latency(undefined, 250);
  },
  create(input: CollectionInput): Promise<Collection> {
    const allocations = input.allocations.filter((a) => a.amount > 0);
    const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
    if (allocated > input.amount + 0.005)
      return Promise.reject(new Error('Allocations exceed the receipt amount'));
    const isPdc = input.method === 'PDC';
    const isCheque = input.method === 'Cheque';
    if (!isPdc) {
      const locked = guardPeriod();
      if (locked) return Promise.reject(locked);
    }
    const col: Collection = {
      id: newId('rc'),
      number: nextNumber(),
      customerId: input.customerId,
      date: input.date,
      method: input.method,
      amount: round2(input.amount),
      reference: input.reference,
      chequeDate: input.chequeDate,
      allocations,
      status: isPdc ? 'PDC pending' : statusFor(input.amount, allocations),
      ...(isPdc || isCheque
        ? {
            chequeNo: input.chequeNo?.trim() || undefined,
            bankName: input.bankName?.trim() || undefined,
            pdcStatus: (isPdc ? 'Pending' : 'Deposited') as PdcStatus,
          }
        : {}),
    };
    // A post-dated cheque is held: no invoice update or bank posting until it clears.
    if (!isPdc) settle(col);
    protoDb.update((s) => ({ ...s, collections: [col, ...s.collections] }));
    logActivity({
      entity: 'Collection',
      entityId: col.id,
      entityRef: col.number,
      action: isPdc
        ? 'received a PDC'
        : allocations.some((a) => a.salesOrderId && !a.invoiceId)
          ? 'received a sales-order advance'
          : 'recorded a receipt',
    });
    return latency(col, 300);
  },
  /** PDC register: cheque handed to the bank (not cleared yet). */
  depositCheque(id: string): Promise<void> {
    const col = protoDb.get().collections.find((c) => c.id === id);
    if (!col || col.status !== 'PDC pending' || (col.pdcStatus ?? 'Pending') !== 'Pending')
      return Promise.reject(new Error('Only pending PDCs can be deposited'));
    protoDb.update((s) => ({
      ...s,
      collections: s.collections.map((c) => (c.id === id ? { ...c, pdcStatus: 'Deposited' as const } : c)),
    }));
    logActivity({
      entity: 'Collection',
      entityId: id,
      entityRef: col.number,
      action: 'deposited the cheque',
    });
    return latency(undefined, 200);
  },
  /** Cheque honoured. A PDC is allocated (oldest invoice first if not planned) and posted to the bank now. */
  clearPdc(id: string): Promise<void> {
    const col = protoDb.get().collections.find((c) => c.id === id);
    if (!col) return Promise.reject(new Error('Receipt not found'));
    if (col.status !== 'PDC pending') {
      if (col.method !== 'Cheque' || col.pdcStatus === 'Cleared' || col.status === 'Bounced')
        return Promise.reject(new Error('Only pending cheques can be cleared'));
      protoDb.update((s) => ({
        ...s,
        collections: s.collections.map((c) =>
          c.id === id ? { ...c, pdcStatus: 'Cleared' as const, clearedAt: PROTO_TODAY } : c,
        ),
      }));
      logActivity({ entity: 'Collection', entityId: id, entityRef: col.number, action: 'cheque cleared' });
      return latency(undefined, 200);
    }
    const locked = guardPeriod();
    if (locked) return Promise.reject(locked);
    // If no allocation was planned, allocate oldest-first now.
    let allocations = col.allocations;
    if (allocations.length === 0) {
      let left = col.amount;
      allocations = [];
      for (const inv of openInvoicesAed(col.customerId)) {
        if (left <= 0) break;
        const amt = round2(Math.min(left, inv.outstanding));
        allocations.push({ invoiceId: inv.id, amount: amt });
        left = round2(left - amt);
      }
    }
    const cleared: Collection = {
      ...col,
      allocations,
      status: statusFor(col.amount, allocations),
      pdcStatus: 'Cleared',
      clearedAt: PROTO_TODAY,
    };
    settle(cleared);
    protoDb.update((s) => ({ ...s, collections: s.collections.map((c) => (c.id === id ? cleared : c)) }));
    logActivity({ entity: 'Collection', entityId: id, entityRef: col.number, action: 'cleared the PDC' });
    return latency(undefined, 300);
  },
  /**
   * A5 bounced cheque: a reason is required. A cheque already posted is reversed (invoices back to
   * unpaid, Dr AR / Cr Bank); an optional bounce charge is drafted as a customer invoice; staff are notified.
   */
  bounceCheque(id: string, reason: string, charge: number): Promise<{ chargeInvoice?: string }> {
    const col = protoDb.get().collections.find((c) => c.id === id);
    if (!col || col.status === 'Bounced' || !(col.method === 'PDC' || col.method === 'Cheque'))
      return Promise.reject(new Error('Only open cheques can be marked bounced'));
    const why = reason.trim();
    if (why.length < 3) return Promise.reject(new Error('Give the bounce reason'));
    if (charge < 0) return Promise.reject(new Error('The bounce charge cannot be negative'));
    const wasPosted = col.status !== 'PDC pending';
    if (wasPosted) {
      const locked = guardPeriod();
      if (locked) return Promise.reject(locked);
      const advance = round2(
        col.allocations.filter((a) => a.salesOrderId && !a.invoiceId).reduce((s, a) => s + a.amount, 0),
      );
      postJournal({
        date: PROTO_TODAY,
        source: 'Collection',
        reference: col.number,
        memo: `Cheque ${col.chequeNo ?? col.reference} bounced — ${why}`,
        lines: [
          { account: ACCOUNTS.ar, debit: round2(col.amount - advance), credit: 0 },
          { account: ACCOUNTS.customerAdvances, debit: advance, credit: 0 },
          { account: ACCOUNTS.bank, debit: 0, credit: col.amount },
        ],
      });
      col.allocations.forEach((a) => {
        if (a.invoiceId) reversePaymentOnInvoice(a.invoiceId, a.amount);
      });
    }
    protoDb.update((s) => ({
      ...s,
      collections: s.collections.map((c) =>
        c.id === id
          ? {
              ...c,
              status: 'Bounced' as const,
              pdcStatus: 'Bounced' as const,
              bouncedAt: PROTO_TODAY,
              bounceReason: why,
              bounceCharge: charge > 0 ? round2(charge) : undefined,
            }
          : c,
      ),
    }));
    const inv =
      charge > 0
        ? draftChargeInvoice(
            col.customerId,
            `Returned cheque charge — cheque ${col.chequeNo ?? col.reference} (${col.number})`,
            charge,
          )
        : undefined;
    notify(
      `Cheque bounced: ${col.number}`,
      `${lookupName.customer(col.customerId)} — ${why}${inv ? ` · charge drafted on ${inv.number}` : ''}`,
      '/collections/pdc',
    );
    logActivity({
      entity: 'Collection',
      entityId: id,
      entityRef: col.number,
      action: `cheque bounced (${why})${wasPosted ? ' — allocation reversed' : ''}`,
    });
    return latency({ chargeInvoice: inv?.number }, 300);
  },
  /** A5 register: received cheques by maturity date, and cheques issued to vendors. */
  pdcRegister(): Promise<PdcRegister> {
    const db = protoDb.get();
    const received: ReceivedCheque[] = db.collections
      .filter((c) => c.method === 'PDC' || c.method === 'Cheque')
      .map((c) => ({
        id: c.id,
        number: c.number,
        customerId: c.customerId,
        customerName: lookupName.customer(c.customerId),
        chequeNo: c.chequeNo ?? c.reference,
        bankName: c.bankName ?? '—',
        maturity: c.chequeDate ?? c.date,
        amount: c.amount,
        pdcStatus:
          c.status === 'Bounced'
            ? ('Bounced' as const)
            : (c.pdcStatus ?? (c.status === 'PDC pending' ? 'Pending' : 'Cleared')),
        bounceReason: c.bounceReason,
        isPostDated: c.method === 'PDC',
      }))
      .sort((a, b) => a.maturity.localeCompare(b.maturity));
    const issued: IssuedCheque[] = db.vendorPayments
      .filter((p) => (p.method === 'PDC' || p.method === 'Cheque') && p.status !== 'Cancelled')
      .filter((p) => p.status !== 'Pending approval')
      .map((p) => ({
        id: p.id,
        number: p.number,
        vendorName: lookupName.vendor(p.vendorId),
        chequeNo: p.chequeNo ?? p.reference,
        maturity: p.chequeDate ?? p.date,
        amount: p.amount,
        pdcStatus: p.status === 'PDC issued' ? ('Pending' as const) : (p.pdcStatus ?? 'Cleared'),
        status: p.status,
      }))
      .sort((a, b) => a.maturity.localeCompare(b.maturity));
    return latency({ received, issued });
  },
  /** A6: overdue invoices by ageing bucket, with the next reminder level and credit-hold flags. */
  followUp(): Promise<FollowUp> {
    const rows: FollowUpRow[] = [];
    for (const r of allOpenInvoices()) {
      const days = Math.max(0, daysBetween(r.dueDate, PROTO_TODAY));
      const bucket = ageingBucket(days);
      if (!bucket) continue;
      rows.push({
        id: r.id,
        number: r.number,
        customerId: r.customerId,
        customerName: r.customerName,
        dueDate: r.dueDate,
        daysOverdue: days,
        bucket,
        outstandingAed: r.outstandingAed,
        outstanding: r.outstanding,
        currency: r.currencyCode,
        lastReminder: r.reminders?.at(-1),
        remindersSent: r.reminders?.length ?? 0,
        nextLevel: nextReminderLevel(r.reminders),
        writeOffPending: r.writeOff?.status === 'Pending',
        canWriteOff: r.status === 'Overdue',
      });
    }
    rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
    const holds = creditHoldSuggestions(rows);
    const customers = protoDb.get().customers;
    return latency({
      rows,
      creditHold: [...holds.entries()].map(([customerId, v]) => ({
        customerId,
        customerName: lookupName.customer(customerId),
        maxDays: v.maxDays,
        overdue: v.overdue,
        status: customers.find((c) => c.id === customerId)?.status ?? 'Active',
      })),
    });
  },
};

export interface ReceivedCheque {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  chequeNo: string;
  bankName: string;
  maturity: string;
  amount: number;
  pdcStatus: PdcStatus;
  bounceReason?: string;
  isPostDated: boolean;
}

export interface IssuedCheque {
  id: string;
  number: string;
  vendorName: string;
  chequeNo: string;
  maturity: string;
  amount: number;
  pdcStatus: PdcStatus;
  status: VendorPayment['status'];
}

export interface PdcRegister {
  received: ReceivedCheque[];
  issued: IssuedCheque[];
}

export interface FollowUpRow {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  dueDate: string;
  daysOverdue: number;
  bucket: AgeingBucket;
  outstandingAed: number;
  outstanding: number;
  currency: string;
  lastReminder?: { level: 1 | 2 | 3; at: string; channel: 'Email' | 'WhatsApp' | 'Letter' };
  remindersSent: number;
  nextLevel: 1 | 2 | 3;
  writeOffPending: boolean;
  canWriteOff: boolean;
}

export interface FollowUp {
  rows: FollowUpRow[];
  creditHold: {
    customerId: string;
    customerName: string;
    maxDays: number;
    overdue: number;
    status: string;
  }[];
}

export function usePdcRegister() {
  return useQuery({ queryKey: ['collections', 'pdc'], queryFn: () => collectionsApi.pdcRegister() });
}

export function useFollowUp() {
  return useQuery({ queryKey: ['collections', 'follow-up'], queryFn: () => collectionsApi.followUp() });
}

export type ChequeAction =
  | { kind: 'deposit' | 'clear' | 'clear-issued'; id: string }
  | { kind: 'bounce'; id: string; reason: string; charge: number };

export function useChequeAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: ChequeAction): Promise<{ chargeInvoice?: string }> => {
      if (a.kind === 'bounce') return collectionsApi.bounceCheque(a.id, a.reason, a.charge);
      if (a.kind === 'deposit') await collectionsApi.depositCheque(a.id);
      else if (a.kind === 'clear') await collectionsApi.clearPdc(a.id);
      else await paymentsApi.presentPdc(a.id);
      return {};
    },
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useCollections(params: ListParams) {
  return useQuery({
    queryKey: ['collections', 'list', params],
    queryFn: () => collectionsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useOpenInvoices(customerId: string | undefined) {
  return useQuery({
    queryKey: ['collections', 'open-invoices', customerId],
    queryFn: () => collectionsApi.openInvoices(customerId!),
    enabled: !!customerId,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: collectionsApi.create, onSuccess: () => invalidateFinance(qc) });
}

export function useClearPdc() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: collectionsApi.clearPdc, onSuccess: () => invalidateFinance(qc) });
}

export function useCustomerBalance(customerId: string | undefined) {
  return useQuery({
    queryKey: ['collections', 'balance', customerId],
    queryFn: () => collectionsApi.balance(customerId!),
    enabled: !!customerId,
  });
}

export function useApplyAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, invoiceId, amount }: { id: string; invoiceId: string; amount: number }) =>
      collectionsApi.applyAdvance(id, invoiceId, amount),
    onSuccess: () => {
      invalidateFinance(qc);
      void qc.invalidateQueries({ queryKey: ['sales-orders'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
