import type { Driver, Enquiry, StockItem, Vehicle } from '@/domain/types';
import { expiringSoon, followUpsDue } from './alerts';

const vehicle = (over: Partial<Vehicle>): Vehicle => ({
  id: 'veh-1',
  plate: 'DXB A 1',
  type: '3-ton truck',
  capacityKg: 3000,
  registrationExpiry: '2027-06-01',
  insuranceExpiry: '2027-06-01',
  status: 'Available',
  odometerKm: 1,
  ...over,
});

describe('expiringSoon', () => {
  it('lists vehicle papers, driver licences and stock lots within 30 days, soonest first', () => {
    const items = expiringSoon(
      {
        vehicles: [
          vehicle({ registrationExpiry: '2026-12-10' }),
          vehicle({ id: 'veh-2', insuranceExpiry: '2026-11-20', status: 'Inactive' }),
        ],
        drivers: [
          {
            id: 'd1',
            name: 'Driver',
            licenceNo: 'DL',
            licenceExpiry: '2026-11-20',
            phone: '',
            status: 'Available',
          } as Driver,
        ],
        stockItems: [
          {
            id: 's1',
            sku: 'SKU',
            customerId: 'c1',
            description: '',
            warehouse: '',
            location: '',
            qtyOnHand: 5,
            uom: 'Case',
            pallets: 1,
            receivedAt: '',
            expiryDate: '2026-12-01',
            batch: 'B1',
          },
          {
            id: 's2',
            sku: 'SKU',
            customerId: 'c1',
            description: '',
            warehouse: '',
            location: '',
            qtyOnHand: 0,
            uom: 'Case',
            pallets: 0,
            receivedAt: '',
            expiryDate: '2026-12-01',
          },
          {
            id: 's3',
            sku: 'SKU',
            customerId: 'c1',
            description: '',
            warehouse: '',
            location: '',
            qtyOnHand: 5,
            uom: 'Case',
            pallets: 1,
            receivedAt: '',
            expiryDate: '2027-03-01',
          },
        ] as StockItem[],
        customerName: () => 'Customer',
      },
      '2026-11-23',
    );
    expect(items.map((i) => [i.kind, i.daysLeft])).toEqual([
      ['Driver licence', -3],
      ['Stock lot', 8],
      ['Vehicle registration', 17],
    ]);
    expect(items[1]!.label).toBe('SKU · batch B1');
  });
});

describe('followUpsDue', () => {
  it('returns open enquiries due today or earlier', () => {
    const e = (id: string, nextFollowUp: string | undefined, status: Enquiry['status'] = 'New') =>
      ({ id, nextFollowUp, status }) as Enquiry;
    expect(
      followUpsDue(
        [
          e('a', '2026-11-23'),
          e('b', '2026-11-20'),
          e('c', '2026-11-24'),
          e('d', '2026-11-01', 'Won'),
          e('e', undefined),
        ],
        '2026-11-23',
      ).map((x) => x.id),
    ).toEqual(['b', 'a']);
  });
});
