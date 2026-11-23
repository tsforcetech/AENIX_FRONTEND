import type { Invoice, PriceLine, VendorBill, WorkOrder } from './types';

/** Prototype display maths only — the backend is the calculation authority for real data. */
export const VAT_RATE = 0.05;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function linesRevenue(lines: PriceLine[]): number {
  return round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
}

export function linesCost(lines: PriceLine[]): number {
  return round2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
}

export function marginPct(revenue: number, cost: number): number {
  return revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0;
}

export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'paid'>) {
  const subtotal = round2(inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const vat = round2(inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice * l.vatRate, 0));
  const total = round2(subtotal + vat);
  return { subtotal, vat, total, outstanding: round2(total - inv.paid) };
}

export function billTotals(bill: Pick<VendorBill, 'amount' | 'vat' | 'paid'>) {
  const total = round2(bill.amount + bill.vat);
  return { total, outstanding: round2(total - bill.paid) };
}

export function workOrderFinancials(wo: Pick<WorkOrder, 'lines' | 'vendorAssignments'>) {
  const revenue = linesRevenue(wo.lines);
  const assigned = round2(wo.vendorAssignments.reduce((s, a) => s + a.agreedCost, 0));
  const cost = assigned || linesCost(wo.lines);
  return { revenue, cost, margin: round2(revenue - cost), marginPct: marginPct(revenue, cost) };
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}
