import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billTotals, daysBetween } from '@/domain/calc';
import type { VendorBill } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, protoDb } from '@/prototype/store';
import { ACCOUNTS, postJournal } from '@/features/accounting/ledger';
import { invalidateFinance } from '@/features/invoices/api';

/**
 * Vendor bills (AP) data source. PROTOTYPE ADAPTER — replace `vendorBillsApi` bodies with the
 * generated OpenAPI client once the Billing (Phase 7) contract is published.
 */
export interface VendorBillRow extends VendorBill {
  vendorName: string;
  vendorCategory: string;
  workOrderNumber?: string;
  total: number;
  outstanding: number;
  daysOverdue: number;
  /** Agreed vendor cost on the linked work order (job-cost match). */
  agreedCost?: number;
  variance?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Overdue is derived from the due date for open bills. */
function effectiveStatus(b: VendorBill): VendorBill['status'] {
  if ((b.status === 'Approved' || b.status === 'Partially paid') && b.dueDate < PROTO_TODAY) return 'Overdue';
  return b.status;
}

function toRow(b: VendorBill): VendorBillRow {
  const db = protoDb.get();
  const vendor = db.vendors.find((v) => v.id === b.vendorId);
  const wo = b.workOrderId ? db.workOrders.find((w) => w.id === b.workOrderId) : undefined;
  const agreed = wo
    ? wo.vendorAssignments.filter((a) => a.vendorId === b.vendorId).reduce((s, a) => s + a.agreedCost, 0)
    : undefined;
  const status = effectiveStatus(b);
  return {
    ...b,
    status,
    vendorName: vendor?.name ?? lookupName.vendor(b.vendorId),
    vendorCategory: vendor?.category ?? '',
    workOrderNumber: wo?.number,
    ...billTotals(b),
    daysOverdue: status === 'Overdue' ? daysBetween(b.dueDate, PROTO_TODAY) : 0,
    agreedCost: agreed,
    variance: agreed !== undefined ? round2(b.amount - agreed) : undefined,
  };
}

export const vendorBillsApi = {
  list(params: ListParams): Promise<Page<VendorBillRow>> {
    const rows = [...protoDb.get().vendorBills].sort((a, b) => b.number.localeCompare(a.number)).map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.vendorRef} ${r.vendorName} ${r.workOrderNumber ?? ''}`,
        status: (r) => r.status,
      }),
    );
  },
  get(id: string): Promise<VendorBillRow> {
    const b = protoDb.get().vendorBills.find((x) => x.id === id);
    return b ? latency(toRow(b)) : Promise.reject(new Error('Not found'));
  },
  /** Draft → Approved: recognises the cost and the AP liability. */
  approve(id: string): Promise<void> {
    const b = protoDb.get().vendorBills.find((x) => x.id === id);
    if (!b || b.status !== 'Draft') return Promise.reject(new Error('Only draft bills can be approved'));
    protoDb.update((s) => ({
      ...s,
      vendorBills: s.vendorBills.map((x) => (x.id === id ? { ...x, status: 'Approved' as const } : x)),
    }));
    const { total } = billTotals(b);
    postJournal({
      date: PROTO_TODAY,
      source: 'Vendor bill',
      reference: b.number,
      memo: `Vendor bill ${b.vendorRef} — ${lookupName.vendor(b.vendorId)}`,
      lines: [
        { account: ACCOUNTS.costOfSales, debit: b.amount, credit: 0 },
        { account: ACCOUNTS.vatIn, debit: b.vat, credit: 0 },
        { account: ACCOUNTS.ap, debit: 0, credit: total },
      ],
    });
    logActivity({
      entity: 'Vendor bill',
      entityId: id,
      entityRef: b.number,
      action: 'approved the vendor bill',
    });
    return latency(undefined, 250);
  },
  recordPayment(id: string, amount: number): Promise<void> {
    const b = protoDb.get().vendorBills.find((x) => x.id === id);
    if (!b || b.status === 'Draft' || b.status === 'Paid')
      return Promise.reject(new Error('Bill is not payable'));
    const { outstanding } = billTotals(b);
    if (amount <= 0 || amount > outstanding + 0.005)
      return Promise.reject(new Error('Payment exceeds the outstanding amount'));
    const paid = round2(b.paid + amount);
    const status: VendorBill['status'] = paid >= billTotals(b).total - 0.005 ? 'Paid' : 'Partially paid';
    protoDb.update((s) => ({
      ...s,
      vendorBills: s.vendorBills.map((x) => (x.id === id ? { ...x, paid, status } : x)),
    }));
    postJournal({
      date: PROTO_TODAY,
      source: 'Vendor bill',
      reference: b.number,
      memo: `Payment to ${lookupName.vendor(b.vendorId)} for ${b.vendorRef}`,
      lines: [
        { account: ACCOUNTS.ap, debit: round2(amount), credit: 0 },
        { account: ACCOUNTS.bank, debit: 0, credit: round2(amount) },
      ],
    });
    logActivity({
      entity: 'Vendor bill',
      entityId: id,
      entityRef: b.number,
      action: status === 'Paid' ? 'paid the vendor bill' : 'part-paid the vendor bill',
    });
    return latency(undefined, 250);
  },
};

export function useVendorBills(params: ListParams) {
  return useQuery({
    queryKey: ['vendor-bills', 'list', params],
    queryFn: () => vendorBillsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useVendorBill(id: string) {
  return useQuery({ queryKey: ['vendor-bills', 'detail', id], queryFn: () => vendorBillsApi.get(id) });
}

export function useApproveBill() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: vendorBillsApi.approve, onSuccess: () => invalidateFinance(qc) });
}

export function useRecordBillPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => vendorBillsApi.recordPayment(id, amount),
    onSuccess: () => invalidateFinance(qc),
  });
}
