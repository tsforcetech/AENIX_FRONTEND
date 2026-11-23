import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invoice, StorageBillingRun } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';

/**
 * Storage billing data source (independent of transport jobs). PROTOTYPE ADAPTER — replace with
 * the generated OpenAPI client when the StorageBilling (Phase 6) contract is published.
 * Invariant mirrored from the backend: one run per customer per billing period.
 */
const TODAY = '2026-11-23';

export interface StorageRunRow extends StorageBillingRun {
  customerName: string;
  amount: number;
  invoiceNumber?: string;
}

export interface GenerateRunInput {
  customerId: string;
  month: string; // YYYY-MM
  ratePerPalletDay: number;
  palletDays: number;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-AE', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

const amountOf = (r: StorageBillingRun) => Math.round(r.palletDays * r.ratePerPalletDay * 100) / 100;

function toRow(r: StorageBillingRun): StorageRunRow {
  return {
    ...r,
    customerName: lookupName.customer(r.customerId),
    amount: amountOf(r),
    invoiceNumber: r.invoiceId ? protoDb.get().invoices.find((i) => i.id === r.invoiceId)?.number : undefined,
  };
}

export const storageBillingApi = {
  list(params: ListParams): Promise<Page<StorageRunRow>> {
    const rows = [...protoDb.get().storageRuns]
      .sort((a, b) => b.periodFrom.localeCompare(a.periodFrom) || a.number.localeCompare(b.number))
      .map(toRow);
    return latency(
      paginate(rows, params, { searchText: (r) => `${r.number} ${r.customerName}`, status: (r) => r.status }),
    );
  },

  /** Suggested pallet-days: the customer's current pallets × days in the period. */
  suggestPalletDays(customerId: string, month: string): number {
    const pallets = protoDb
      .get()
      .stockItems.filter((s) => s.customerId === customerId)
      .reduce((s, i) => s + i.pallets, 0);
    return pallets * daysInMonth(month);
  },

  generate(input: GenerateRunInput): Promise<StorageBillingRun> {
    const db = protoDb.get();
    const periodFrom = `${input.month}-01`;
    const periodTo = `${input.month}-${String(daysInMonth(input.month)).padStart(2, '0')}`;
    if (db.storageRuns.some((r) => r.customerId === input.customerId && r.periodFrom === periodFrom)) {
      return Promise.reject(
        new Error(
          `A storage run for ${lookupName.customer(input.customerId)} in ${monthLabel(input.month)} already exists.`,
        ),
      );
    }
    const customerNo = input.customerId.replace(/\D/g, '').padStart(2, '0');
    const run: StorageBillingRun = {
      id: newId('sbr'),
      number: `SBR-${input.month}-${customerNo}`,
      customerId: input.customerId,
      periodFrom,
      periodTo,
      palletDays: input.palletDays,
      ratePerPalletDay: input.ratePerPalletDay,
      status: 'Draft',
    };
    protoDb.update((s) => ({ ...s, storageRuns: [run, ...s.storageRuns] }));
    logActivity({
      entity: 'Warehouse',
      entityId: run.id,
      entityRef: run.number,
      action: 'generated a storage billing run',
    });
    return latency(run, 250);
  },

  createInvoice(runId: string): Promise<Invoice> {
    const db = protoDb.get();
    const run = db.storageRuns.find((r) => r.id === runId);
    if (!run) return Promise.reject(new Error('Run not found'));
    if (run.status === 'Invoiced' || run.invoiceId)
      return Promise.reject(new Error('This run is already invoiced'));
    const next = Math.max(...db.invoices.map((i) => Number(i.number.split('-')[1]))) + 1;
    const terms = db.customers.find((c) => c.id === run.customerId)?.paymentTermsDays ?? 30;
    const due = new Date(Date.parse(`${TODAY}T00:00:00Z`) + terms * 86_400_000).toISOString().slice(0, 10);
    const invoice: Invoice = {
      id: newId('inv'),
      number: `INV-${next}`,
      customerId: run.customerId,
      storageRunId: run.id,
      issueDate: TODAY,
      dueDate: due,
      lines: [
        {
          id: newId('il'),
          description: `Storage ${monthLabel(run.periodFrom.slice(0, 7))} — ${run.palletDays.toLocaleString('en-AE')} pallet-days`,
          quantity: run.palletDays,
          unitPrice: run.ratePerPalletDay,
          vatRate: 0.05,
        },
      ],
      paid: 0,
      status: 'Draft',
    };
    protoDb.update((s) => ({
      ...s,
      invoices: [invoice, ...s.invoices],
      storageRuns: s.storageRuns.map((r) =>
        r.id === runId ? { ...r, status: 'Invoiced', invoiceId: invoice.id } : r,
      ),
    }));
    logActivity({
      entity: 'Invoice',
      entityId: invoice.id,
      entityRef: invoice.number,
      action: `drafted a storage invoice for ${run.number}`,
    });
    return latency(invoice, 300);
  },
};

export function useStorageRuns(params: ListParams) {
  return useQuery({
    queryKey: ['storage-billing', 'list', params],
    queryFn: () => storageBillingApi.list(params),
    placeholderData: (p) => p,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['storage-billing'] });
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
  };
}

export function useGenerateRun() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: storageBillingApi.generate, onSuccess: invalidate });
}

export function useInvoiceRun() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: storageBillingApi.createInvoice, onSuccess: invalidate });
}
