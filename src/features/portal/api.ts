import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billTotals, invoiceTotals, linesRevenue } from '@/domain/calc';
import { useSession, type ActorType } from '@/shared/auth/session';
import { lookupName } from '@/shared/data/lookups';
import { latency, logActivity, newId, nowIso, protoDb } from '@/prototype/store';
import { PROTO_TODAY } from '@/prototype/seed';
import { buildStatement, openInvoiceStats } from '@/features/customers/statement';
import { reconcile } from '@/domain/reconcile';
import { customerBalance } from '@/domain/balances';
import type { AppNotification, Attachment, DocLine, WorkOrder } from '@/domain/types';

const where = (w: Pick<WorkOrder, 'origin' | 'destination'>) =>
  w.destination ? `${w.origin} → ${w.destination}` : w.origin;

/**
 * Customer / vendor portal data. The party is ALWAYS taken from the authenticated session
 * (server-bound in the real system) — never from URL, query or body values (SECURITY-AND-AUDIT).
 * PROTOTYPE ADAPTER: replaced by the Phase 9 Portals contract.
 */
export function usePortalParty(kind: Exclude<ActorType, 'staff'>): string | null {
  const { principal } = useSession();
  return principal?.actorType === kind && principal.partyId ? principal.partyId : null;
}

// ---------------- Customer portal ----------------
function customerOverview(partyId: string) {
  const db = protoDb.get();
  const invoices = db.invoices.filter(
    (i) => i.customerId === partyId && i.status !== 'Draft' && i.status !== 'Cancelled',
  );
  const stats = openInvoiceStats(invoices);
  return {
    customerName: lookupName.customer(partyId),
    balance: customerBalance(partyId, {
      salesOrders: db.salesOrders,
      invoices: db.invoices,
      collections: db.collections,
    }),
    /** The customer's jobs that include warehouse handling — the customer can upload the PL for these. */
    warehouseJobs: db.workOrders
      .filter(
        (w) =>
          w.customerId === partyId &&
          w.serviceCategories.includes('Warehouse') &&
          w.status !== 'Cancelled' &&
          w.status !== 'Completed',
      )
      .map((w) => ({
        id: w.id,
        number: w.number,
        location: where(w),
        status: w.status,
        plNumber: w.packingList?.number,
        plStatus: w.packingList?.status,
        plLines: w.packingList?.lines.length ?? 0,
        grnNumber: w.grn?.number,
        grnStatus: w.grn?.status,
        canUploadPl: !w.packingList || w.packingList.status === 'Draft',
      })),
    outstanding: stats.outstanding,
    overdue: stats.overdue,
    pendingApprovals: db.quotations.filter((q) => q.customerId === partyId && q.status === 'Sent').length,
    recentInvoices: [...invoices]
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        number: i.number,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        status: i.status,
        ...invoiceTotals(i),
      })),
    shipments: db.workOrders
      .filter(
        (w) =>
          w.customerId === partyId &&
          ['Confirmed', 'In progress', 'In transit', 'Delivered'].includes(w.status),
      )
      .map((w) => ({
        id: w.id,
        number: w.number,
        serviceCategory: w.serviceCategory,
        serviceCategories: w.serviceCategories,
        mode: w.mode,
        lane: where(w),
        status: w.status,
        eta: w.eta,
        progress: Math.round(
          (w.milestones.filter((m) => m.status === 'Done').length / w.milestones.length) * 100,
        ),
        milestone: w.milestones.find((m) => m.status === 'Current')?.label ?? 'Delivered',
      })),
    /** Read-only: the customer's out / delivery requests and their POD status. */
    requests: db.workOrders
      .filter((w) => w.customerId === partyId)
      .flatMap((w) =>
        w.customerRequests.map((r) => {
          const recon = r.pod
            ? reconcile(
                r.lines,
                r.pod.lines.map((l) => ({ sku: l.sku, qty: l.deliveredQty, remarks: l.remarks })),
              )
            : undefined;
          return {
            id: r.id,
            number: r.number,
            jobRef: w.number,
            deliverTo: r.deliverTo,
            requiredBy: r.requiredBy,
            status: r.status,
            requestedQty: r.lines.reduce((s, l) => s + l.quantity, 0),
            podNumber: r.pod?.number,
            deliveredAt: r.pod?.deliveredAt,
            deliveredQty: recon?.actualTotal,
            mismatches: recon?.mismatches ?? 0,
          };
        }),
      )
      .sort((a, b) => b.requiredBy.localeCompare(a.requiredBy)),
  };
}

function customerApprovals(partyId: string) {
  return protoDb
    .get()
    .quotations.filter((q) => q.customerId === partyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((q) => ({
      id: q.id,
      number: q.number,
      version: q.version,
      lane: where(q),
      serviceCategory: q.serviceCategory,
      serviceCategories: q.serviceCategories,
      mode: q.mode,
      agreement: q.agreement,
      validUntil: q.validUntil,
      status: q.status,
      total: Math.round(linesRevenue(q.lines) * 1.05 * 100) / 100,
      lines: q.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
      })),
    }));
}

function customerInvoices(partyId: string) {
  const db = protoDb.get();
  const invoices = db.invoices.filter(
    (i) => i.customerId === partyId && i.status !== 'Draft' && i.status !== 'Cancelled',
  );
  return {
    invoices: [...invoices]
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
      .map((i) => ({
        id: i.id,
        number: i.number,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        status: i.status,
        ...invoiceTotals(i),
      })),
    statement: buildStatement(
      invoices,
      db.collections.filter((c) => c.customerId === partyId),
      db.salesOrders.filter((o) => o.customerId === partyId),
    ),
  };
}

export type CustomerApproval = ReturnType<typeof customerApprovals>[number];
export type CustomerOverview = ReturnType<typeof customerOverview>;

function staffNotice(title: string, body: string, href: string): AppNotification {
  return { id: newId('n'), at: nowIso(), title, body, read: false, href };
}

function attachmentFrom(file: { name: string; size: number }, by: string): Attachment {
  return {
    fileName: file.name,
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
    uploadedAt: nowIso(),
    uploadedBy: by,
  };
}

/**
 * Customer uploads the packing list (PL) for one of their warehouse jobs. Scope: the job must belong to the
 * session party, include warehouse handling, and have no PL yet (or a draft). The file itself goes to the
 * backend document store; the prototype keeps its name only.
 */
export function useUploadPackingList(partyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workOrderId,
      file,
      lines,
    }: {
      workOrderId: string;
      file: { name: string; size: number };
      lines: DocLine[];
    }) => {
      const wo = protoDb.get().workOrders.find((w) => w.id === workOrderId);
      if (!partyId || !wo || wo.customerId !== partyId) throw new Error('Not found');
      if (!wo.serviceCategories.includes('Warehouse')) throw new Error('This job has no warehouse handling.');
      if (wo.packingList && wo.packingList.status !== 'Draft')
        throw new Error('A packing list has already been sent for this job.');
      if (lines.length === 0) throw new Error('Add at least one line.');
      const number = wo.packingList?.number ?? `PL-${wo.number.replace(/^JOB-/, '')}`;
      const customer = lookupName.customer(partyId);
      const att = attachmentFrom(file, `${customer} (portal)`);
      protoDb.update((s) => ({
        ...s,
        workOrders: s.workOrders.map((w) =>
          w.id === workOrderId
            ? {
                ...w,
                packingList: {
                  number,
                  status: 'Sent to warehouse' as const,
                  sentAt: nowIso(),
                  lines: lines.map((l) => ({ ...l, sku: l.sku.trim().toUpperCase() })),
                },
              }
            : w,
        ),
        notifications: [
          staffNotice(
            `Packing list ${number} uploaded by customer`,
            `${customer} · ${wo.number} · ${att.fileName} (${lines.length} lines) — warehouse to expect goods`,
            `/work-orders/${wo.id}`,
          ),
          ...s.notifications,
        ],
      }));
      logActivity({
        entity: 'Work order',
        entityId: wo.id,
        entityRef: wo.number,
        action: `customer uploaded packing list ${number} (${att.fileName}) in the portal`,
      });
      return latency({ number }, 350);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal'] });
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
      void qc.invalidateQueries({ queryKey: ['warehouse'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useCustomerPortalOverview(partyId: string | null) {
  return useQuery({
    queryKey: ['portal', 'customer', partyId, 'overview'],
    enabled: !!partyId,
    queryFn: () => latency(customerOverview(partyId!)),
  });
}

export function useCustomerApprovals(partyId: string | null) {
  return useQuery({
    queryKey: ['portal', 'customer', partyId, 'approvals'],
    enabled: !!partyId,
    queryFn: () => latency(customerApprovals(partyId!)),
  });
}

export function useCustomerInvoices(partyId: string | null) {
  return useQuery({
    queryKey: ['portal', 'customer', partyId, 'invoices'],
    enabled: !!partyId,
    queryFn: () => latency(customerInvoices(partyId!)),
  });
}

/** Customer decision on a sent quotation. Scope check: the quotation must belong to the session party. */
export function useQuotationDecision(partyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      note,
    }: {
      id: string;
      decision: 'accept' | 'changes';
      note?: string;
    }) => {
      const q = protoDb.get().quotations.find((x) => x.id === id);
      if (!partyId || !q || q.customerId !== partyId) throw new Error('Not found');
      if (q.status !== 'Sent') throw new Error('This quotation is no longer awaiting your decision.');
      protoDb.update((s) => ({
        ...s,
        quotations: s.quotations.map((x) =>
          x.id === id
            ? decision === 'accept'
              ? { ...x, status: 'Accepted' as const }
              : {
                  ...x,
                  status: 'Draft' as const,
                  terms: `${x.terms}\n\nCustomer requested changes (${PROTO_TODAY}): ${note ?? ''}`.trim(),
                }
            : x,
        ),
        enquiries:
          decision === 'accept' && q.enquiryId
            ? s.enquiries.map((e) => (e.id === q.enquiryId ? { ...e, status: 'Won' as const } : e))
            : s.enquiries,
      }));
      logActivity({
        entity: 'Quotation',
        entityId: id,
        entityRef: q.number,
        action:
          decision === 'accept'
            ? 'accepted the quotation in the customer portal'
            : 'requested changes in the customer portal',
      });
      return latency(undefined, 300);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal'] });
      void qc.invalidateQueries({ queryKey: ['quotations'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

// ---------------- Vendor portal ----------------
function vendorAssignments(partyId: string) {
  return protoDb.get().workOrders.flatMap((wo) =>
    wo.vendorAssignments
      .filter((a) => a.vendorId === partyId)
      .map((a) => ({
        id: a.id,
        workOrderId: wo.id,
        jobRef: wo.number,
        lane: where(wo),
        serviceCategory: wo.serviceCategory,
        serviceCategories: wo.serviceCategories,
        mode: wo.mode,
        /** Customer requests on this job still waiting for a POD (read-only for the vendor). */
        podPending: wo.customerRequests.filter((r) => !r.pod && r.status !== 'Closed').length,
        service: lookupName.service(a.serviceId),
        agreedCost: a.agreedCost,
        status: a.status,
        eta: wo.eta,
      })),
  );
}

function vendorBills(partyId: string) {
  const db = protoDb.get();
  return db.vendorBills
    .filter((b) => b.vendorId === partyId)
    .map((b) => ({
      ...b,
      ...billTotals(b),
      jobRef: db.workOrders.find((w) => w.id === b.workOrderId)?.number ?? '—',
    }));
}

function vendorOverview(partyId: string) {
  const assignments = vendorAssignments(partyId);
  const bills = vendorBills(partyId);
  return {
    vendorName: lookupName.vendor(partyId),
    openAssignments: assignments.filter((a) => a.status !== 'Completed').length,
    podPending: assignments.reduce((s, a) => s + (a.status !== 'Completed' ? a.podPending : 0), 0),
    billsOutstanding: Math.round(bills.reduce((s, b) => s + b.outstanding, 0) * 100) / 100,
    paidThisMonth:
      Math.round(
        bills
          .filter((b) => b.status === 'Paid' && b.billDate.startsWith('2026-11'))
          .reduce((s, b) => s + b.paid, 0) * 100,
      ) / 100,
    recentAssignments: assignments.filter((a) => a.status !== 'Completed').slice(0, 5),
  };
}

function vendorPurchaseOrders(partyId: string) {
  const db = protoDb.get();
  return db.purchaseOrders
    .filter((p) => p.vendorId === partyId)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
    .map((p) => {
      const wo = db.workOrders.find((w) => w.id === p.workOrderId);
      return {
        id: p.id,
        number: p.number,
        jobRef: wo?.number ?? '—',
        location: wo ? where(wo) : '—',
        description: p.description,
        issuedAt: p.issuedAt,
        amount: p.amount,
        total: Math.round(p.amount * (1 + p.vatRate) * 100) / 100,
        status: p.status,
        billNumber: db.vendorBills.find((b) => b.id === p.vendorBillId)?.number,
      };
    });
}

/** Customer out / delivery requests on jobs where this vendor is assigned (the vendor delivers and returns the POD). */
function vendorRequests(partyId: string) {
  const db = protoDb.get();
  return db.workOrders
    .filter((w) => w.vendorAssignments.some((a) => a.vendorId === partyId))
    .flatMap((w) =>
      w.customerRequests.map((r) => ({
        id: r.id,
        workOrderId: w.id,
        number: r.number,
        jobRef: w.number,
        deliverTo: r.deliverTo,
        requiredBy: r.requiredBy,
        status: r.status,
        lines: r.lines,
        podNumber: r.pod?.number,
        podBy: r.pod && r.pod.vendorId !== partyId ? 'another party' : undefined,
        canUploadPod: !r.pod && (r.status === 'Open' || r.status === 'Sent to vendor'),
      })),
    )
    .sort((a, b) => a.requiredBy.localeCompare(b.requiredBy));
}

export type VendorPoRow = ReturnType<typeof vendorPurchaseOrders>[number];
export type VendorRequestRow = ReturnType<typeof vendorRequests>[number];

export function useVendorPurchaseOrders(partyId: string | null) {
  return useQuery({
    queryKey: ['portal', 'vendor', partyId, 'purchase-orders'],
    enabled: !!partyId,
    queryFn: () => latency(vendorPurchaseOrders(partyId!)),
  });
}

export function useVendorRequests(partyId: string | null) {
  return useQuery({
    queryKey: ['portal', 'vendor', partyId, 'requests'],
    enabled: !!partyId,
    queryFn: () => latency(vendorRequests(partyId!)),
  });
}

/** Vendor accepts an issued purchase order addressed to them. */
export function useAcceptPurchaseOrder(partyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const po = protoDb.get().purchaseOrders.find((p) => p.id === id);
      if (!partyId || !po || po.vendorId !== partyId) throw new Error('Not found');
      if (po.status !== 'Issued') throw new Error('Only issued purchase orders can be accepted.');
      protoDb.update((s) => ({
        ...s,
        purchaseOrders: s.purchaseOrders.map((p) =>
          p.id === id ? { ...p, status: 'Accepted' as const } : p,
        ),
      }));
      logActivity({
        entity: 'Purchase order',
        entityId: po.id,
        entityRef: po.number,
        action: 'vendor accepted the purchase order in the portal',
      });
      return latency(undefined, 250);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal'] });
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

/**
 * Vendor uploads the POD for a customer request on a job they are assigned to. Scope: vendor must have an
 * assignment on the job and the request must still be waiting for a POD. Staff then compare request vs POD.
 */
export function useUploadPod(partyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workOrderId: string;
      requestId: string;
      file: { name: string; size: number };
      podNumber: string;
      receivedBy: string;
      lines: { sku: string; deliveredQty: number; remarks?: string }[];
    }) => {
      const wo = protoDb.get().workOrders.find((w) => w.id === input.workOrderId);
      const req = wo?.customerRequests.find((r) => r.id === input.requestId);
      if (!partyId || !wo || !req || !wo.vendorAssignments.some((a) => a.vendorId === partyId))
        throw new Error('Not found');
      if (req.pod) throw new Error('A POD has already been uploaded for this request.');
      const vendor = lookupName.vendor(partyId);
      const att = attachmentFrom(input.file, `${vendor} (portal)`);
      const recon = reconcile(
        req.lines,
        input.lines.map((l) => ({ sku: l.sku, qty: l.deliveredQty, remarks: l.remarks })),
      );
      protoDb.update((s) => ({
        ...s,
        workOrders: s.workOrders.map((w) =>
          w.id === wo.id
            ? {
                ...w,
                customerRequests: w.customerRequests.map((r) =>
                  r.id === req.id
                    ? {
                        ...r,
                        status: 'Delivered' as const,
                        pod: {
                          number: input.podNumber,
                          vendorId: partyId,
                          deliveredAt: nowIso(),
                          receivedBy: input.receivedBy,
                          attachment: att,
                          lines: input.lines,
                        },
                      }
                    : r,
                ),
              }
            : w,
        ),
        notifications: [
          staffNotice(
            recon.ok
              ? `POD ${input.podNumber} uploaded — matches request`
              : `POD ${input.podNumber} differs from request`,
            `${vendor} · ${req.number} on ${wo.number}${recon.ok ? '' : ` · ${recon.mismatches} line(s) to check`}`,
            `/work-orders/${wo.id}`,
          ),
          ...s.notifications,
        ],
      }));
      logActivity({
        entity: 'Work order',
        entityId: wo.id,
        entityRef: wo.number,
        action: `vendor uploaded POD ${input.podNumber} for ${req.number} in the portal`,
      });
      return latency({ ok: recon.ok, mismatches: recon.mismatches }, 350);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal'] });
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
      void qc.invalidateQueries({ queryKey: ['warehouse'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export type VendorAssignmentRow = ReturnType<typeof vendorAssignments>[number];
export type VendorBillRow = ReturnType<typeof vendorBills>[number];

export function useVendorPortalOverview(partyId: string | null) {
  return useQuery({
    queryKey: ['portal', 'vendor', partyId, 'overview'],
    enabled: !!partyId,
    queryFn: () => latency(vendorOverview(partyId!)),
  });
}

export function useVendorAssignments(partyId: string | null) {
  return useQuery({
    queryKey: ['portal', 'vendor', partyId, 'assignments'],
    enabled: !!partyId,
    queryFn: () => latency(vendorAssignments(partyId!)),
  });
}

export function useVendorBills(partyId: string | null) {
  return useQuery({
    queryKey: ['portal', 'vendor', partyId, 'bills'],
    enabled: !!partyId,
    queryFn: () => latency(vendorBills(partyId!)),
  });
}

/** Vendor updates the status of their own assignment only (Requested → Accepted → Completed). */
export function useAssignmentAction(partyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, next }: { id: string; next: 'Accepted' | 'Completed' }) => {
      const wo = protoDb.get().workOrders.find((w) => w.vendorAssignments.some((a) => a.id === id));
      const a = wo?.vendorAssignments.find((x) => x.id === id);
      if (!partyId || !wo || !a || a.vendorId !== partyId) throw new Error('Not found');
      const allowed =
        (a.status === 'Requested' && next === 'Accepted') ||
        (a.status === 'Accepted' && next === 'Completed');
      if (!allowed) throw new Error('This assignment cannot move to that status.');
      protoDb.update((s) => ({
        ...s,
        workOrders: s.workOrders.map((w) =>
          w.id === wo.id
            ? {
                ...w,
                vendorAssignments: w.vendorAssignments.map((x) => (x.id === id ? { ...x, status: next } : x)),
              }
            : w,
        ),
      }));
      logActivity({
        entity: 'Work order',
        entityId: wo.id,
        entityRef: wo.number,
        action: `vendor marked assignment ${next.toLowerCase()}`,
      });
      return latency(undefined, 250);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal'] });
      void qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}
