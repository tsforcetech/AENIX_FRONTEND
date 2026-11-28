/**
 * FLOW-003 W13 — storage charge with free days and a minimum monthly charge
 * (prototype maths; the backend billing engine is the authority).
 */
import type { StorageBasis } from '@/domain/types';

export interface StorageChargeInput {
  basis: StorageBasis;
  /** Gross quantity in basis units for the whole period (sq.ft, pallet-days or CBM-days). */
  quantity: number;
  rate: number;
  daysInPeriod: number;
  /** Free storage days at the start of the period (day-based bases only). */
  freeDays?: number;
  /** Minimum charge for the period in AED (0 / undefined = none). */
  minimumCharge?: number;
}

export interface StorageCharge {
  /** Quantity charged after free days. */
  chargeableQty: number;
  /** chargeableQty × rate. */
  computed: number;
  /** Amount billed: the higher of computed and the minimum. */
  amount: number;
  minimumApplied: boolean;
  /** Top-up added to reach the minimum (0 when not applied). */
  topUp: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function storageCharge(input: StorageChargeInput): StorageCharge {
  const free = Math.max(0, Math.min(input.freeDays ?? 0, input.daysInPeriod));
  const dayBased = input.basis !== 'Sq.ft per period';
  const chargeableQty =
    dayBased && free > 0 && input.daysInPeriod > 0
      ? r2((input.quantity * (input.daysInPeriod - free)) / input.daysInPeriod)
      : input.quantity;
  const computed = r2(chargeableQty * input.rate);
  const min = input.minimumCharge ?? 0;
  const minimumApplied = min > 0 && computed < min;
  return {
    chargeableQty,
    computed,
    amount: minimumApplied ? min : computed,
    minimumApplied,
    topUp: minimumApplied ? r2(min - computed) : 0,
  };
}
