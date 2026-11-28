import { describe, expect, it } from 'vitest';
import {
  accumulatedTo,
  bookValue,
  depreciationFor,
  disposalGainLoss,
  monthlyCharge,
  nextMonth,
  periodEnd,
} from './fixedAssets';
import type { FixedAsset } from './types';

const asset = (over: Partial<FixedAsset> = {}): FixedAsset => ({
  id: 'fa',
  number: 'FA-001',
  name: 'Truck',
  category: 'Vehicles',
  acquisitionDate: '2026-01-15',
  cost: 130_000,
  residualValue: 10_000,
  usefulLifeMonths: 60,
  method: 'Straight-line',
  location: 'Yard',
  accumulatedDepreciation: 0,
  status: 'Active',
  ...over,
});

describe('fixed assets', () => {
  it('charges straight-line per month from the month after acquisition', () => {
    expect(monthlyCharge(asset())).toBe(2000);
    expect(depreciationFor(asset(), '2026-01')).toBe(0);
    expect(depreciationFor(asset(), '2026-02')).toBe(2000);
  });
  it('does not post a month twice, nor beyond the depreciable amount', () => {
    expect(
      depreciationFor(asset({ depreciatedTo: '2026-03', accumulatedDepreciation: 4000 }), '2026-03'),
    ).toBe(0);
    expect(
      depreciationFor(asset({ accumulatedDepreciation: 119_500, depreciatedTo: '2030-12' }), '2031-01'),
    ).toBe(500);
    expect(depreciationFor(asset({ accumulatedDepreciation: 120_000 }), '2031-02')).toBe(0);
    expect(depreciationFor(asset({ status: 'Disposed' }), '2026-05')).toBe(0);
  });
  it('computes book value, catch-up accumulation and disposal result', () => {
    expect(accumulatedTo(asset(), '2026-10')).toBe(18_000);
    expect(bookValue(asset({ accumulatedDepreciation: 18_000 }))).toBe(112_000);
    expect(disposalGainLoss(asset({ accumulatedDepreciation: 18_000 }), 100_000)).toBe(-12_000);
  });
  it('handles period helpers', () => {
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(periodEnd('2026-02')).toBe('2026-02-28');
  });
});
