import { useQuery } from '@tanstack/react-query';
import { invoiceTotals, workOrderFinancials } from '@/domain/calc';
import type { ActivityEvent, TransportMode, WorkOrder } from '@/domain/types';
import { monthlyRevenue, PROTO_TODAY } from '@/prototype/seed';
import { latency, protoDb } from '@/prototype/store';

/**
 * Home overview view-model. REQUESTED contract (to be added to API-DEPENDENCIES as a
 * dashboard summary endpoint). Today served by the prototype adapter below.
 */
export interface HomeOverview {
  today: string;
  kpis: {
    activeWorkOrders: number;
    revenueMonth: number;
    revenueDeltaPct: number;
    revenueTrend: number[];
    receivables: number;
    overdueCount: number;
    overdueAmount: number;
    collectedMonth: number;
    collectedTrend: number[];
  };
  pipeline: { key: string; label: string; count: number; value: number; to: string }[];
  attention: { id: string; title: string; detail: string; tone: 'danger' | 'warning' | 'info'; to: string }[];
  activeShipments: (Pick<
    WorkOrder,
    'id' | 'number' | 'mode' | 'origin' | 'destination' | 'status' | 'eta'
  > & {
    customer: string;
    progress: number;
    currentMilestone: string;
  })[];
  modeMix: Record<TransportMode, number>;
  warehouse: { palletsUsed: number; palletsCapacity: number; skus: number; movementsThisWeek: number };
  revenueByMonth: typeof monthlyRevenue;
  activity: ActivityEvent[];
}

function buildOverview(): HomeOverview {
  const db = protoDb.get();
  const customerName = (id: string) => db.customers.find((c) => c.id === id)?.name ?? '—';
  const active = db.workOrders.filter((w) =>
    ['Confirmed', 'In progress', 'In transit', 'Delivered'].includes(w.status),
  );
  const openInv = db.invoices.filter((i) => ['Posted', 'Partially paid', 'Overdue'].includes(i.status));
  const receivables = openInv.reduce((s, i) => s + invoiceTotals(i).outstanding, 0);
  const overdue = db.invoices.filter((i) => i.status === 'Overdue');
  const collectedMonth = db.collections
    .filter((c) => c.date.startsWith('2026-11') && (c.status === 'Allocated' || c.status === 'Unallocated'))
    .reduce((s, c) => s + c.amount, 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const openEnq = db.enquiries.filter((e) => e.status === 'New' || e.status === 'Quoting');
  const openQt = db.quotations.filter((q) => ['Draft', 'Pending approval', 'Sent'].includes(q.status));
  const accepted = db.quotations.filter((q) => q.status === 'Accepted');
  const invoiced = openInv;
  const paid = db.invoices.filter((i) => i.status === 'Paid');
  const qtValue = (qs: typeof db.quotations) =>
    sum(qs.map((q) => sum(q.lines.map((l) => l.quantity * l.unitPrice))));

  const attention: HomeOverview['attention'] = [
    ...db.quotations
      .filter((q) => q.status === 'Pending approval')
      .map((q) => ({
        id: q.id,
        title: `${q.number} needs your approval`,
        detail: customerName(q.customerId),
        tone: 'warning' as const,
        to: `/quotations/${q.id}`,
      })),
    ...overdue.map((i) => ({
      id: i.id,
      title: `${i.number} is overdue`,
      detail: `${customerName(i.customerId)} · AED ${invoiceTotals(i).outstanding.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`,
      tone: 'danger' as const,
      to: `/invoices/${i.id}`,
    })),
    ...db.workOrders
      .filter((w) => w.status === 'Draft' && w.vendorAssignments.length === 0)
      .map((w) => ({
        id: w.id,
        title: `${w.number} has no vendor assigned`,
        detail: `${w.origin} → ${w.destination}`,
        tone: 'warning' as const,
        to: `/work-orders/${w.id}`,
      })),
    ...db.collections
      .filter((c) => c.status === 'Unallocated' || c.status === 'PDC pending')
      .map((c) => ({
        id: c.id,
        title:
          c.status === 'PDC pending' ? `${c.number} PDC due ${c.chequeDate}` : `${c.number} is unallocated`,
        detail: customerName(c.customerId),
        tone: 'info' as const,
        to: '/collections',
      })),
    ...db.contracts
      .filter((c) => c.status === 'Expiring')
      .map((c) => ({
        id: c.id,
        title: `${c.number} expires ${c.endDate}`,
        detail: customerName(c.customerId),
        tone: 'info' as const,
        to: `/contracts/${c.id}`,
      })),
  ];

  const shipments = db.workOrders
    .filter((w) => ['In progress', 'In transit', 'Confirmed'].includes(w.status))
    .map((w) => {
      const done = w.milestones.filter((m) => m.status === 'Done').length;
      return {
        id: w.id,
        number: w.number,
        mode: w.mode,
        origin: w.origin,
        destination: w.destination,
        status: w.status,
        eta: w.eta,
        customer: customerName(w.customerId),
        progress: Math.round((done / w.milestones.length) * 100),
        currentMilestone: w.milestones.find((m) => m.status === 'Current')?.label ?? '—',
      };
    });

  const modeMix = { Road: 0, Sea: 0, Air: 0 } as Record<TransportMode, number>;
  db.workOrders.filter((w) => w.status !== 'Cancelled').forEach((w) => (modeMix[w.mode] += 1));

  const pallets = sum(db.stockItems.map((s) => s.pallets));
  const nov = monthlyRevenue[monthlyRevenue.length - 1]!;
  const oct = monthlyRevenue[monthlyRevenue.length - 2]!;

  return {
    today: PROTO_TODAY,
    kpis: {
      activeWorkOrders: active.length,
      revenueMonth: nov.revenue,
      revenueDeltaPct: Math.round(((nov.revenue - oct.revenue) / oct.revenue) * 1000) / 10,
      revenueTrend: monthlyRevenue.map((m) => m.revenue),
      receivables: Math.round(receivables * 100) / 100,
      overdueCount: overdue.length,
      overdueAmount: sum(overdue.map((i) => invoiceTotals(i).outstanding)),
      collectedMonth,
      collectedTrend: [182000, 214000, 236000, 228000, 271000, Math.round(collectedMonth + 240000)],
    },
    pipeline: [
      { key: 'enq', label: 'Open enquiries', count: openEnq.length, value: 0, to: '/enquiries' },
      { key: 'qt', label: 'Quotations out', count: openQt.length, value: qtValue(openQt), to: '/quotations' },
      { key: 'acc', label: 'Confirmed', count: accepted.length, value: qtValue(accepted), to: '/quotations' },
      {
        key: 'wo',
        label: 'Jobs running',
        count: active.length,
        value: sum(active.map((w) => workOrderFinancials(w).revenue)),
        to: '/work-orders',
      },
      { key: 'inv', label: 'Invoiced, unpaid', count: invoiced.length, value: receivables, to: '/invoices' },
      { key: 'paid', label: 'Collected', count: paid.length, value: collectedMonth, to: '/collections' },
    ],
    attention,
    activeShipments: shipments,
    modeMix,
    warehouse: {
      palletsUsed: pallets,
      palletsCapacity: 180,
      skus: db.stockItems.filter((s) => s.qtyOnHand > 0).length,
      movementsThisWeek: db.stockMovements.filter((m) => m.date >= '2026-11-16').length,
    },
    revenueByMonth: monthlyRevenue,
    activity: db.activity.slice(0, 8),
  };
}

export function useHomeOverview() {
  return useQuery({ queryKey: ['home', 'overview'], queryFn: () => latency(buildOverview(), 220) });
}
