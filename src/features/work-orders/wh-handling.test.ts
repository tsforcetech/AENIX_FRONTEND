import { describe, expect, it } from 'vitest';
import type { CustomerRequest, Inbound } from '@/domain/types';
import { handlingDocs, proposeHandlingCharges, unitsPerPalletFromCargo } from './wh-handling';

const inbound = (status: 'Uploaded' | 'Verified' | 'Variance raised'): Inbound => ({
  id: 'ib',
  number: 'IN-1',
  reference: '',
  expectedAt: '2026-11-10',
  packingList: {
    number: 'PL-1',
    status: 'Sent to warehouse',
    lines: [{ sku: 'A', description: '', quantity: 300, uom: 'Unit' }],
  },
  grn: {
    number: 'GRN-1',
    receivedAt: '2026-11-10T10:00:00Z',
    lines: [{ sku: 'A', receivedQty: 300, damagedQty: 10 }],
    status,
  },
});

const request = (status: CustomerRequest['status']): CustomerRequest => ({
  id: 'r',
  number: 'CR-1',
  requestedAt: '2026-11-12T10:00:00Z',
  requiredBy: '2026-11-13',
  deliverTo: 'Store',
  lines: [{ sku: 'A', description: '', quantity: 40, uom: 'Unit' }],
  status,
  pod: {
    number: 'POD-1',
    deliveredAt: '2026-11-13T10:00:00Z',
    receivedBy: 'X',
    lines: [{ sku: 'A', deliveredQty: 40 }],
  },
});

const rate = { unitPrice: 18, unitCost: 12, unit: 'Pallet' };

describe('handling charges', () => {
  it('takes verified GRNs (good units) and closed PODs only', () => {
    const docs = handlingDocs({
      inbounds: [inbound('Verified'), { ...inbound('Uploaded'), id: 'x' }],
      customerRequests: [request('Closed'), { ...request('Delivered'), id: 'y' }],
    });
    expect(docs.map((d) => [d.ref, d.direction, d.units])).toEqual([
      ['GRN-1', 'In', 290],
      ['POD-1', 'Out', 40],
    ]);
  });

  it('parses units per pallet from the cargo', () => {
    expect(unitsPerPalletFromCargo({ packages: 300, equipment: '12 pallets' })).toBe(25);
    expect(unitsPerPalletFromCargo({ packages: 300, equipment: '40ft container' })).toBeUndefined();
  });

  it('proposes pallets × rate and skips documents already billed', () => {
    const docs = handlingDocs({ inbounds: [inbound('Verified')], customerRequests: [request('Closed')] });
    const p = proposeHandlingCharges(docs, [{ description: 'Handling out — POD-1' }], rate, 25);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      description: 'Handling in — GRN-1',
      quantity: 12,
      amount: 216,
      estimated: true,
    });
  });

  it('flags the quantity for checking when pallets are unknown', () => {
    const docs = handlingDocs({ inbounds: [inbound('Verified')], customerRequests: [] });
    const p = proposeHandlingCharges(docs, [], rate);
    expect(p[0]).toMatchObject({ quantity: 290, checkQuantity: true });
  });
});
