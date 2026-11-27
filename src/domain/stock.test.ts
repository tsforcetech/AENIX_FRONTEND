import { jobStock } from './stock';
import type { CustomerRequest, Inbound } from './types';

const inbound = (id: string, qty: number, received?: number, damaged = 0): Inbound => ({
  id,
  number: id,
  reference: '',
  expectedAt: '2026-11-01',
  packingList: {
    number: `PL-${id}`,
    status: 'Sent to warehouse',
    lines: [{ sku: 'a-1', description: 'Item', quantity: qty, uom: 'Ctn' }],
  },
  grn:
    received === undefined
      ? undefined
      : {
          number: `GRN-${id}`,
          receivedAt: '2026-11-02',
          lines: [{ sku: 'A-1', receivedQty: received, damagedQty: damaged }],
          status: 'Uploaded',
        },
});
const request = (id: string, qty: number, delivered?: number): CustomerRequest => ({
  id,
  number: id,
  requestedAt: '2026-11-03',
  requiredBy: '2026-11-04',
  deliverTo: 'Store',
  lines: [{ sku: 'A-1', description: 'Item', quantity: qty, uom: 'Ctn' }],
  status: delivered === undefined ? 'Sent to vendor' : 'Delivered',
  pod:
    delivered === undefined
      ? undefined
      : {
          number: 'POD',
          deliveredAt: '2026-11-04',
          receivedBy: 'x',
          lines: [{ sku: 'A-1', deliveredQty: delivered }],
        },
});

describe('jobStock', () => {
  it('accumulates many inbounds and outbounds per SKU (case-insensitive)', () => {
    const s = jobStock({
      inbounds: [inbound('i1', 100, 100), inbound('i2', 50, 48, 2), inbound('i3', 30)],
      customerRequests: [request('r1', 40, 40), request('r2', 20)],
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      sku: 'A-1',
      received: 146,
      damaged: 2,
      delivered: 40,
      reserved: 20,
      onHand: 106,
      available: 86,
    });
  });

  it('can exclude the request being edited from reservations', () => {
    const s = jobStock({ inbounds: [inbound('i1', 10, 10)], customerRequests: [request('r1', 10)] }, 'r1');
    expect(s[0]!.available).toBe(10);
  });
});
