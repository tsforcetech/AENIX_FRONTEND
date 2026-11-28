import { describe, expect, it } from 'vitest';
import type { StockItem, WarehouseLocation } from '@/domain/types';
import { estimatePallets, expiryState, maxCountDifference, occupancy, suggestPutaway } from './floor';

const loc = (id: string, code: string, zone: WarehouseLocation['zone'], cap = 10, active = true) =>
  ({ id, warehouse: 'WH', code, zone, capacityPallets: cap, active }) satisfies WarehouseLocation;

const lot = (p: Partial<StockItem>): StockItem => ({
  id: 'l',
  sku: 'SKU-1',
  customerId: 'c1',
  description: '',
  warehouse: 'WH',
  location: '',
  qtyOnHand: 10,
  uom: 'Ctn',
  pallets: 1,
  receivedAt: '2026-11-01',
  ...p,
});

const locations = [
  loc('a1', 'A-01', 'Ambient', 10),
  loc('a2', 'A-02', 'Ambient', 10),
  loc('b1', 'B-FLOOR', 'Bulk floor', 50),
  loc('q1', 'Q-01', 'Quarantine', 5),
  loc('x1', 'A-00', 'Ambient', 10, false),
];

describe('occupancy', () => {
  it('sums pallets of lots with stock by locationId or legacy code', () => {
    const occ = occupancy(locations, [
      lot({ locationId: 'a1', pallets: 4 }),
      lot({ location: 'a-01', pallets: 2 }),
      lot({ locationId: 'a1', pallets: 9, qtyOnHand: 0 }),
    ]);
    const a1 = occ.find((o) => o.location.id === 'a1')!;
    expect(a1).toMatchObject({ used: 6, free: 4, pct: 60, lots: 2 });
  });

  it('adds planned pallets', () => {
    const occ = occupancy(locations, [], new Map([['a2', 3]]));
    expect(occ.find((o) => o.location.id === 'a2')!.used).toBe(3);
  });
});

describe('suggestPutaway', () => {
  it('prefers the bin already holding the same SKU of the same customer', () => {
    const stock = [lot({ locationId: 'a2', pallets: 2 })];
    expect(suggestPutaway({ sku: 'sku-1', customerId: 'c1', pallets: 3 }, locations, stock)?.id).toBe('a2');
  });

  it('ignores another customer’s SKU and takes the first ambient bin with space', () => {
    const stock = [lot({ locationId: 'a2', customerId: 'c2' }), lot({ locationId: 'a1', pallets: 9 })];
    expect(suggestPutaway({ sku: 'SKU-1', customerId: 'c1', pallets: 3 }, locations, stock)?.id).toBe('a2');
  });

  it('falls back to bulk floor when ambient is full, skipping inactive bins', () => {
    const stock = [lot({ locationId: 'a1', pallets: 10 }), lot({ locationId: 'a2', pallets: 10 })];
    expect(suggestPutaway({ sku: 'N', customerId: 'c1', pallets: 2 }, locations, stock)?.id).toBe('b1');
  });

  it('sends returns to quarantine', () => {
    expect(
      suggestPutaway({ sku: 'SKU-1', customerId: 'c1', pallets: 1, quarantine: true }, locations, [])?.id,
    ).toBe('q1');
  });

  it('respects pallets planned earlier in the same put-away', () => {
    const planned = new Map([['a1', 9]]);
    expect(suggestPutaway({ sku: 'N', customerId: 'c1', pallets: 2 }, locations, [], planned)?.id).toBe('a2');
  });
});

describe('expiry and counts', () => {
  it('classifies expiry against today with a 30-day window', () => {
    expect(expiryState(undefined, '2026-11-23')).toBe('No expiry');
    expect(expiryState('2026-11-22', '2026-11-23')).toBe('Expired');
    expect(expiryState('2026-12-23', '2026-11-23')).toBe('Expiring');
    expect(expiryState('2027-01-23', '2026-11-23')).toBe('OK');
  });

  it('estimates pallets and finds the largest count difference', () => {
    expect(estimatePallets(0)).toBe(0);
    expect(estimatePallets(51)).toBe(2);
    expect(
      maxCountDifference([
        { systemQty: 10, countedQty: 7 },
        { systemQty: 5, countedQty: 9 },
        { systemQty: 5 },
      ]),
    ).toBe(4);
  });
});
