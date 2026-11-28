import { describe, expect, it } from 'vitest';
import type { CustomerRate, VendorRate } from '@/domain/types';
import { pickSellingRate, suggestSellingPrice } from './pricing';

const vr = (rate: number): VendorRate => ({
  id: `v${rate}`,
  vendorId: 'ven-1',
  serviceId: 's1',
  origin: 'Dubai',
  destination: 'Riyadh',
  unit: 'Truck',
  rate,
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
});

const cr = (id: string, price: number, extra: Partial<CustomerRate> = {}): CustomerRate => ({
  id,
  serviceId: 's1',
  unit: 'Truck',
  price,
  currency: 'AED',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  active: true,
  ...extra,
});

const today = '2026-11-23';
const lane = { origin: 'Dubai', destination: 'Riyadh' };

describe('selling price source order (MASTERS M2)', () => {
  it('uses the customer rate first', () => {
    const r = suggestSellingPrice({
      serviceId: 's1',
      customerId: 'c1',
      onDate: today,
      lane,
      customerRates: [cr('list', 900), cr('own', 800, { customerId: 'c1' })],
      vendorRates: [vr(500)],
    });
    expect(r).toMatchObject({ priceAed: 800, costAed: 500, source: 'Customer rate' });
  });

  it('falls back to the standard price list when the customer has no valid rate', () => {
    const r = suggestSellingPrice({
      serviceId: 's1',
      customerId: 'c1',
      onDate: today,
      lane,
      customerRates: [
        cr('list', 900),
        cr('expired', 700, { customerId: 'c1', validTo: '2026-06-30' }),
        cr('other', 600, { customerId: 'c2' }),
        cr('inactive', 650, { customerId: 'c1', active: false }),
      ],
      vendorRates: [vr(500)],
    });
    expect(r).toMatchObject({ priceAed: 900, source: 'Price list' });
  });

  it('falls back to cost + 20% when there is no selling rate', () => {
    const r = suggestSellingPrice({
      serviceId: 's1',
      customerId: 'c1',
      onDate: today,
      lane,
      customerRates: [cr('other-service', 100, { serviceId: 's2' })],
      vendorRates: [vr(500)],
    });
    expect(r).toMatchObject({ priceAed: 600, source: 'Cost + 20%' });
  });

  it('returns no price when there is neither a selling rate nor a vendor rate', () => {
    const r = suggestSellingPrice({
      serviceId: 's1',
      onDate: today,
      customerRates: [],
      vendorRates: [],
    });
    expect(r.priceAed).toBeUndefined();
    expect(r.source).toBeUndefined();
  });

  it('rebills disbursements at cost', () => {
    const r = suggestSellingPrice({
      serviceId: 's1',
      onDate: today,
      lane,
      isDisbursement: true,
      customerRates: [cr('list', 900)],
      vendorRates: [vr(500)],
    });
    expect(r).toMatchObject({ priceAed: 500, source: 'At cost' });
  });

  it('converts a foreign-currency selling rate to AED', () => {
    const r = suggestSellingPrice({
      serviceId: 's1',
      onDate: today,
      customerRates: [cr('usd', 100, { currency: 'USD' })],
      vendorRates: [],
      toAed: (n, c) => (c === 'USD' ? n * 3.6725 : n),
    });
    expect(r).toMatchObject({ priceAed: 367.25, source: 'Price list' });
  });
});

describe('pickSellingRate lanes', () => {
  const rates = [
    cr('general', 900),
    cr('lane', 950, { origin: 'dubai ', destination: 'RIYADH' }),
    cr('other-lane', 400, { origin: 'Dubai', destination: 'Muscat' }),
  ];

  it('prefers a lane match over a general rate', () => {
    expect(pickSellingRate(rates, { serviceId: 's1', onDate: today, lane })?.rate.id).toBe('lane');
  });

  it('never applies a rate for a different lane', () => {
    const r = pickSellingRate(rates, {
      serviceId: 's1',
      onDate: today,
      lane: { origin: 'Abu Dhabi', destination: 'Riyadh' },
    });
    expect(r?.rate.id).toBe('general');
  });

  it('uses only general rates when no lane is given', () => {
    expect(pickSellingRate(rates, { serviceId: 's1', onDate: today })?.rate.id).toBe('general');
  });
});
