import { describe, expect, it } from 'vitest';
import { storageCharge } from './charge';

describe('storageCharge', () => {
  it('charges quantity × rate when there is no minimum or free days', () => {
    expect(storageCharge({ basis: 'Pallet-day', quantity: 300, rate: 3.5, daysInPeriod: 30 })).toEqual({
      chargeableQty: 300,
      computed: 1050,
      amount: 1050,
      minimumApplied: false,
      topUp: 0,
    });
  });

  it('removes free days pro rata on day-based bases', () => {
    const c = storageCharge({ basis: 'Pallet-day', quantity: 300, rate: 2, daysInPeriod: 30, freeDays: 6 });
    expect(c.chargeableQty).toBe(240);
    expect(c.amount).toBe(480);
  });

  it('does not apply free days to area billing', () => {
    const c = storageCharge({
      basis: 'Sq.ft per period',
      quantity: 2600,
      rate: 1,
      daysInPeriod: 30,
      freeDays: 10,
    });
    expect(c.chargeableQty).toBe(2600);
  });

  it('applies the minimum charge with a top-up', () => {
    const c = storageCharge({
      basis: 'Pallet-day',
      quantity: 100,
      rate: 3,
      daysInPeriod: 30,
      minimumCharge: 500,
    });
    expect(c).toMatchObject({ computed: 300, amount: 500, minimumApplied: true, topUp: 200 });
  });

  it('caps free days at the period length', () => {
    const c = storageCharge({ basis: 'CBM-day', quantity: 90, rate: 1, daysInPeriod: 30, freeDays: 45 });
    expect(c.chargeableQty).toBe(0);
  });
});
