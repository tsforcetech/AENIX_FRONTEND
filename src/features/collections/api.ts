import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
}

export interface CollectionInput {
  customerId: string;
  date: string;
  method: PaymentMethod;
  reference: string;
  chequeDate?: string;
  amount: number;
  allocations: { invoiceId: string; amount: number }[];
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
    invoiceNumbers: c.allocations.map(
      (a) => invoices.find((i) => i.id === a.invoiceId)?.number ?? a.invoiceId,
    ),
  };
}

function nextNumber(): string {
  const n = Math.max(4400, ...protoDb.get().collections.map((c) => Number(c.number.split('-')[1]) || 0)) + 1;
  return `RCPT-${n}`;
}

/** Applies allocations to invoices and posts cash to AR (used on save and on PDC clearance). */
function settle(col: Collection): void {
  col.allocations.forEach((a) => applyPaymentToInvoice(a.invoiceId, a.amount));
  postJournal({
    date: PROTO_TODAY,
    source: 'Collection',
    reference: col.number,
    memo: `Receipt ${col.number} — ${col.method}`,
    lines: [
      { account: ACCOUNTS.bank, debit: col.amount, credit: 0 },
      { account: ACCOUNTS.ar, debit: 0, credit: col.amount },
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
      status: isPdc ? 'PDC pending' : allocated >= input.amount - 0.005 ? 'Allocated' : 'Unallocated',
    };
    protoDb.update((s) => ({ ...s, collections: [col, ...s.collections] }));
    // A post-dated cheque is held: no invoice update or bank posting until it clears.
    if (!isPdc) settle(col);
    logActivity({
      entity: 'Collection',
      entityId: col.id,
      entityRef: col.number,
      action: isPdc ? 'received a PDC' : 'recorded a receipt',
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
    const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
    const cleared: Collection = {
      ...col,
      allocations,
      status: allocated >= col.amount - 0.005 ? 'Allocated' : 'Unallocated',
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
