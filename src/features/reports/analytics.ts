/**
 * FLOW-003 X8 / T10 / A15 report computations (pure; prototype). The real API aggregates
 * server-side under the Phase 10 report specifications.
 */
import { linesRevenue } from '@/domain/calc';
import { toAed } from '@/domain/controls';
import type {
  Collection,
  Customer,
  Invoice,
  IsoDate,
  PurchaseOrder,
  StockItem,
  Variance,
  Vendor,
  VendorPayment,
  WarehouseLocation,
  WorkOrder,
} from '@/domain/types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const day = (iso: string) => iso.slice(0, 10);
const daysFrom = (from: IsoDate, to: IsoDate) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

// ---------- (a) Job profitability ----------
export interface JobProfitRow {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  status: WorkOrder['status'];
  /** AED, excl. VAT and disbursements. */
  revenue: number;
  revenueSource: 'Invoiced' | 'Job lines';
  vendorCost: number;
  internalCost: number;
  grossProfit: number;
  marginPct: number;
}

export interface CustomerProfitRow {
  customerId: string;
  customerName: string;
  jobs: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
}

/** Invoice revenue in AED excl. VAT, without disbursements (rebilled at cost, not revenue). */
export function invoiceRevenueAed(inv: Pick<Invoice, 'lines' | 'currency' | 'exchangeRate'>): number {
  const net = inv.lines.filter((l) => !l.isDisbursement).reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  return toAed(net, inv.currency ?? 'AED', inv.exchangeRate);
}

export function jobProfitability(input: {
  workOrders: readonly WorkOrder[];
  invoices: readonly Invoice[];
  purchaseOrders: readonly PurchaseOrder[];
  customers: readonly Pick<Customer, 'id' | 'name'>[];
}): { jobs: JobProfitRow[]; customers: CustomerProfitRow[] } {
  const name = (id: string) => input.customers.find((c) => c.id === id)?.name ?? '—';
  const jobs = input.workOrders
    .filter((w) => w.status !== 'Cancelled')
    .map((w): JobProfitRow => {
      const invs = input.invoices.filter(
        (i) => i.workOrderId === w.id && i.status !== 'Draft' && i.status !== 'Cancelled',
      );
      const revenue = invs.length
        ? invs.reduce((s, i) => s + invoiceRevenueAed(i), 0)
        : linesRevenue(w.lines);
      const pos = input.purchaseOrders.filter((p) => p.workOrderId === w.id && p.status !== 'Cancelled');
      const vendorCost = pos.length
        ? pos.reduce((s, p) => s + p.amount, 0)
        : w.vendorAssignments.reduce((s, a) => s + a.agreedCost, 0);
      const internalCost = (w.internalCosts ?? []).reduce((s, c) => s + c.quantity * c.rate, 0);
      const gp = revenue - vendorCost - internalCost;
      return {
        id: w.id,
        number: w.number,
        customerId: w.customerId,
        customerName: name(w.customerId),
        status: w.status,
        revenue: r2(revenue),
        revenueSource: invs.length ? 'Invoiced' : 'Job lines',
        vendorCost: r2(vendorCost),
        internalCost: r2(internalCost),
        grossProfit: r2(gp),
        marginPct: pct(gp, revenue),
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);

  const byCustomer = new Map<string, CustomerProfitRow>();
  for (const j of jobs) {
    const c = byCustomer.get(j.customerId) ?? {
      customerId: j.customerId,
      customerName: j.customerName,
      jobs: 0,
      revenue: 0,
      cost: 0,
      grossProfit: 0,
      marginPct: 0,
    };
    c.jobs += 1;
    c.revenue += j.revenue;
    c.cost += j.vendorCost + j.internalCost;
    c.grossProfit += j.grossProfit;
    byCustomer.set(j.customerId, c);
  }
  const customers = [...byCustomer.values()]
    .map((c) => ({
      ...c,
      revenue: r2(c.revenue),
      cost: r2(c.cost),
      grossProfit: r2(c.grossProfit),
      marginPct: pct(c.grossProfit, c.revenue),
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);
  return { jobs, customers };
}

// ---------- (b) Vendor performance ----------
export interface VendorPerformanceRow {
  vendorId: string;
  vendorName: string;
  jobs: number;
  /** Jobs with a recorded delivery time (POD, stop or final milestone). */
  delivered: number;
  onTime: number;
  /** null when nothing has been delivered yet. */
  onTimePct: number | null;
  variances: number;
}

/** Latest delivery time the vendor recorded on the job (POD by the vendor, done stops, final milestone). */
export function deliveredAt(w: WorkOrder, vendorId: string): string | undefined {
  const times: string[] = [];
  for (const r of w.customerRequests) if (r.pod && r.pod.vendorId === vendorId) times.push(r.pod.deliveredAt);
  for (const s of w.stops ?? [])
    if (s.type === 'Delivery' && s.status === 'Done' && s.actualAt) times.push(s.actualAt);
  const last = w.milestones[w.milestones.length - 1];
  if (w.milestones.length && w.milestones.every((m) => m.status === 'Done') && last?.at) times.push(last.at);
  return times.sort().at(-1);
}

export function vendorPerformance(input: {
  vendors: readonly Pick<Vendor, 'id' | 'name'>[];
  workOrders: readonly WorkOrder[];
  variances: readonly Pick<Variance, 'vendorId'>[];
}): VendorPerformanceRow[] {
  return input.vendors
    .map((v) => {
      const jobs = input.workOrders.filter(
        (w) => w.status !== 'Cancelled' && w.vendorAssignments.some((a) => a.vendorId === v.id),
      );
      let delivered = 0;
      let onTime = 0;
      for (const w of jobs) {
        const at = deliveredAt(w, v.id);
        if (!at) continue;
        delivered += 1;
        if (day(at) <= w.eta) onTime += 1;
      }
      return {
        vendorId: v.id,
        vendorName: v.name,
        jobs: jobs.length,
        delivered,
        onTime,
        onTimePct: delivered ? pct(onTime, delivered) : null,
        variances: input.variances.filter((x) => x.vendorId === v.id).length,
      };
    })
    .filter((r) => r.jobs > 0 || r.variances > 0)
    .sort((a, b) => (b.onTimePct ?? -1) - (a.onTimePct ?? -1) || b.jobs - a.jobs);
}

// ---------- (c) Warehouse occupancy ----------
export interface OccupancyRow {
  zone: WarehouseLocation['zone'] | 'Not in a bin';
  locations: number;
  capacity: number;
  used: number;
  /** null when there is no capacity (unassigned stock). */
  pct: number | null;
}

export function warehouseOccupancy(
  locations: readonly WarehouseLocation[],
  stock: readonly Pick<StockItem, 'locationId' | 'location' | 'pallets' | 'warehouse'>[],
): OccupancyRow[] {
  const active = locations.filter((l) => l.active);
  const zones = new Map<OccupancyRow['zone'], OccupancyRow>();
  for (const l of active) {
    const z = zones.get(l.zone) ?? { zone: l.zone, locations: 0, capacity: 0, used: 0, pct: 0 };
    z.locations += 1;
    z.capacity += l.capacityPallets;
    zones.set(l.zone, z);
  }
  let unassigned = 0;
  for (const s of stock) {
    if (s.pallets <= 0) continue;
    const loc =
      active.find((l) => l.id === s.locationId) ??
      active.find((l) => l.code === s.location && (!s.warehouse || l.warehouse === s.warehouse)) ??
      active.find((l) => l.code === s.location);
    if (loc) zones.get(loc.zone)!.used += s.pallets;
    else unassigned += s.pallets;
  }
  const rows: OccupancyRow[] = [...zones.values()].map((z) => ({ ...z, pct: pct(z.used, z.capacity) }));
  if (unassigned > 0)
    rows.push({ zone: 'Not in a bin', locations: 0, capacity: 0, used: unassigned, pct: null });
  return rows;
}

// ---------- (d) PDC maturity ----------
export interface OpenPdc {
  id: string;
  number: string;
  direction: 'Received' | 'Issued';
  partyId: string;
  chequeDate: IsoDate;
  amount: number;
  daysLeft: number;
}

const OPEN_PDC = new Set(['Pending', 'Deposited']);

/** Post-dated cheques not yet cleared or bounced: received from customers, issued to vendors. */
export function openPdcs(
  collections: readonly Collection[],
  payments: readonly VendorPayment[],
  today: IsoDate,
): OpenPdc[] {
  const received = collections
    .filter(
      (c) =>
        !!c.chequeDate &&
        (c.pdcStatus ? OPEN_PDC.has(c.pdcStatus) : c.status === 'PDC pending') &&
        c.status !== 'Bounced',
    )
    .map((c) => ({
      id: c.id,
      number: c.number,
      direction: 'Received' as const,
      partyId: c.customerId,
      chequeDate: c.chequeDate!,
      amount: c.amount,
      daysLeft: daysFrom(today, c.chequeDate!),
    }));
  const issued = payments
    .filter(
      (p) =>
        !!p.chequeDate &&
        p.status !== 'Cancelled' &&
        (p.pdcStatus ? OPEN_PDC.has(p.pdcStatus) : p.status === 'PDC issued'),
    )
    .map((p) => ({
      id: p.id,
      number: p.number,
      direction: 'Issued' as const,
      partyId: p.vendorId,
      chequeDate: p.chequeDate!,
      amount: p.amount,
      daysLeft: daysFrom(today, p.chequeDate!),
    }));
  return [...received, ...issued].sort((a, b) => a.chequeDate.localeCompare(b.chequeDate));
}

export interface PdcBucket {
  bucket: string;
  received: number;
  receivedCount: number;
  issued: number;
  issuedCount: number;
}

export const PDC_BUCKETS = ['Past cheque date', 'Next 30 days', '31–60 days', '61–90 days', 'After 90 days'];

export function pdcMaturity(pdcs: readonly OpenPdc[]): PdcBucket[] {
  const rows = PDC_BUCKETS.map((bucket) => ({
    bucket,
    received: 0,
    receivedCount: 0,
    issued: 0,
    issuedCount: 0,
  }));
  for (const p of pdcs) {
    const i = p.daysLeft < 0 ? 0 : p.daysLeft <= 30 ? 1 : p.daysLeft <= 60 ? 2 : p.daysLeft <= 90 ? 3 : 4;
    const row = rows[i]!;
    if (p.direction === 'Received') {
      row.received = r2(row.received + p.amount);
      row.receivedCount += 1;
    } else {
      row.issued = r2(row.issued + p.amount);
      row.issuedCount += 1;
    }
  }
  return rows;
}
