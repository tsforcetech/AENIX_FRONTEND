import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billTotals, invoiceTotals, linesRevenue } from '@/domain/calc';
import { useSession, type ActorType } from '@/shared/auth/session';
import { lookupName } from '@/shared/data/lookups';
import { latency, logActivity, protoDb } from '@/prototype/store';
import { PROTO_TODAY } from '@/prototype/seed';
import { buildStatement, openInvoiceStats } from '@/features/customers/statement';
import { reconcile } from '@/domain/reconcile';
import type { WorkOrder } from '@/domain/types';

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
    ),
  };
}

export type CustomerApproval = ReturnType<typeof customerApprovals>[number];

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
