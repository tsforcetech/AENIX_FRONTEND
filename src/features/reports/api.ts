import { useQuery } from '@tanstack/react-query';
import { daysBetween, invoiceTotals, workOrderFinancials } from '@/domain/calc';
import { monthlyRevenue, PROTO_TODAY } from '@/prototype/seed';
import { latency, protoDb } from '@/prototype/store';

/**
 * Reporting view-models. REQUESTED contract (Phase 10 report specs). Prototype adapter computes
 * them from the in-memory sample data; the real API will aggregate server-side.
 */
export interface ReportsData {
  revenueByMonth: { month: string; revenue: number; cost: number; marginPct: number }[];
  topCustomers: { id: string; name: string; revenue: number; jobs: number }[];
  lanes: { lane: string; mode: string; jobs: number; revenue: number; marginPct: number }[];
  ageing: { bucket: string; amount: number; count: number }[];
}

function build(): ReportsData {
  const db = protoDb.get();
  const wos = db.workOrders.filter((w) => w.status !== 'Cancelled');

  const byCustomer = new Map<string, { revenue: number; jobs: number }>();
  for (const w of wos) {
    const cur = byCustomer.get(w.customerId) ?? { revenue: 0, jobs: 0 };
    cur.revenue += workOrderFinancials(w).revenue;
    cur.jobs += 1;
    byCustomer.set(w.customerId, cur);
  }
  const topCustomers = [...byCustomer.entries()]
    .map(([id, v]) => ({ id, name: db.customers.find((c) => c.id === id)?.name ?? '—', ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const byLane = new Map<string, { mode: string; jobs: number; revenue: number; cost: number }>();
  for (const w of wos) {
    const key = `${w.origin} → ${w.destination}`;
    const f = workOrderFinancials(w);
    const cur = byLane.get(key) ?? { mode: w.mode, jobs: 0, revenue: 0, cost: 0 };
    cur.jobs += 1;
    cur.revenue += f.revenue;
    cur.cost += f.cost;
    byLane.set(key, cur);
  }
  const lanes = [...byLane.entries()]
    .map(([lane, v]) => ({
      lane,
      mode: v.mode,
      jobs: v.jobs,
      revenue: Math.round(v.revenue),
      marginPct: v.revenue ? Math.round(((v.revenue - v.cost) / v.revenue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const buckets = [
    { bucket: 'Current', amount: 0, count: 0 },
    { bucket: '1–30 days', amount: 0, count: 0 },
    { bucket: '31–60 days', amount: 0, count: 0 },
    { bucket: '60+ days', amount: 0, count: 0 },
  ];
  for (const inv of db.invoices.filter((i) => ['Posted', 'Partially paid', 'Overdue'].includes(i.status))) {
    const late = daysBetween(inv.dueDate, PROTO_TODAY);
    const b = buckets[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3]!;
    b.amount += invoiceTotals(inv).outstanding;
    b.count += 1;
  }

  return {
    revenueByMonth: monthlyRevenue.map((m) => ({
      ...m,
      marginPct: Math.round(((m.revenue - m.cost) / m.revenue) * 1000) / 10,
    })),
    topCustomers,
    lanes,
    ageing: buckets.map((b) => ({ ...b, amount: Math.round(b.amount * 100) / 100 })),
  };
}

export function useReports() {
  return useQuery({ queryKey: ['reports', 'overview'], queryFn: () => latency(build(), 220) });
}
