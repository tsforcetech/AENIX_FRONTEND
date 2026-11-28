/** FLOW-003 X6 portal helpers (pure; prototype). */
import type {
  IsoDateTime,
  Milestone,
  StockItem,
  VendorBill,
  VendorPayment,
  WarehouseLocation,
} from '@/domain/types';
import { toCsv } from '@/features/audit/csv';

// ---------- Customer: stock statement ----------
export interface StockStatementRow {
  id: string;
  sku: string;
  description: string;
  batch: string;
  expiry: string;
  location: string;
  qty: number;
  uom: string;
  status: string;
}

export function stockStatementRows(
  items: readonly StockItem[],
  locations: readonly Pick<WarehouseLocation, 'id' | 'code' | 'warehouse'>[],
  customerId: string,
): StockStatementRow[] {
  return items
    .filter((s) => s.customerId === customerId && s.qtyOnHand > 0)
    .map((s) => {
      const loc = s.locationId ? locations.find((l) => l.id === s.locationId) : undefined;
      return {
        id: s.id,
        sku: s.sku,
        description: s.description,
        batch: s.batch ?? '',
        expiry: s.expiryDate ?? '',
        location: loc ? `${loc.warehouse} ${loc.code}` : [s.warehouse, s.location].filter(Boolean).join(' '),
        qty: s.qtyOnHand,
        uom: s.uom,
        status: s.stockStatus ?? 'Available',
      };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.expiry.localeCompare(b.expiry));
}

export function stockStatementCsv(rows: readonly StockStatementRow[]): string {
  return toCsv(
    ['SKU', 'Description', 'Batch', 'Expiry', 'Location', 'Qty', 'UOM', 'Status'],
    rows.map((r) => [r.sku, r.description, r.batch, r.expiry, r.location, r.qty, r.uom, r.status]),
  );
}

// ---------- Vendor: payment status per bill ----------
export type BillPaymentStatus = 'Paid' | 'Partly paid' | 'Unpaid';

export function billPayment(
  bill: Pick<VendorBill, 'id' | 'amount' | 'vat' | 'paid'>,
  payments: readonly Pick<VendorPayment, 'number' | 'status' | 'allocations' | 'date'>[],
): { status: BillPaymentStatus; vouchers: { number: string; amount: number; date: string }[] } {
  const total = Math.round((bill.amount + bill.vat) * 100) / 100;
  const vouchers = payments
    .filter((p) => p.status !== 'Cancelled' && p.status !== 'Pending approval')
    .flatMap((p) =>
      p.allocations
        .filter((a) => a.billId === bill.id && a.amount > 0)
        .map((a) => ({ number: p.number, amount: a.amount, date: p.date })),
    );
  const status: BillPaymentStatus =
    bill.paid <= 0 ? 'Unpaid' : bill.paid + 0.005 >= total ? 'Paid' : 'Partly paid';
  return { status, vouchers };
}

// ---------- Vendor: milestone update (T2) ----------
/**
 * Marks the current milestone done and moves "Current" to the next pending one.
 * Returns null when every milestone is already done.
 */
export function advanceMilestone(
  milestones: readonly Milestone[],
  at: IsoDateTime,
): { milestones: Milestone[]; done: string } | null {
  const idx = milestones.findIndex((m) => m.status === 'Current');
  const i = idx >= 0 ? idx : milestones.findIndex((m) => m.status === 'Pending');
  if (i < 0) return null;
  const next = milestones.findIndex((m, j) => j > i && m.status === 'Pending');
  return {
    done: milestones[i]!.label,
    milestones: milestones.map((m, j) =>
      j === i ? { ...m, status: 'Done', at } : j === next ? { ...m, status: 'Current' } : m,
    ),
  };
}
