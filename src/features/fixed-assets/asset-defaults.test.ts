import { describe, expect, it } from 'vitest';
import { categoryPrefill, residualFromPct } from './asset-defaults';

describe('asset category defaults (MASTERS M2)', () => {
  it('computes the residual value as % of cost', () => {
    expect(residualFromPct(185000, 15)).toBe(27750);
    expect(residualFromPct(1234.56, 10)).toBe(123.46);
    expect(residualFromPct(0, 15)).toBe(0);
    expect(residualFromPct(NaN, 15)).toBe(0);
    expect(residualFromPct(5000, 0)).toBe(0);
  });

  it('pre-fills useful life and residual value', () => {
    expect(categoryPrefill({ usefulLifeMonths: 60, residualPct: 10 }, '50000')).toEqual({
      usefulLifeMonths: '60',
      residualValue: '5000',
    });
    expect(categoryPrefill({ usefulLifeMonths: 36, residualPct: 0 }, '')).toEqual({
      usefulLifeMonths: '36',
      residualValue: '0',
    });
  });
});
