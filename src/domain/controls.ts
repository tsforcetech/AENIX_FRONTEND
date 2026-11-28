/**
 * FLOW-003 shared business controls (prototype rules — the backend is the authority).
 * Credit check (C5), approval matrix (X2), period lock (A14), currency (C10), FEFO (W6).
 */
import type {
  ApprovalDocType,
  ApprovalRule,
  CompanyProfile,
  Currency,
  Customer,
  IsoDate,
  StockItem,
} from './types';

// ---------- C5: credit check ----------
export interface CreditCheckResult {
  blocked: boolean;
  reasons: string[];
  /** Exposure after this order (AED). */
  exposure: number;
  available: number;
}

/**
 * Exposure = open customer balance (AED) + confirmed-but-uninvoiced orders + this order.
 * Blocked when the customer is On hold / Inactive, or exposure exceeds the credit limit,
 * or any invoice is overdue beyond `overdueGraceDays`.
 */
export function creditCheck(input: {
  customer: Pick<Customer, 'creditLimit' | 'status' | 'name'>;
  openBalance: number;
  uninvoicedOrders: number;
  orderValue: number;
  oldestOverdueDays?: number;
  overdueGraceDays?: number;
}): CreditCheckResult {
  const exposure = input.openBalance + input.uninvoicedOrders + input.orderValue;
  const reasons: string[] = [];
  if (input.customer.status === 'On hold') reasons.push(`${input.customer.name} is on hold`);
  if (input.customer.status === 'Inactive') reasons.push(`${input.customer.name} is inactive`);
  if (exposure > input.customer.creditLimit)
    reasons.push(
      `Exposure ${Math.round(exposure).toLocaleString('en-US')} exceeds the credit limit ${input.customer.creditLimit.toLocaleString('en-US')}`,
    );
  const grace = input.overdueGraceDays ?? 30;
  if ((input.oldestOverdueDays ?? 0) > grace)
    reasons.push(`An invoice is overdue by ${input.oldestOverdueDays} days (more than ${grace})`);
  return {
    blocked: reasons.length > 0,
    reasons,
    exposure,
    available: input.customer.creditLimit - exposure,
  };
}

// ---------- X2: approval matrix ----------
/** Returns the matching active rule when `value` reaches its threshold (0 = always). */
export function approvalRuleFor(
  rules: readonly ApprovalRule[],
  docType: ApprovalDocType,
  value: number,
): ApprovalRule | undefined {
  return rules.find(
    (r) =>
      r.active &&
      r.docType === docType &&
      (docType === 'Quotation margin % below' ? value < r.threshold : value >= r.threshold),
  );
}

// ---------- A14: period lock ----------
export function isPeriodLocked(company: Pick<CompanyProfile, 'lockedUntil'>, date: IsoDate): boolean {
  return !!company.lockedUntil && date <= company.lockedUntil;
}

export class PeriodLockedError extends Error {
  constructor(date: IsoDate, lockedUntil: IsoDate) {
    super(
      `The period is closed up to ${lockedUntil}. Post on ${date} is not allowed — use a date in an open period.`,
    );
  }
}

export function assertOpenPeriod(company: Pick<CompanyProfile, 'lockedUntil'>, date: IsoDate): void {
  if (isPeriodLocked(company, date)) throw new PeriodLockedError(date, company.lockedUntil as IsoDate);
}

// ---------- C10: currency ----------
export const CURRENCIES: readonly Currency[] = ['AED', 'USD', 'EUR', 'SAR'];
/** Prototype reference rates to AED (the backend/accountant sets the daily rate). */
export const DEFAULT_RATES: Record<string, number> = { AED: 1, USD: 3.6725, EUR: 3.98, SAR: 0.979 };

export function toAed(amount: number, currency: Currency = 'AED', rate?: number): number {
  const r = currency === 'AED' ? 1 : (rate ?? DEFAULT_RATES[currency] ?? 1);
  return Math.round(amount * r * 100) / 100;
}

// ---------- S6: minimum charge ----------
export function lineAmount(quantity: number, unitPrice: number, minimumCharge?: number): number {
  const raw = Math.round(quantity * unitPrice * 100) / 100;
  return minimumCharge && raw < minimumCharge ? minimumCharge : raw;
}

// ---------- W6: FEFO pick suggestion ----------
export interface PickSuggestion {
  lot: StockItem;
  qty: number;
}

/**
 * First-expiry-first-out (then first-in-first-out) across AVAILABLE lots of one SKU.
 * Lots without an expiry date go after dated lots. Returns `short` > 0 when stock is insufficient.
 */
export function suggestPicks(
  lots: readonly StockItem[],
  sku: string,
  qty: number,
): { picks: PickSuggestion[]; short: number } {
  const eligible = lots
    .filter((l) => l.sku === sku && (l.stockStatus ?? 'Available') === 'Available' && l.qtyOnHand > 0)
    .sort((a, b) => {
      const ea = a.expiryDate ?? '9999-12-31';
      const eb = b.expiryDate ?? '9999-12-31';
      return ea === eb ? a.receivedAt.localeCompare(b.receivedAt) : ea.localeCompare(eb);
    });
  const picks: PickSuggestion[] = [];
  let left = qty;
  for (const lot of eligible) {
    if (left <= 0) break;
    const take = Math.min(lot.qtyOnHand, left);
    picks.push({ lot, qty: take });
    left -= take;
  }
  return { picks, short: Math.max(0, left) };
}

/** Days until a date (negative = past). */
export function daysUntil(date: IsoDate, today: IsoDate): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}
