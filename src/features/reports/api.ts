import { customerBalance } from '@/domain/balances';
import { useQuery } from '@tanstack/react-query';
import { daysBetween, invoiceTotals, workOrderFinancials } from '@/domain/calc';
import { monthlyRevenue, PROTO_TODAY } from '@/prototype/seed';
import { latency, protoDb } from '@/prototype/store';
import type { ServiceCategory } from '@/domain/types';
import { jobKindLabel, SERVICE_CATEGORIES } from '@/domain/workflow';

/**
 * Reporting view-models. REQUESTED contract (Phase 10 report specs). Prototype adapter computes
 * them from the in-memory sample data; the real API will aggregate server-side.
 */
export interface ReportsData {
  revenueByMonth: { month: string; revenue: number; cost: number; marginPct: number }[];
  topCustomers: { id: string; name: string; revenue: number; jobs: number }[];
  /** Transport lanes, plus warehouse sites and service locations grouped separately. */
  lanes: {
    lane: string;
    group: ServiceCategory;
    kind: string;
    jobs: number;
    revenue: number;
    marginPct: number;
  }[];
  jobsByType: { group: ServiceCategory; kind: string; jobs: number; revenue: number; marginPct: number }[];
  ageing: { bucket: string; amount: number; count: number }[];
  /** Exact position per customer from the shared balance model (`customerBalance`). */
  customerBalances: {
    id: string;
    code: string;
    name: string;
    ledgerCode: string;
    invoiced: number;
    received: number;
    advances: number;
    outstanding: number;
    notYetInvoiced: number;
    pdcPending: number;
    balance: number;
  }[];
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

  const byLane = new Map<
    string,
    { lane: string; group: ServiceCategory; kind: string; jobs: number; revenue: number; cost: number }
  >();
  for (const w of wos) {
    const lane =
      w.serviceCategory === 'Transport'
        ? `${w.origin} → ${w.destination}`
        : w.origin || 'Unspecified location';
    const kind = jobKindLabel(w.serviceCategory, w.mode);
    const key = `${w.serviceCategory}|${kind}|${lane}`;
    const f = workOrderFinancials(w);
    const cur = byLane.get(key) ?? { lane, group: w.serviceCategory, kind, jobs: 0, revenue: 0, cost: 0 };
    cur.jobs += 1;
    cur.revenue += f.revenue;
    cur.cost += f.cost;
    byLane.set(key, cur);
  }
  const pct = (rev: number, cost: number) => (rev ? Math.round(((rev - cost) / rev) * 1000) / 10 : 0);
  const order = (g: ServiceCategory) => SERVICE_CATEGORIES.indexOf(g);
  const lanes = [...byLane.values()]
    .map((v) => ({
      lane: v.lane,
      group: v.group,
      kind: v.kind,
      jobs: v.jobs,
      revenue: Math.round(v.revenue),
      marginPct: pct(v.revenue, v.cost),
    }))
    .sort((a, b) => order(a.group) - order(b.group) || b.revenue - a.revenue);

  const byType = new Map<
    string,
    { group: ServiceCategory; kind: string; jobs: number; revenue: number; cost: number }
  >();
  for (const w of wos) {
    const kind = jobKindLabel(w.serviceCategory, w.mode);
    const f = workOrderFinancials(w);
    const cur = byType.get(kind) ?? { group: w.serviceCategory, kind, jobs: 0, revenue: 0, cost: 0 };
    cur.jobs += 1;
    cur.revenue += f.revenue;
    cur.cost += f.cost;
    byType.set(kind, cur);
  }
  const jobsByType = [...byType.values()]
    .map((v) => ({
      group: v.group,
      kind: v.kind,
      jobs: v.jobs,
      revenue: Math.round(v.revenue),
      marginPct: pct(v.revenue, v.cost),
    }))
    .sort((a, b) => order(a.group) - order(b.group) || b.jobs - a.jobs);

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
    jobsByType,
    ageing: buckets.map((b) => ({ ...b, amount: Math.round(b.amount * 100) / 100 })),
    customerBalances: db.customers.map((c) => {
      const b = customerBalance(c.id, {
        salesOrders: db.salesOrders,
        invoices: db.invoices,
        collections: db.collections,
      });
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        ledgerCode: db.ledgerAccounts.find((a) => a.id === c.ledgerAccountId)?.code ?? '—',
        invoiced: b.invoiced,
        received: b.received,
        advances: b.advances + b.unallocated,
        outstanding: b.outstanding,
        notYetInvoiced: b.notYetInvoiced,
        pdcPending: b.pdcPending,
        balance: b.balance,
      };
    }),
  };
}

export function useReports() {
  return useQuery({ queryKey: ['reports', 'overview'], queryFn: () => latency(build(), 220) });
}
