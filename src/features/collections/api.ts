import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerBalance, type CustomerBalance } from '@/domain/balances';
import type { Collection, PaymentMethod } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { ACCOUNTS, postJournal } from '@/features/accounting/ledger';
import {
  applyPaymentToInvoice,
  invalidateFinance,
  openInvoicesForCustomer,
  type InvoiceRow,
} from '@/features/invoices/api';

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

/**
 * Applies invoice allocations and posts the cash (used on save and on PDC clearance).
 * Invoice part (and any unallocated remainder, held on account) → Cr AR.
 * Sales-order advance part → Cr 2300 Customer advances (moved to AR when applied to an invoice).
 */
function settle(col: Collection): void {
  const advance = round2(
    col.allocations.filter((a) => a.salesOrderId && !a.invoiceId).reduce((s, a) => s + a.amount, 0),
  );
  col.allocations.forEach((a) => {
    if (a.invoiceId) applyPaymentToInvoice(a.invoiceId, a.amount);
  });
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
}

export const collectionsApi = {
  list(params: ListParams): Promise<Page<CollectionRow>> {
    const rows = [...protoDb.get().collections].sort((a, b) => b.number.localeCompare(a.number)).map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.customerName} ${r.reference} ${r.invoiceNumbers.join(' ')}`,
        status: (r) => r.status,
      }),
    );
  },
  openInvoices(customerId: string): Promise<InvoiceRow[]> {
    return latency(openInvoicesForCustomer(customerId), 80);
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
    const inv = openInvoicesForCustomer(col?.customerId ?? '').find((i) => i.id === invoiceId);
    if (!col || !inv) return Promise.reject(new Error('Receipt or open invoice not found'));
    const held = round2(
      col.allocations.filter((a) => a.salesOrderId && !a.invoiceId).reduce((s, a) => s + a.amount, 0),
    );
    const amt = round2(amount);
    if (amt <= 0 || amt > held + 0.005 || amt > inv.outstanding + 0.005)
      return Promise.reject(new Error('Amount exceeds the advance held or the invoice outstanding'));
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
    const updated: Collection = { ...col, allocations, status: statusFor(col.amount, allocations) };
    protoDb.update((s) => ({
      ...s,
      collections: s.collections.map((c) => (c.id === collectionId ? updated : c)),
    }));
    applyPaymentToInvoice(invoiceId, amt);
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
    };
    protoDb.update((s) => ({ ...s, collections: [col, ...s.collections] }));
    // A post-dated cheque is held: no invoice update or bank posting until it clears.
    if (!isPdc) settle(col);
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
  clearPdc(id: string): Promise<void> {
    const col = protoDb.get().collections.find((c) => c.id === id);
    if (!col || col.status !== 'PDC pending')
      return Promise.reject(new Error('Only pending PDCs can be cleared'));
    // If no allocation was planned, allocate oldest-first now.
    let allocations = col.allocations;
    if (allocations.length === 0) {
      let left = col.amount;
      allocations = [];
      for (const inv of openInvoicesForCustomer(col.customerId)) {
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
    };
    protoDb.update((s) => ({ ...s, collections: s.collections.map((c) => (c.id === id ? cleared : c)) }));
    settle(cleared);
    logActivity({ entity: 'Collection', entityId: id, entityRef: col.number, action: 'cleared the PDC' });
    return latency(undefined, 300);
  },
};

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
