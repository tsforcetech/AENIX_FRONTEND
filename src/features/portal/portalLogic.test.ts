import type { Milestone, StockItem } from '@/domain/types';
import { advanceMilestone, billPayment, stockStatementCsv, stockStatementRows } from './portalLogic';

const stock = (over: Partial<StockItem>): StockItem => ({
  id: 's',
  sku: 'SKU-1',
  customerId: 'c1',
  description: 'Gloves',
  warehouse: 'JAFZA WH-1',
  location: 'D-03-01',
  qtyOnHand: 10,
  uom: 'Case',
  pallets: 1,
  receivedAt: '2026-11-01',
  ...over,
});

describe('stock statement (X6)', () => {
  it("lists only the customer's stock on hand with lot fields and bin", () => {
    const rows = stockStatementRows(
      [
        stock({
          id: 'a',
          batch: 'B2',
          expiryDate: '2027-02-01',
          locationId: 'loc-9',
          stockStatus: 'Quarantine',
        }),
        stock({ id: 'b', batch: 'B1', expiryDate: '2027-01-01' }),
        stock({ id: 'c', customerId: 'c2' }),
        stock({ id: 'd', qtyOnHand: 0 }),
      ],
      [{ id: 'loc-9', code: 'Q-01', warehouse: 'JAFZA WH-1' }],
      'c1',
    );
    expect(rows.map((r) => ({ ...r, id: undefined }))).toEqual([
      {
        sku: 'SKU-1',
        description: 'Gloves',
        batch: 'B1',
        expiry: '2027-01-01',
        location: 'JAFZA WH-1 D-03-01',
        qty: 10,
        uom: 'Case',
        status: 'Available',
      },
      {
        sku: 'SKU-1',
        description: 'Gloves',
        batch: 'B2',
        expiry: '2027-02-01',
        location: 'JAFZA WH-1 Q-01',
        qty: 10,
        uom: 'Case',
        status: 'Quarantine',
      },
    ]);
    expect(stockStatementCsv(rows).split('\r\n')[0]).toBe(
      'SKU,Description,Batch,Expiry,Location,Qty,UOM,Status',
    );
  });
});

describe('billPayment (X6)', () => {
  const pays = [
    {
      number: 'PV-1',
      status: 'Posted' as const,
      date: '2026-11-10',
      allocations: [{ billId: 'b1', amount: 500 }],
    },
    {
      number: 'PV-2',
      status: 'Cancelled' as const,
      date: '2026-11-11',
      allocations: [{ billId: 'b1', amount: 50 }],
    },
    {
      number: 'PV-3',
      status: 'Posted' as const,
      date: '2026-11-12',
      allocations: [{ billId: 'b2', amount: 10 }],
    },
  ];
  it('derives paid / partly / unpaid with voucher numbers', () => {
    expect(billPayment({ id: 'b1', amount: 1000, vat: 50, paid: 500 }, pays)).toEqual({
      status: 'Partly paid',
      vouchers: [{ number: 'PV-1', amount: 500, date: '2026-11-10' }],
    });
    expect(billPayment({ id: 'b1', amount: 1000, vat: 50, paid: 1050 }, pays).status).toBe('Paid');
    expect(billPayment({ id: 'b9', amount: 1000, vat: 50, paid: 0 }, pays)).toEqual({
      status: 'Unpaid',
      vouchers: [],
    });
  });
});

describe('advanceMilestone (T2)', () => {
  const ms: Milestone[] = [
    { id: '1', label: 'Picked up', status: 'Done', at: 'x' },
    { id: '2', label: 'In transit', status: 'Current' },
    { id: '3', label: 'Delivered', status: 'Pending' },
  ];
  it('completes the current milestone and moves to the next', () => {
    const r = advanceMilestone(ms, '2026-11-23T10:00:00Z')!;
    expect(r.done).toBe('In transit');
    expect(r.milestones.map((m) => m.status)).toEqual(['Done', 'Done', 'Current']);
    expect(r.milestones[1]!.at).toBe('2026-11-23T10:00:00Z');
    const last = advanceMilestone(r.milestones, 't')!;
    expect(last.milestones.every((m) => m.status === 'Done')).toBe(true);
    expect(advanceMilestone(last.milestones, 't')).toBeNull();
  });
});
