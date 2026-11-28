/**
 * FLOW-003 WP-A — commercial pricing rules (prototype display maths; the backend is the authority).
 * Shared by quotations, sales orders and contracts (same feature group).
 */
import { linesRevenue } from '@/domain/calc';
import type { IsoDate, PriceLine, VendorRate } from '@/domain/types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Suggested sell price = cheapest valid vendor cost + 20% (the prototype rate card). */
export const RATE_CARD_MARKUP = 1.2;

/**
 * C3: cheapest vendor rate for a service that is valid on `onDate`.
 * A lane match (origin + destination) is preferred when one exists.
 */
export function cheapestValidRate(
  rates: readonly VendorRate[],
  serviceId: string,
  onDate: IsoDate,
  lane?: { origin?: string; destination?: string },
): number | undefined {
  const norm = (v?: string) => (v ?? '').trim().toLowerCase();
  const valid = rates.filter(
    (r) => r.serviceId === serviceId && r.validFrom <= onDate && r.validTo >= onDate,
  );
  const laneMatch = valid.filter(
    (r) => lane && norm(r.origin) === norm(lane.origin) && norm(r.destination) === norm(lane.destination),
  );
  const pool = laneMatch.length ? laneMatch : valid;
  return pool.length ? Math.min(...pool.map((r) => r.rate)) : undefined;
}

export function rateCardPrice(cost: number): number {
  return r2(cost * RATE_CARD_MARKUP);
}

/** C2: discount % of `unitPrice` below the rate-card `listPrice` (0 when at or above list, or no list). */
export function discountPct(listPrice: number | undefined, unitPrice: number): number {
  if (!listPrice || listPrice <= 0 || unitPrice >= listPrice) return 0;
  return r1(((listPrice - unitPrice) / listPrice) * 100);
}

export interface CheckLine {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  minimumCharge?: number;
  /** Rate-card price per unit in AED, when the service has a valid vendor rate. */
  listPriceAed?: number;
}

/**
 * C2: values the approval matrix is checked against.
 * Prices are in the document currency; `rate` converts them to AED for the rate-card comparison.
 */
export function quotationApprovalCheck(lines: readonly CheckLine[], rate = 1) {
  const maxDiscountPct = lines.reduce(
    (m, l) => Math.max(m, discountPct(l.listPriceAed, l.unitPrice * rate)),
    0,
  );
  const revenue = linesRevenue([...lines]);
  const cost = r2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
  const marginPct = revenue > 0 ? r1(((revenue - cost) / revenue) * 100) : 0;
  return { maxDiscountPct, marginPct, revenue, cost };
}

/** C6: fuel surcharge = pct % of the transport lines' subtotal. */
export function fuelSurchargeAmount(
  lines: readonly Pick<PriceLine, 'serviceId' | 'quantity' | 'unitPrice' | 'minimumCharge'>[],
  pct: number,
  isTransport: (serviceId: string) => boolean,
): number {
  if (!pct || pct <= 0) return 0;
  const base = linesRevenue(lines.filter((l) => isTransport(l.serviceId)));
  return r2((base * pct) / 100);
}

/** C8: change in order value (excl. VAT) between two versions of the lines. */
export function valueChange(
  before: readonly Pick<PriceLine, 'quantity' | 'unitPrice' | 'minimumCharge'>[],
  after: readonly Pick<PriceLine, 'quantity' | 'unitPrice' | 'minimumCharge'>[],
): number {
  return r2(linesRevenue([...after]) - linesRevenue([...before]));
}
