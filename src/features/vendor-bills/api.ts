import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billTotals, daysBetween } from '@/domain/calc';
import type {
  PurchaseOrder,
  ServiceCategory,
  TransportMode,
  VendorBill,
  WorkOrder,
  WorkOrderStatus,
} from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { ACCOUNTS, postJournal } from '@/features/accounting/ledger';
import { invalidateFinance } from '@/features/invoices/api';

/**
 * Purchase invoices (vendor bills, AP) data source. PROTOTYPE ADAPTER — replace `vendorBillsApi` bodies with the
 * generated OpenAPI client once the Billing (Phase 7) contract is published.
 */
export interface VendorBillRow extends VendorBill {
  vendorName: string;
  vendorCategory: string;
  workOrderNumber?: string;
  jobCategory?: ServiceCategory;
  jobMode?: TransportMode;
  jobStatus?: WorkOrderStatus;
  /** Draft created automatically when the linked job was completed. */
  draftedAtCompletion: boolean;
  /** Delivery evidence on the linked job, so AP can check before approving. */
  evidence?: {
    /** Every inbound receipt on the job: its PL and the GRN returned for it. */
    inbounds: {
      id: string;
      number: string;
      plNumber: string;
      plStatus: string;
      grnNumber?: string;
      grnStatus?: string;
    }[];
    requests: { id: string; number: string; status: string; podNumber?: string }[];
  };
  total: number;
  outstanding: number;
  daysOverdue: number;
  /** Agreed vendor cost on the linked work order (job-cost match). */
  agreedCost?: number;
  variance?: number;
  /** Purchase order this vendor invoice is matched to. */
  po?: { id: string; number: string; amount: number; status: PurchaseOrder['status'] };
  /** 3-way match: PO vs proof of work (GRN / POD) vs vendor invoice. */
  match?: ThreeWayMatch;
}

export interface ThreeWayMatch {
  poAmount: number;
  invoiceAmount: number;
  difference: number;
  amountOk: boolean;
  proof: { label: string; detail: string; ok: boolean }[];
  proofOk: boolean;
  ok: boolean;
}

/** Proof of work on the job: GRN verified, every customer request closed by a matching POD. */
export function proofOfWork(wo: WorkOrder | undefined): ThreeWayMatch['proof'] {
  if (!wo) return [{ label: 'Job', detail: 'Not linked to a job', ok: false }];
  const proof: ThreeWayMatch['proof'] = [];
  for (const ib of wo.inbounds) {
    proof.push(
      ib.grn
        ? {
            label: `GRN ${ib.grn.number} (${ib.number})`,
            detail: ib.grn.status,
            ok: ib.grn.status === 'Verified',
          }
        : {
            label: `GRN for ${ib.number}`,
            detail:
              ib.packingList.status === 'Sent to warehouse'
                ? `Not received (PL ${ib.packingList.number} sent)`
                : 'PL not sent yet',
            ok: false,
          },
    );
  }
  if (!wo.inbounds.length && wo.serviceCategories.includes('Warehouse'))
    proof.push({ label: 'GRN', detail: 'No inbound receipt recorded', ok: false });
  for (const r of wo.customerRequests) {
    proof.push({
      label: `POD for ${r.number}`,
      detail: r.pod ? `${r.pod.number} · request ${r.status}` : `Missing · request ${r.status}`,
      ok: !!r.pod && r.status === 'Closed',
    });
  }
  if (!proof.length)
    proof.push({
      label: `Job ${wo.number}`,
      detail: wo.status,
      ok: wo.status === 'Completed' || wo.status === 'Delivered',
    });
  return proof;
}

export function threeWayMatch(
  poAmount: number,
  invoiceAmount: number,
  wo: WorkOrder | undefined,
): ThreeWayMatch {
  const difference = round2(invoiceAmount - poAmount);
  const proof = proofOfWork(wo);
  const amountOk = Math.abs(difference) < 0.01;
  const proofOk = proof.every((p) => p.ok);
  return { poAmount, invoiceAmount, difference, amountOk, proof, proofOk, ok: amountOk && proofOk };
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
  const po = b.purchaseOrderId ? db.purchaseOrders.find((x) => x.id === b.purchaseOrderId) : undefined;
  return {
    ...b,
    status,
    vendorName: vendor?.name ?? lookupName.vendor(b.vendorId),
    vendorCategory: vendor?.category ?? '',
    workOrderNumber: wo?.number,
    jobCategory: wo?.serviceCategory,
    jobMode: wo?.mode,
    jobStatus: wo?.status,
    draftedAtCompletion:
      b.status === 'Draft' &&
      !!wo &&
      wo.status === 'Completed' &&
      (wo.purchaseInvoiceIds?.includes(b.id) ?? true),
    evidence: wo
      ? {
          inbounds: wo.inbounds.map((ib) => ({
            id: ib.id,
            number: ib.number,
            plNumber: ib.packingList.number,
            plStatus: ib.packingList.status,
            grnNumber: ib.grn?.number,
            grnStatus: ib.grn?.status,
          })),
          requests: wo.customerRequests.map((r) => ({
            id: r.id,
            number: r.number,
            status: r.status,
            podNumber: r.pod?.number,
          })),
        }
      : undefined,
    ...billTotals(b),
    daysOverdue: status === 'Overdue' ? daysBetween(b.dueDate, PROTO_TODAY) : 0,
    agreedCost: agreed,
    variance: agreed !== undefined ? round2(b.amount - agreed) : undefined,
    po: po ? { id: po.id, number: po.number, amount: po.amount, status: po.status } : undefined,
    match: po ? threeWayMatch(po.amount, b.amount, wo) : undefined,
  };
}

export const vendorBillsApi = {
  list(params: ListParams): Promise<Page<VendorBillRow>> {
    const rows = [...protoDb.get().vendorBills].sort((a, b) => b.number.localeCompare(a.number)).map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.vendorRef} ${r.vendorName} ${r.workOrderNumber ?? ''} ${r.po?.number ?? ''}`,
        status: (r) => r.status,
      }),
    );
  },
  get(id: string): Promise<VendorBillRow> {
    const b = protoDb.get().vendorBills.find((x) => x.id === id);
    return b ? latency(toRow(b)) : Promise.reject(new Error('Not found'));
  },
  /** Purchase order + its job, to record the vendor's invoice against it. */
  purchaseOrder(purchaseOrderId: string): Promise<PoForBilling> {
    const db = protoDb.get();
    const po = db.purchaseOrders.find((x) => x.id === purchaseOrderId);
    if (!po) return Promise.reject(new Error('Purchase order not found'));
    const wo = db.workOrders.find((w) => w.id === po.workOrderId);
    return latency({
      ...po,
      vendorName: lookupName.vendor(po.vendorId),
      paymentTermsDays: db.vendors.find((v) => v.id === po.vendorId)?.paymentTermsDays ?? 30,
      jobNumber: wo?.number,
      proof: proofOfWork(wo),
    });
  },
  /** Records the vendor's invoice against a PO (Draft). A mismatch needs a reason before saving. */
  createFromPo(input: NewVendorInvoiceInput): Promise<VendorBill> {
    const db = protoDb.get();
    const po = db.purchaseOrders.find((x) => x.id === input.purchaseOrderId);
    if (!po) return Promise.reject(new Error('Purchase order not found'));
    if (po.vendorBillId || po.status === 'Billed' || po.status === 'Cancelled')
      return Promise.reject(new Error('This purchase order is already billed or cancelled'));
    const wo = db.workOrders.find((w) => w.id === po.workOrderId);
    const match = threeWayMatch(po.amount, round2(input.amount), wo);
    if (!match.ok && !input.reason?.trim())
      return Promise.reject(new Error('Give a reason to save a purchase invoice that does not match'));
    const next = Math.max(7700, ...db.vendorBills.map((b) => Number(b.number.split('-')[1]) || 0)) + 1;
    const terms = db.vendors.find((v) => v.id === po.vendorId)?.paymentTermsDays ?? 30;
    const bill: VendorBill = {
      id: newId('bill'),
      number: `PI-${next}`,
      vendorRef: input.vendorRef.trim(),
      vendorId: po.vendorId,
      workOrderId: po.workOrderId,
      purchaseOrderId: po.id,
      billDate: input.billDate,
      dueDate: new Date(Date.parse(input.billDate) + terms * 86_400_000).toISOString().slice(0, 10),
      amount: round2(input.amount),
      vat: round2(input.amount * po.vatRate),
      paid: 0,
      status: 'Draft',
    };
    protoDb.update((s) => ({
      ...s,
      vendorBills: [bill, ...s.vendorBills],
      purchaseOrders: s.purchaseOrders.map((x) =>
        x.id === po.id ? { ...x, status: 'Billed' as const, vendorBillId: bill.id } : x,
      ),
    }));
    logActivity({
      entity: 'Vendor bill',
      entityId: bill.id,
      entityRef: bill.number,
      action: match.ok
        ? `recorded vendor invoice ${bill.vendorRef} against ${po.number}`
        : `recorded vendor invoice ${bill.vendorRef} against ${po.number} with a mismatch: ${input.reason?.trim()}${input.fileName ? ` (${input.fileName})` : ''}`,
    });
    return latency(bill, 300);
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
      memo: `Purchase invoice ${b.vendorRef} — ${lookupName.vendor(b.vendorId)}`,
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
      action: 'approved the purchase invoice',
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

/** Used by Payments: settles part of a bill (status → Partially paid / Paid). */
export function applyPaymentToBill(billId: string, amount: number): void {
  protoDb.update((s) => ({
    ...s,
    vendorBills: s.vendorBills.map((x) => {
      if (x.id !== billId) return x;
      const paid = round2(x.paid + amount);
      return {
        ...x,
        paid,
        status: paid >= billTotals(x).total - 0.005 ? ('Paid' as const) : ('Partially paid' as const),
      };
    }),
  }));
}

/** Approved / part-paid / overdue bills of a vendor with something left to pay, oldest due first. */
export function openBillsForVendor(vendorId: string): VendorBillRow[] {
  return protoDb
    .get()
    .vendorBills.filter(
      (b) => b.vendorId === vendorId && ['Approved', 'Partially paid', 'Overdue'].includes(b.status),
    )
    .map(toRow)
    .filter((r) => r.outstanding > 0.005)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface PoForBilling extends PurchaseOrder {
  vendorName: string;
  paymentTermsDays: number;
  jobNumber?: string;
  proof: ThreeWayMatch['proof'];
}

export interface NewVendorInvoiceInput {
  purchaseOrderId: string;
  vendorRef: string;
  billDate: string;
  amount: number;
  fileName?: string;
  reason?: string;
}

export function usePurchaseOrderForBilling(purchaseOrderId: string | undefined) {
  return useQuery({
    queryKey: ['vendor-bills', 'po', purchaseOrderId],
    queryFn: () => vendorBillsApi.purchaseOrder(purchaseOrderId!),
    enabled: !!purchaseOrderId,
  });
}

export function useCreateVendorInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: vendorBillsApi.createFromPo,
    onSuccess: () => {
      invalidateFinance(qc);
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

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
