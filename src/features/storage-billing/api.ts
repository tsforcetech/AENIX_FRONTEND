import { nextDocNumber } from '@/domain/numbering';
import type { StorageBasis } from '@/domain/types';

/** UOM printed on the tax invoice for each storage basis. */
export const basisUom: Record<StorageBasis, string> = {
  'Sq.ft per period': 'Sq.ft',
  'Pallet-day': 'Pallet-day',
  'CBM-day': 'CBM-day',
};

/** 1-Oct-26 style, as on the owner's invoices. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}-${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}-${String(d.getUTCFullYear()).slice(-2)}`;
}
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Invoice, StorageBillingRun } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { storageCharge, type StorageCharge } from './charge';

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
  /** FLOW-003 W13 */
  minimumApplied: boolean;
}

export interface GenerateRunInput {
  customerId: string;
  month: string; // YYYY-MM
  ratePerPalletDay: number;
  palletDays: number;
  /** Charging basis; quantity and rate are in this basis' units. */
  basis: StorageBasis;
  /** FLOW-003 W13: free days (day-based bases) and minimum charge for the period (AED). */
  freeDays?: number;
  minimumCharge?: number;
}

/** FLOW-003 W13: storage terms of the customer's active contract (defaults for a run). */
export interface StorageTerms {
  contractNumber?: string;
  minimumCharge?: number;
  freeDays?: number;
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

/** Run charge: `palletDays` is the chargeable quantity (free days already removed); minimum applies. */
export function runCharge(r: StorageBillingRun): StorageCharge {
  return storageCharge({
    basis: r.basis ?? 'Pallet-day',
    quantity: r.palletDays,
    rate: r.ratePerPalletDay,
    daysInPeriod: daysInMonth(r.periodFrom.slice(0, 7)),
    minimumCharge: r.minimumCharge,
  });
}

const amountOf = (r: StorageBillingRun) => runCharge(r).amount;

function toRow(r: StorageBillingRun): StorageRunRow {
  return {
    ...r,
    customerName: lookupName.customer(r.customerId),
    amount: amountOf(r),
    minimumApplied: runCharge(r).minimumApplied,
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

  /** W13: minimum monthly storage and free days from the customer's active contract, if any. */
  storageTerms(customerId: string): StorageTerms {
    const c = protoDb
      .get()
      .contracts.find(
        (x) =>
          x.customerId === customerId &&
          (x.status === 'Active' || x.status === 'Expiring') &&
          (x.minimumMonthlyStorage !== undefined || x.storageFreeDays !== undefined),
      );
    return c
      ? { contractNumber: c.number, minimumCharge: c.minimumMonthlyStorage, freeDays: c.storageFreeDays }
      : {};
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
    if ((input.freeDays ?? 0) < 0 || (input.minimumCharge ?? 0) < 0)
      return Promise.reject(new Error('Free days and minimum charge cannot be negative'));
    const charge = storageCharge({
      basis: input.basis,
      quantity: input.palletDays,
      rate: input.ratePerPalletDay,
      daysInPeriod: daysInMonth(input.month),
      freeDays: input.freeDays,
    });
    const customerNo = input.customerId.replace(/\D/g, '').padStart(2, '0');
    const run: StorageBillingRun = {
      id: newId('sbr'),
      number: `SBR-${input.month}-${customerNo}`,
      customerId: input.customerId,
      periodFrom,
      periodTo,
      basis: input.basis,
      palletDays: charge.chargeableQty,
      ratePerPalletDay: input.ratePerPalletDay,
      status: 'Draft',
      minimumCharge: input.minimumCharge || undefined,
      freeDays: input.freeDays || undefined,
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
    const terms = db.customers.find((c) => c.id === run.customerId)?.paymentTermsDays ?? 30;
    const due = new Date(Date.parse(`${TODAY}T00:00:00Z`) + terms * 86_400_000).toISOString().slice(0, 10);
    const invoice: Invoice = {
      id: newId('inv'),
      number: nextDocNumber(
        db.invoices.map((i) => i.number),
        db.company.invoicePrefix,
      ),
      customerId: run.customerId,
      storageRunId: run.id,
      issueDate: TODAY,
      dueDate: due,
      lines: [
        {
          id: newId('il'),
          uom: basisUom[run.basis ?? 'Pallet-day'],
          description: `${run.basis === 'Sq.ft per period' ? 'Dry Storage' : 'Storage'} (${shortDate(run.periodFrom)} to ${shortDate(run.periodTo)})`,
          quantity: run.palletDays,
          unitPrice: run.ratePerPalletDay,
          vatRate: 0.05,
        },
        // FLOW-003 W13: top-up to the contract's minimum monthly storage charge.
        ...(runCharge(run).minimumApplied
          ? [
              {
                id: newId('il'),
                uom: 'Lump sum',
                description: `Minimum monthly storage charge top-up (minimum ${run.minimumCharge})`,
                quantity: 1,
                unitPrice: runCharge(run).topUp,
                vatRate: 0.05,
              },
            ]
          : []),
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
