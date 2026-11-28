/**
 * Fixed asset register — straight-line depreciation (PROTOTYPE RULES, accountant to confirm
 * method, useful lives and residual values). Depreciation starts the month after acquisition.
 */
import type { FixedAsset } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** YYYY-MM of a date. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** Months from a to b (YYYY-MM), b − a. */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number) as [number, number];
  const [yb, mb] = b.split('-').map(Number) as [number, number];
  return (yb - ya) * 12 + (mb - ma);
}

export function nextMonth(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Last day of a YYYY-MM period. */
export function periodEnd(period: string): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export const depreciableAmount = (a: Pick<FixedAsset, 'cost' | 'residualValue'>) =>
  Math.max(0, a.cost - a.residualValue);

export const monthlyCharge = (a: Pick<FixedAsset, 'cost' | 'residualValue' | 'usefulLifeMonths'>) =>
  a.usefulLifeMonths > 0 ? r2(depreciableAmount(a) / a.usefulLifeMonths) : 0;

export const bookValue = (a: Pick<FixedAsset, 'cost' | 'accumulatedDepreciation'>) =>
  r2(a.cost - a.accumulatedDepreciation);

/**
 * Depreciation due for `period` (YYYY-MM): zero if the asset is disposed, acquired in or after the
 * period, already posted for it, or fully depreciated; the last month takes the remainder.
 */
export function depreciationFor(a: FixedAsset, period: string): number {
  if (a.status !== 'Active') return 0;
  if (monthsBetween(monthOf(a.acquisitionDate), period) < 1) return 0;
  if (a.depreciatedTo && monthsBetween(a.depreciatedTo, period) < 1) return 0;
  const remaining = r2(depreciableAmount(a) - a.accumulatedDepreciation);
  if (remaining <= 0) return 0;
  return Math.min(monthlyCharge(a), remaining);
}

/** Accumulated depreciation if every month up to and including `period` had been posted. */
export function accumulatedTo(
  a: Pick<FixedAsset, 'cost' | 'residualValue' | 'usefulLifeMonths' | 'acquisitionDate'>,
  period: string,
): number {
  const months = Math.max(0, Math.min(a.usefulLifeMonths, monthsBetween(monthOf(a.acquisitionDate), period)));
  return Math.min(depreciableAmount(a), r2(monthlyCharge(a) * months));
}

/** Disposal: gain (+) or loss (−) = proceeds − book value. */
export const disposalGainLoss = (a: Pick<FixedAsset, 'cost' | 'accumulatedDepreciation'>, proceeds: number) =>
  r2(proceeds - bookValue(a));
