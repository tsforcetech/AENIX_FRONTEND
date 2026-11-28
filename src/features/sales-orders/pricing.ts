/**
 * FLOW-003 WP-A — commercial pricing rules (prototype display maths; the backend is the authority).
 * Shared by quotations, sales orders and contracts (same feature group).
 */
import { linesRevenue } from '@/domain/calc';
import type { CustomerRate, IsoDate, PriceLine, VendorRate } from '@/domain/types';

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

/** MASTERS M2: where a suggested selling price came from (shown on the price line). */
export type PriceSource = 'Customer rate' | 'Price list' | 'Cost + 20%' | 'At cost';

export interface Lane {
  origin?: string;
  destination?: string;
}

const normText = (v?: string) => (v ?? '').trim().toLowerCase();

/** A selling rate with a lane applies only to that lane; one without a lane applies to any lane. */
function laneFit(r: Pick<CustomerRate, 'origin' | 'destination'>, lane?: Lane): 'lane' | 'any' | null {
  const o = normText(r.origin);
  const d = normText(r.destination);
  if (!o && !d) return 'any';
  if (!lane) return null;
  return (!o || o === normText(lane.origin)) && (!d || d === normText(lane.destination)) ? 'lane' : null;
}

/**
 * MASTERS M2: best valid selling rate for a service — the customer's own rate first, then the
 * standard price list (no customer). A lane-specific rate beats a general one; then the lowest price.
 */
export function pickSellingRate(
  rates: readonly CustomerRate[],
  q: { serviceId: string; customerId?: string; onDate: IsoDate; lane?: Lane },
): { rate: CustomerRate; source: 'Customer rate' | 'Price list' } | undefined {
  const valid = rates.filter(
    (r) => r.active && r.serviceId === q.serviceId && r.validFrom <= q.onDate && r.validTo >= q.onDate,
  );
  const best = (pool: readonly CustomerRate[]) => {
    const fits = pool.flatMap((r) => {
      const fit = laneFit(r, q.lane);
      return fit ? [{ r, fit }] : [];
    });
    const lane = fits.filter((x) => x.fit === 'lane');
    const use = lane.length ? lane : fits;
    return use.length ? use.reduce((a, b) => (b.r.price < a.r.price ? b : a)).r : undefined;
  };
  const own = q.customerId ? best(valid.filter((r) => r.customerId === q.customerId)) : undefined;
  if (own) return { rate: own, source: 'Customer rate' };
  const list = best(valid.filter((r) => !r.customerId));
  return list ? { rate: list, source: 'Price list' } : undefined;
}

/**
 * MASTERS M2: suggested selling price per unit in AED, in this order:
 * customer rate → standard price list → cheapest valid vendor rate + 20%.
 * Disbursements are rebilled at cost. `toAed` converts a selling rate's currency to AED.
 */
export function suggestSellingPrice(input: {
  serviceId: string;
  customerId?: string;
  onDate: IsoDate;
  lane?: Lane;
  customerRates: readonly CustomerRate[];
  vendorRates: readonly VendorRate[];
  isDisbursement?: boolean;
  toAed?: (amount: number, currency: string) => number;
}): { priceAed?: number; costAed?: number; source?: PriceSource; rate?: CustomerRate } {
  const costAed = cheapestValidRate(input.vendorRates, input.serviceId, input.onDate, input.lane);
  if (input.isDisbursement)
    return costAed !== undefined ? { priceAed: costAed, costAed, source: 'At cost' } : { costAed };
  const pick = pickSellingRate(input.customerRates, input);
  if (pick) {
    const conv = input.toAed ?? ((n: number) => n);
    return {
      priceAed: r2(conv(pick.rate.price, pick.rate.currency)),
      costAed,
      source: pick.source,
      rate: pick.rate,
    };
  }
  return costAed !== undefined
    ? { priceAed: rateCardPrice(costAed), costAed, source: 'Cost + 20%' }
    : { costAed };
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
