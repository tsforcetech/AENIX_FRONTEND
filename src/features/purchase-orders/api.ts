import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billTotals } from '@/domain/calc';
import type {
  CustomerRequest,
  PurchaseOrder,
  PurchaseOrderStatus,
  ServiceCategory,
  TransportMode,
  VendorBill,
  Inbound,
} from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { latency, logActivity, protoDb } from '@/prototype/store';
import { grnResult, podResult } from '@/features/work-orders/api';

/**
 * Vendor purchase orders. PROTOTYPE ADAPTER — replace with the generated client when the
 * procurement contract (API-DEP-19/20) is published. POs are issued when a vendor is assigned
 * to a job (industry standard: PO before the work); vendor invoices are matched against them.
 */
export interface PurchaseOrderRow extends PurchaseOrder {
  vendorName: string;
  serviceName: string;
  jobNumber: string;
  jobCategory: ServiceCategory;
  jobMode?: TransportMode;
  total: number;
}

export interface ProofItem {
  kind: 'GRN' | 'POD';
  label: string;
  status: string;
  ok: boolean;
}

export interface PurchaseOrderDetail extends PurchaseOrderRow {
  jobStatus: string;
  customerName: string;
  salesOrderNumber?: string;
  bill?: VendorBill & { total: number };
  proof: ProofItem[];
  match: {
    amountOk: boolean | null; // null = no invoice yet
    proofOk: boolean;
    overall: 'Match' | 'Mismatch' | 'Awaiting invoice';
  };
}

const vat = (po: Pick<PurchaseOrder, 'amount' | 'vatRate'>) => Math.round(po.amount * po.vatRate * 100) / 100;

function toRow(po: PurchaseOrder): PurchaseOrderRow {
  const wo = protoDb.get().workOrders.find((w) => w.id === po.workOrderId);
  return {
    ...po,
    vendorName: lookupName.vendor(po.vendorId),
    serviceName: lookupName.service(po.serviceId),
    jobNumber: wo?.number ?? '—',
    jobCategory: wo?.serviceCategory ?? 'Service',
    jobMode: wo?.mode,
    total: Math.round((po.amount + vat(po)) * 100) / 100,
  };
}

/** Proof of work for the job: the GRN of EVERY inbound receipt and the POD of every customer request. */
function proofFor(wo: { inbounds: Inbound[]; customerRequests: CustomerRequest[] }): ProofItem[] {
  const items: ProofItem[] = [];
  for (const ib of wo.inbounds) {
    const r = grnResult(ib);
    items.push({
      kind: 'GRN',
      label: ib.grn
        ? `${ib.number}: ${ib.grn.number} vs ${ib.packingList.number}`
        : `${ib.number}: ${ib.packingList.number} — no GRN yet`,
      status: ib.grn ? (r?.ok ? 'Match' : ib.grn.status) : 'Not received',
      ok: !!ib.grn && !!r?.ok,
    });
  }
  for (const req of wo.customerRequests) {
    const r = podResult(req);
    items.push({
      kind: 'POD',
      label: req.pod ? `${req.pod.number} vs ${req.number}` : `${req.number} — no POD yet`,
      status: req.pod ? (r?.ok ? 'Match' : 'Variance raised') : 'Not received',
      ok: !!req.pod && !!r?.ok,
    });
  }
  return items;
}

const STATUS_ORDER: PurchaseOrderStatus[] = [
  'Draft',
  'Issued',
  'Accepted',
  'Completed',
  'Billed',
  'Cancelled',
];

function setStatus(id: string, status: PurchaseOrderStatus, action: string) {
  const po = protoDb.get().purchaseOrders.find((p) => p.id === id);
  if (!po) throw new Error('Purchase order not found');
  protoDb.update((s) => ({
    ...s,
    purchaseOrders: s.purchaseOrders.map((p) => (p.id === id ? { ...p, status } : p)),
    workOrders:
      status === 'Accepted' || status === 'Cancelled'
        ? s.workOrders.map((w) =>
            w.id === po.workOrderId
              ? {
                  ...w,
                  vendorAssignments:
                    status === 'Cancelled'
                      ? w.vendorAssignments.filter((a) => a.purchaseOrderId !== id)
                      : w.vendorAssignments.map((a) =>
                          a.purchaseOrderId === id && a.status === 'Requested'
                            ? { ...a, status: 'Accepted' as const }
                            : a,
                        ),
                }
              : w,
          )
        : s.workOrders,
  }));
  logActivity({ entity: 'Purchase order', entityId: id, entityRef: po.number, action });
}

export const purchaseOrdersApi = {
  list(params: ListParams): Promise<Page<PurchaseOrderRow>> {
    const rows = [...protoDb.get().purchaseOrders]
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.vendorName} ${r.jobNumber} ${r.serviceName} ${r.description}`,
        status: (r) => r.status,
      }),
    );
  },

  get(id: string): Promise<PurchaseOrderDetail> {
    const db = protoDb.get();
    const po = db.purchaseOrders.find((p) => p.id === id);
    if (!po) return Promise.reject(new Error('Not found'));
    const wo = db.workOrders.find((w) => w.id === po.workOrderId);
    const billRaw = po.vendorBillId ? db.vendorBills.find((b) => b.id === po.vendorBillId) : undefined;
    const bill = billRaw ? { ...billRaw, total: billTotals(billRaw).total } : undefined;
    const proof = wo ? proofFor(wo) : [];
    const proofOk = proof.every((p) => p.ok);
    const amountOk = bill ? Math.abs(bill.amount - po.amount) < 0.01 : null;
    return latency({
      ...toRow(po),
      jobStatus: wo?.status ?? '—',
      customerName: wo ? lookupName.customer(wo.customerId) : '—',
      salesOrderNumber: po.salesOrderId
        ? db.salesOrders.find((o) => o.id === po.salesOrderId)?.number
        : undefined,
      bill,
      proof,
      match: {
        amountOk,
        proofOk,
        overall: amountOk === null ? 'Awaiting invoice' : amountOk && proofOk ? 'Match' : 'Mismatch',
      },
    });
  },

  accept(id: string): Promise<void> {
    const po = protoDb.get().purchaseOrders.find((p) => p.id === id);
    if (po?.status !== 'Issued') return Promise.reject(new Error('Only issued POs can be accepted'));
    setStatus(id, 'Accepted', 'recorded vendor acceptance');
    return latency(undefined, 200);
  },

  complete(id: string): Promise<void> {
    const po = protoDb.get().purchaseOrders.find((p) => p.id === id);
    if (!po || !['Issued', 'Accepted'].includes(po.status))
      return Promise.reject(new Error('Only issued or accepted POs can be completed'));
    setStatus(id, 'Completed', 'marked the work completed');
    return latency(undefined, 200);
  },

  cancel(id: string, reason: string): Promise<void> {
    const po = protoDb.get().purchaseOrders.find((p) => p.id === id);
    if (!po || po.status === 'Billed' || po.status === 'Cancelled')
      return Promise.reject(new Error('Billed or cancelled POs cannot be cancelled'));
    setStatus(id, 'Cancelled', `cancelled the PO (${reason})`);
    return latency(undefined, 200);
  },
};

export const PO_STATUSES = STATUS_ORDER;

export function usePurchaseOrders(params: ListParams) {
  return useQuery({
    queryKey: ['purchase-orders', 'list', params],
    queryFn: () => purchaseOrdersApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({ queryKey: ['purchase-orders', 'detail', id], queryFn: () => purchaseOrdersApi.get(id) });
}

export function usePurchaseOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      a: { id: string; kind: 'accept' | 'complete' } | { id: string; kind: 'cancel'; reason: string },
    ) => {
      if (a.kind === 'cancel') return purchaseOrdersApi.cancel(a.id, a.reason);
      return a.kind === 'accept' ? purchaseOrdersApi.accept(a.id) : purchaseOrdersApi.complete(a.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
