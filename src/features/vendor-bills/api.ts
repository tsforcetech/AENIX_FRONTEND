import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { debitNoteTotal, vendorBalance, type VendorBalance } from '@/domain/balances';
import { billTotals, daysBetween } from '@/domain/calc';
import { assertOpenPeriod } from '@/domain/controls';
import type {
  DebitNote,
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
import { ACCOUNTS, nextSeries, postJournal } from '@/features/accounting/ledger';
import { invalidateFinance } from '@/features/invoices/api';
import { completionNotesFor, isServicePo } from '@/features/purchase-orders/api';

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
  /** A10: posted debit notes set off against this bill (part of `paid`). */
  debitNotes: { id: string; number: string; total: number; status: DebitNote['status'] }[];
  debited: number;
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

/**
 * Proof of work on the job: GRN verified, every customer request closed by a matching POD.
 * S3: a service / customs PO is proven by its signed service completion note on the job.
 */
export function proofOfWork(wo: WorkOrder | undefined, po?: PurchaseOrder): ThreeWayMatch['proof'] {
  if (!wo) return [{ label: 'Job', detail: 'Not linked to a job', ok: false }];
  if (po && isServicePo(po, wo)) {
    const notes = completionNotesFor(po, wo);
    if (notes.length)
      return notes.map((n) => ({
        label: `Service completion note ${n.number}`,
        detail:
          n.status === 'Signed'
            ? `Signed${n.customerSignedBy ? ` by ${n.customerSignedBy}` : ''}`
            : 'Not signed yet',
        ok: n.status === 'Signed',
      }));
  }
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
  po?: PurchaseOrder,
): ThreeWayMatch {
  const difference = round2(invoiceAmount - poAmount);
  const proof = proofOfWork(wo, po);
  const amountOk = Math.abs(difference) < 0.01;
  const proofOk = proof.every((p) => p.ok);
  return { poAmount, invoiceAmount, difference, amountOk, proof, proofOk, ok: amountOk && proofOk };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function debitNoteSummary(b: VendorBill) {
  const notes = protoDb
    .get()
    .debitNotes.filter((d) => d.vendorBillId === b.id || b.debitNoteIds?.includes(d.id))
    .map((d) => ({ id: d.id, number: d.number, total: debitNoteTotal(d), status: d.status }));
  return {
    debitNotes: notes,
    debited: round2(notes.filter((n) => n.status === 'Adjusted').reduce((s, n) => s + n.total, 0)),
  };
}

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
    match: po ? threeWayMatch(po.amount, b.amount, wo, po) : undefined,
    ...debitNoteSummary(b),
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
      proof: proofOfWork(wo, po),
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
    const match = threeWayMatch(po.amount, round2(input.amount), wo, po);
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
    const { total } = billTotals(b);
    try {
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
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Could not post'));
    }
    protoDb.update((s) => ({
      ...s,
      vendorBills: s.vendorBills.map((x) => (x.id === id ? { ...x, status: 'Approved' as const } : x)),
    }));
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
    try {
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
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Could not post'));
    }
    protoDb.update((s) => ({
      ...s,
      vendorBills: s.vendorBills.map((x) => (x.id === id ? { ...x, paid, status } : x)),
    }));
    logActivity({
      entity: 'Vendor bill',
      entityId: id,
      entityRef: b.number,
      action: status === 'Paid' ? 'paid the vendor bill' : 'part-paid the vendor bill',
    });
    return latency(undefined, 250);
  },
};

// ---------- A10: debit notes ----------
export interface DebitNoteRow extends DebitNote {
  vendorName: string;
  billNumber?: string;
  poNumber?: string;
  varianceNumber?: string;
  vat: number;
  total: number;
}

export interface NewDebitNoteInput {
  vendorBillId?: string;
  purchaseOrderId?: string;
  reason: string;
  amount: number;
  vatRate: number;
  date: string;
}

const OPEN_BILL: VendorBill['status'][] = ['Approved', 'Partially paid', 'Overdue'];

function toDebitNoteRow(d: DebitNote): DebitNoteRow {
  const db = protoDb.get();
  return {
    ...d,
    vendorName: lookupName.vendor(d.vendorId),
    billNumber: d.vendorBillId ? db.vendorBills.find((b) => b.id === d.vendorBillId)?.number : undefined,
    poNumber: d.purchaseOrderId
      ? db.purchaseOrders.find((p) => p.id === d.purchaseOrderId)?.number
      : undefined,
    varianceNumber: d.varianceId ? db.variances.find((v) => v.id === d.varianceId)?.number : undefined,
    vat: round2(d.amount * d.vatRate),
    total: debitNoteTotal(d),
  };
}

export const debitNotesApi = {
  list(params: ListParams): Promise<Page<DebitNoteRow>> {
    const rows = [...protoDb.get().debitNotes]
      .sort((a, b) => b.number.localeCompare(a.number))
      .map(toDebitNoteRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) =>
          `${r.number} ${r.vendorName} ${r.billNumber ?? ''} ${r.poNumber ?? ''} ${r.varianceNumber ?? ''} ${r.reason}`,
        status: (r) => r.status,
      }),
    );
  },
  /** Bills and POs a debit note can be raised against. */
  targets(): Promise<{ value: string; label: string; vendorId: string; vatRate: number }[]> {
    const db = protoDb.get();
    const bills = db.vendorBills
      .filter((b) => OPEN_BILL.includes(b.status))
      .map((b) => ({
        value: `bill:${b.id}`,
        label: `${b.number} · ${lookupName.vendor(b.vendorId)} · open ${billTotals(b).outstanding.toFixed(2)}`,
        vendorId: b.vendorId,
        vatRate: b.amount > 0 ? Math.round((b.vat / b.amount) * 100) / 100 : 0.05,
      }));
    const pos = db.purchaseOrders
      .filter((p) => p.status !== 'Cancelled' && !p.vendorBillId)
      .map((p) => ({
        value: `po:${p.id}`,
        label: `${p.number} · ${lookupName.vendor(p.vendorId)} · not billed yet`,
        vendorId: p.vendorId,
        vatRate: p.vatRate,
      }));
    return latency([...bills, ...pos], 80);
  },
  create(input: NewDebitNoteInput): Promise<DebitNote> {
    const db = protoDb.get();
    const bill = input.vendorBillId ? db.vendorBills.find((b) => b.id === input.vendorBillId) : undefined;
    const po = input.purchaseOrderId
      ? db.purchaseOrders.find((p) => p.id === input.purchaseOrderId)
      : bill?.purchaseOrderId
        ? db.purchaseOrders.find((p) => p.id === bill.purchaseOrderId)
        : undefined;
    const vendorId = bill?.vendorId ?? po?.vendorId;
    if (!vendorId) return Promise.reject(new Error('Choose the purchase invoice or PO'));
    if (input.reason.trim().length < 5)
      return Promise.reject(new Error('Give a reason of at least 5 characters'));
    if (!(input.amount > 0)) return Promise.reject(new Error('Enter an amount more than 0'));
    const dn: DebitNote = {
      id: newId('dn'),
      number: nextSeries(
        'DN',
        db.debitNotes.map((d) => d.number),
      ),
      vendorId,
      vendorBillId: bill?.id ?? po?.vendorBillId,
      purchaseOrderId: po?.id,
      date: input.date,
      reason: input.reason.trim(),
      amount: round2(input.amount),
      vatRate: input.vatRate,
      status: 'Draft',
    };
    protoDb.update((s) => ({ ...s, debitNotes: [dn, ...s.debitNotes] }));
    logActivity({
      entity: 'Vendor bill',
      entityId: dn.id,
      entityRef: dn.number,
      action: `drafted debit note for ${lookupName.vendor(vendorId)} (${dn.reason})`,
    });
    return latency(dn, 250);
  },
  /**
   * Draft → Posted: Dr vendor AP / Cr 5100 job cost (or 6600 for a shortage / damage variance) and
   * VAT input. Set off against the linked purchase invoice when it is open (status Adjusted).
   */
  post(id: string): Promise<DebitNote> {
    const db = protoDb.get();
    const dn = db.debitNotes.find((d) => d.id === id);
    if (!dn || dn.status !== 'Draft')
      return Promise.reject(new Error('Only draft debit notes can be posted'));
    const total = debitNoteTotal(dn);
    const bill = dn.vendorBillId ? db.vendorBills.find((b) => b.id === dn.vendorBillId) : undefined;
    if (bill && bill.status === 'Draft')
      return Promise.reject(
        new Error(`Approve purchase invoice ${bill.number} before posting the debit note`),
      );
    const setOff = !!bill && OPEN_BILL.includes(bill.status);
    if (setOff && total > billTotals(bill).outstanding + 0.005)
      return Promise.reject(
        new Error(`The debit note (${total.toFixed(2)}) is more than what is still owed on ${bill.number}`),
      );
    try {
      assertOpenPeriod(db.company, dn.date);
      postJournal({
        date: dn.date,
        source: 'Debit note',
        reference: dn.number,
        memo: `Debit note ${dn.number} to ${lookupName.vendor(dn.vendorId)} — ${dn.reason}`,
        lines: [
          { account: ACCOUNTS.ap, debit: total, credit: 0 },
          {
            account: dn.varianceId ? ACCOUNTS.shortageClaims : ACCOUNTS.costOfSales,
            debit: 0,
            credit: dn.amount,
          },
          { account: ACCOUNTS.vatIn, debit: 0, credit: round2(total - dn.amount) },
        ],
      });
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Could not post'));
    }
    const posted: DebitNote = { ...dn, status: setOff ? 'Adjusted' : 'Posted' };
    protoDb.update((s) => ({
      ...s,
      debitNotes: s.debitNotes.map((d) => (d.id === id ? posted : d)),
      vendorBills: s.vendorBills.map((b) =>
        bill && b.id === bill.id
          ? { ...b, debitNoteIds: [...new Set([...(b.debitNoteIds ?? []), dn.id])] }
          : b,
      ),
    }));
    if (setOff) applyPaymentToBill(bill.id, total);
    logActivity({
      entity: 'Vendor bill',
      entityId: dn.id,
      entityRef: dn.number,
      action: setOff ? `posted and set off against ${bill.number}` : 'posted the debit note',
    });
    return latency(posted, 250);
  },
  vendorBalance(vendorId: string): Promise<VendorBalance> {
    return latency(vendorBalance(vendorId, protoDb.get()), 60);
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

export function useDebitNotes(params: ListParams) {
  return useQuery({
    queryKey: ['vendor-bills', 'debit-notes', params],
    queryFn: () => debitNotesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useDebitNoteTargets(enabled: boolean) {
  return useQuery({
    queryKey: ['vendor-bills', 'debit-note-targets'],
    queryFn: () => debitNotesApi.targets(),
    enabled,
  });
}

export function useVendorBalance(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['vendor-bills', 'vendor-balance', vendorId],
    queryFn: () => debitNotesApi.vendorBalance(vendorId!),
    enabled: !!vendorId,
  });
}

export function useCreateDebitNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, post }: { input: NewDebitNoteInput; post: boolean }) => {
      const dn = await debitNotesApi.create(input);
      return post ? debitNotesApi.post(dn.id) : dn;
    },
    onSuccess: () => invalidateFinance(qc),
  });
}

export function usePostDebitNote() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: debitNotesApi.post, onSuccess: () => invalidateFinance(qc) });
}
