import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assertOpenPeriod } from '@/domain/controls';
import type { PaymentMethod, Vendor, VendorPayment } from '@/domain/types';
import { approvalFor, approvalNeeded, onApprovalDecided, requestApproval } from '@/shared/data/approvals';
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
 * A11: a voucher at or above the 'Payment voucher' approval rule waits for approval before it posts.
 */
export interface PaymentRow extends VendorPayment {
  vendorName: string;
  billNumbers: string[];
  allocated: number;
}

export interface PaymentDetail extends PaymentRow {
  vendor: Pick<Vendor, 'id' | 'name' | 'code' | 'city' | 'country' | 'contactName' | 'contactEmail'>;
  bills: { id: string; number: string; vendorRef: string; amount: number }[];
}

export interface PaymentInput {
  vendorId: string;
  date: string;
  method: PaymentMethod;
  reference: string;
  chequeDate?: string;
  chequeNo?: string;
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

/** Settles the bills and posts the voucher (Dr AP / Cr Bank, or Cr 2150 for a PDC). */
function release(pv: VendorPayment): VendorPayment {
  assertOpenPeriod(protoDb.get().company, PROTO_TODAY);
  const open = openBillsForVendor(pv.vendorId);
  for (const a of pv.allocations) {
    const b = open.find((x) => x.id === a.billId);
    if (!b || a.amount > b.outstanding + 0.005)
      throw new Error('An allocation exceeds the bill outstanding — the bill may have been paid meanwhile');
  }
  const isPdc = pv.method === 'PDC';
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
  pv.allocations.forEach((a) => applyPaymentToBill(a.billId, a.amount));
  const posted: VendorPayment = {
    ...pv,
    status: isPdc ? 'PDC issued' : 'Posted',
    ...(isPdc ? { pdcStatus: 'Pending' as const } : {}),
  };
  protoDb.update((s) => ({
    ...s,
    vendorPayments: s.vendorPayments.map((p) => (p.id === pv.id ? posted : p)),
  }));
  return posted;
}

onApprovalDecided('Payment voucher', (req) => {
  const pv = protoDb.get().vendorPayments.find((p) => p.id === req.entityId);
  if (!pv || pv.status !== 'Pending approval') return;
  protoDb.update((s) => ({
    ...s,
    vendorPayments: s.vendorPayments.map((p) => (p.id === pv.id ? { ...p, approval: req.record } : p)),
  }));
  if (req.record.status === 'Approved') {
    try {
      release({ ...pv, approval: req.record });
      logActivity({
        entity: 'Payment',
        entityId: pv.id,
        entityRef: pv.number,
        action: 'released after approval',
      });
    } catch (e) {
      logActivity({
        entity: 'Payment',
        entityId: pv.id,
        entityRef: pv.number,
        action: `approved but not posted: ${e instanceof Error ? e.message : 'error'}`,
      });
    }
  } else {
    protoDb.update((s) => ({
      ...s,
      vendorPayments: s.vendorPayments.map((p) =>
        p.id === pv.id ? { ...p, status: 'Cancelled' as const } : p,
      ),
    }));
    logActivity({
      entity: 'Payment',
      entityId: pv.id,
      entityRef: pv.number,
      action: 'rejected — voucher cancelled',
    });
  }
});

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
  get(id: string): Promise<PaymentDetail> {
    const db = protoDb.get();
    const p = db.vendorPayments.find((x) => x.id === id);
    const v = p ? db.vendors.find((x) => x.id === p.vendorId) : undefined;
    if (!p || !v) return Promise.reject(new Error('Not found'));
    const approval = p.approval ?? approvalFor(p.id, 'Payment voucher')?.record;
    return latency({
      ...toRow(p),
      approval,
      vendor: {
        id: v.id,
        name: v.name,
        code: v.code,
        city: v.city,
        country: v.country,
        contactName: v.contactName,
        contactEmail: v.contactEmail,
      },
      bills: p.allocations.map((a) => {
        const b = db.vendorBills.find((x) => x.id === a.billId);
        return {
          id: a.billId,
          number: b?.number ?? a.billId,
          vendorRef: b?.vendorRef ?? '',
          amount: a.amount,
        };
      }),
    });
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
    try {
      assertOpenPeriod(db.company, PROTO_TODAY);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Period locked'));
    }
    const next = Math.max(3299, ...db.vendorPayments.map((p) => Number(p.number.split('-')[1]) || 0)) + 1;
    const isCheque = input.method === 'PDC' || input.method === 'Cheque';
    const draft: VendorPayment = {
      id: newId('pv'),
      number: `PV-${next}`,
      vendorId: input.vendorId,
      date: input.date,
      method: input.method,
      amount: round2(input.amount),
      reference: input.reference,
      chequeDate: input.chequeDate,
      allocations,
      status: 'Pending approval',
      ...(isCheque && input.chequeNo?.trim() ? { chequeNo: input.chequeNo.trim() } : {}),
    };
    const rule = approvalNeeded('Payment voucher', draft.amount);
    protoDb.update((s) => ({ ...s, vendorPayments: [draft, ...s.vendorPayments] }));
    if (rule) {
      const record = requestApproval({
        docType: 'Payment voucher',
        rule,
        entity: 'Payment',
        entityId: draft.id,
        entityRef: draft.number,
        summary: `Payment to ${lookupName.vendor(draft.vendorId)} — ${draft.method}`,
        amount: draft.amount,
        href: `/payments/${draft.id}`,
      });
      protoDb.update((s) => ({
        ...s,
        vendorPayments: s.vendorPayments.map((p) => (p.id === draft.id ? { ...p, approval: record } : p)),
      }));
      logActivity({
        entity: 'Payment',
        entityId: draft.id,
        entityRef: draft.number,
        action: 'created a payment voucher pending approval',
      });
      return latency({ ...draft, approval: record }, 300);
    }
    let posted: VendorPayment;
    try {
      posted = release(draft);
    } catch (e) {
      protoDb.update((s) => ({ ...s, vendorPayments: s.vendorPayments.filter((p) => p.id !== draft.id) }));
      return Promise.reject(e instanceof Error ? e : new Error('Could not post the payment'));
    }
    logActivity({
      entity: 'Payment',
      entityId: posted.id,
      entityRef: posted.number,
      action: posted.status === 'PDC issued' ? 'issued a PDC to a vendor' : 'paid a vendor',
    });
    return latency(posted, 300);
  },
  /** PDC presented: Dr 2150 PDC issued / Cr Bank. */
  presentPdc(id: string): Promise<void> {
    const pv = protoDb.get().vendorPayments.find((p) => p.id === id);
    if (!pv || pv.status !== 'PDC issued')
      return Promise.reject(new Error('Only issued PDCs can be presented'));
    try {
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
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Could not post'));
    }
    protoDb.update((s) => ({
      ...s,
      vendorPayments: s.vendorPayments.map((p) =>
        p.id === id ? { ...p, status: 'Posted' as const, pdcStatus: 'Cleared' as const } : p,
      ),
    }));
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

export function usePayment(id: string) {
  return useQuery({ queryKey: ['payments', 'detail', id], queryFn: () => paymentsApi.get(id) });
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
