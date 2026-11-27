import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethod, VendorPayment } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { ACCOUNTS, postJournal } from '@/features/accounting/ledger';
import { invalidateFinance } from '@/features/invoices/api';
import { applyPaymentToBill, openBillsForVendor, type VendorBillRow } from '@/features/vendor-bills/api';

/**
 * Payment vouchers (money paid to vendors). PROTOTYPE ADAPTER — replace `paymentsApi` bodies with
 * the generated client once the Billing/Finance contract exists. Over-payment is re-validated server-side.
 */
export interface PaymentRow extends VendorPayment {
  vendorName: string;
  billNumbers: string[];
  allocated: number;
}

export interface PaymentInput {
  vendorId: string;
  date: string;
  method: PaymentMethod;
  reference: string;
  chequeDate?: string;
  amount: number;
  allocations: { billId: string; amount: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toRow(p: VendorPayment): PaymentRow {
  const bills = protoDb.get().vendorBills;
  return {
    ...p,
    vendorName: lookupName.vendor(p.vendorId),
    billNumbers: p.allocations.map((a) => bills.find((b) => b.id === a.billId)?.number ?? a.billId),
    allocated: round2(p.allocations.reduce((s, a) => s + a.amount, 0)),
  };
}

export const paymentsApi = {
  list(params: ListParams): Promise<Page<PaymentRow>> {
    const rows = [...protoDb.get().vendorPayments]
      .sort((a, b) => b.number.localeCompare(a.number))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.vendorName} ${r.reference} ${r.billNumbers.join(' ')}`,
        status: (r) => r.status,
      }),
    );
  },
  openBills(vendorId: string): Promise<VendorBillRow[]> {
    return latency(openBillsForVendor(vendorId), 80);
  },
  billVendor(billId: string): string | undefined {
    return protoDb.get().vendorBills.find((b) => b.id === billId)?.vendorId;
  },
  /** Pays vendor bills. A PDC issued settles the bills against 2150 until the cheque is presented. */
  create(input: PaymentInput): Promise<VendorPayment> {
    const allocations = input.allocations
      .filter((a) => a.amount > 0)
      .map((a) => ({ ...a, amount: round2(a.amount) }));
    const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
    if (!allocations.length) return Promise.reject(new Error('Allocate the payment to at least one bill'));
    if (Math.abs(allocated - input.amount) > 0.005)
      return Promise.reject(new Error('The payment amount must equal the amount allocated to bills'));
    const open = openBillsForVendor(input.vendorId);
    for (const a of allocations) {
      const b = open.find((x) => x.id === a.billId);
      if (!b || a.amount > b.outstanding + 0.005)
        return Promise.reject(new Error('An allocation exceeds the bill outstanding'));
    }
    const db = protoDb.get();
    const next = Math.max(3299, ...db.vendorPayments.map((p) => Number(p.number.split('-')[1]) || 0)) + 1;
    const isPdc = input.method === 'PDC';
    const pv: VendorPayment = {
      id: newId('pv'),
      number: `PV-${next}`,
      vendorId: input.vendorId,
      date: input.date,
      method: input.method,
      amount: round2(input.amount),
      reference: input.reference,
      chequeDate: input.chequeDate,
      allocations,
      status: isPdc ? 'PDC issued' : 'Posted',
    };
    protoDb.update((s) => ({ ...s, vendorPayments: [pv, ...s.vendorPayments] }));
    allocations.forEach((a) => applyPaymentToBill(a.billId, a.amount));
    postJournal({
      date: PROTO_TODAY,
      source: 'Payment',
      reference: pv.number,
      memo: `Payment ${pv.number} to ${lookupName.vendor(pv.vendorId)} — ${pv.method}`,
      lines: [
        { account: ACCOUNTS.ap, debit: pv.amount, credit: 0 },
        { account: isPdc ? ACCOUNTS.pdcIssued : ACCOUNTS.bank, debit: 0, credit: pv.amount },
      ],
    });
    logActivity({
      entity: 'Payment',
      entityId: pv.id,
      entityRef: pv.number,
      action: isPdc ? 'issued a PDC to a vendor' : 'paid a vendor',
    });
    return latency(pv, 300);
  },
  /** PDC presented: Dr 2150 PDC issued / Cr Bank. */
  presentPdc(id: string): Promise<void> {
    const pv = protoDb.get().vendorPayments.find((p) => p.id === id);
    if (!pv || pv.status !== 'PDC issued')
      return Promise.reject(new Error('Only issued PDCs can be presented'));
    protoDb.update((s) => ({
      ...s,
      vendorPayments: s.vendorPayments.map((p) => (p.id === id ? { ...p, status: 'Posted' as const } : p)),
    }));
    postJournal({
      date: PROTO_TODAY,
      source: 'Payment',
      reference: pv.number,
      memo: `PDC ${pv.number} presented and cleared`,
      lines: [
        { account: ACCOUNTS.pdcIssued, debit: pv.amount, credit: 0 },
        { account: ACCOUNTS.bank, debit: 0, credit: pv.amount },
      ],
    });
    logActivity({ entity: 'Payment', entityId: id, entityRef: pv.number, action: 'cleared the issued PDC' });
    return latency(undefined, 250);
  },
};

export function usePayments(params: ListParams) {
  return useQuery({
    queryKey: ['payments', 'list', params],
    queryFn: () => paymentsApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useVendorOpenBills(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'open-bills', vendorId],
    queryFn: () => paymentsApi.openBills(vendorId!),
    enabled: !!vendorId,
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: paymentsApi.create, onSuccess: () => invalidateFinance(qc) });
}

export function usePresentPdc() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: paymentsApi.presentPdc, onSuccess: () => invalidateFinance(qc) });
}
