import type {
  Collection,
  Invoice,
  PurchaseOrder,
  VendorPayment,
  WarehouseLocation,
  WorkOrder,
} from '@/domain/types';
import {
  invoiceRevenueAed,
  jobProfitability,
  openPdcs,
  pdcMaturity,
  vendorPerformance,
  warehouseOccupancy,
} from './analytics';

const wo = (id: string, over: Partial<WorkOrder> = {}): WorkOrder =>
  ({
    id,
    number: `JOB-${id}`,
    customerId: 'c1',
    serviceCategory: 'Transport',
    serviceCategories: ['Transport'],
    source: { type: 'Direct' },
    origin: 'A',
    destination: 'B',
    cargo: { description: '', packages: 0, weightKg: 0, volumeCbm: 0 },
    status: 'In progress',
    priority: 'Normal',
    milestones: [],
    vendorAssignments: [],
    lines: [
      { id: 'l', serviceId: 's', description: '', quantity: 2, unit: 'Trip', unitPrice: 1000, unitCost: 600 },
    ],
    hasWarehouse: false,
    inbounds: [],
    customerRequests: [],
    createdAt: '2026-11-01T00:00:00Z',
    eta: '2026-11-10',
    owner: 'X',
    ...over,
  }) as WorkOrder;

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 'i1',
  number: 'AEN001',
  customerId: 'c1',
  issueDate: '2026-11-10',
  dueDate: '2026-12-10',
  lines: [],
  paid: 0,
  status: 'Posted',
  ...over,
});

const po = (over: Partial<PurchaseOrder>): PurchaseOrder => ({
  id: 'po1',
  number: 'PO-1',
  vendorId: 'v1',
  workOrderId: 'w1',
  serviceId: 's',
  description: '',
  amount: 900,
  vatRate: 0.05,
  issuedAt: '2026-11-01T00:00:00Z',
  status: 'Issued',
  ...over,
});

describe('job profitability (X8)', () => {
  it('uses invoices (AED, no disbursements), PO cost and internal costs', () => {
    expect(
      invoiceRevenueAed(
        inv({
          currency: 'USD',
          exchangeRate: 3.6725,
          lines: [
            { id: 'a', description: '', quantity: 1, unitPrice: 1000, vatRate: 0.05 },
            { id: 'b', description: '', quantity: 1, unitPrice: 500, vatRate: 0, isDisbursement: true },
          ],
        }),
      ),
    ).toBe(3672.5);

    const { jobs, customers } = jobProfitability({
      workOrders: [
        wo('w1', {
          internalCosts: [
            {
              id: 'ic',
              date: '2026-11-02',
              kind: 'Own vehicle (trip)',
              description: '',
              quantity: 1,
              unit: 'Trip',
              rate: 300,
            },
          ],
        }),
        wo('w2', {
          vendorAssignments: [
            { id: 'a', vendorId: 'v2', serviceId: 's', agreedCost: 1500, status: 'Accepted' },
          ],
        }),
        wo('w3', { status: 'Cancelled' }),
      ],
      invoices: [
        inv({
          workOrderId: 'w1',
          lines: [{ id: 'a', description: '', quantity: 1, unitPrice: 2500, vatRate: 0.05 }],
        }),
        inv({
          id: 'i2',
          workOrderId: 'w1',
          status: 'Draft',
          lines: [{ id: 'a', description: '', quantity: 1, unitPrice: 99999, vatRate: 0.05 }],
        }),
      ],
      purchaseOrders: [po({}), po({ id: 'po2', amount: 5000, status: 'Cancelled' })],
      customers: [{ id: 'c1', name: 'Customer One' }],
    });
    const w1 = jobs.find((j) => j.id === 'w1')!;
    expect(w1).toMatchObject({
      revenue: 2500,
      revenueSource: 'Invoiced',
      vendorCost: 900,
      internalCost: 300,
      grossProfit: 1300,
      marginPct: 52,
    });
    const w2 = jobs.find((j) => j.id === 'w2')!;
    expect(w2).toMatchObject({
      revenue: 2000,
      revenueSource: 'Job lines',
      vendorCost: 1500,
      grossProfit: 500,
      marginPct: 25,
    });
    expect(jobs).toHaveLength(2);
    expect(customers).toEqual([
      {
        customerId: 'c1',
        customerName: 'Customer One',
        jobs: 2,
        revenue: 4500,
        cost: 2700,
        grossProfit: 1800,
        marginPct: 40,
      },
    ]);
  });
});

describe('vendor performance (T10)', () => {
  it('counts on-time deliveries against the job ETA and variances per vendor', () => {
    const assign = (vendorId: string) => [
      { id: `a-${vendorId}`, vendorId, serviceId: 's', agreedCost: 1, status: 'Accepted' as const },
    ];
    const rows = vendorPerformance({
      vendors: [
        { id: 'v1', name: 'Vendor One' },
        { id: 'v2', name: 'Vendor Two' },
        { id: 'v3', name: 'Idle' },
      ],
      workOrders: [
        wo('w1', {
          vendorAssignments: assign('v1'),
          customerRequests: [
            {
              id: 'r',
              number: 'R',
              requestedAt: '',
              requiredBy: '2026-11-10',
              deliverTo: '',
              lines: [],
              status: 'Delivered',
              pod: {
                number: 'POD',
                vendorId: 'v1',
                deliveredAt: '2026-11-09T10:00:00Z',
                receivedBy: 'x',
                lines: [],
              },
            },
          ],
        }),
        wo('w2', {
          vendorAssignments: assign('v1'),
          milestones: [{ id: 'm', label: 'Delivered', status: 'Done', at: '2026-11-12T10:00:00Z' }],
        }),
        wo('w3', {
          vendorAssignments: assign('v2'),
          stops: [
            {
              id: 's',
              seq: 1,
              type: 'Delivery',
              address: '',
              plannedAt: '',
              actualAt: '2026-11-10T20:00:00Z',
              status: 'Done',
            },
          ],
        }),
        wo('w4', { vendorAssignments: assign('v2') }),
      ],
      variances: [{ vendorId: 'v1' }, { vendorId: 'v1' }],
    });
    expect(rows).toEqual([
      {
        vendorId: 'v2',
        vendorName: 'Vendor Two',
        jobs: 2,
        delivered: 1,
        onTime: 1,
        onTimePct: 100,
        variances: 0,
      },
      {
        vendorId: 'v1',
        vendorName: 'Vendor One',
        jobs: 2,
        delivered: 2,
        onTime: 1,
        onTimePct: 50,
        variances: 2,
      },
    ]);
  });
});

describe('warehouse occupancy (W)', () => {
  it('sums pallets per zone against bin capacity, with unassigned stock apart', () => {
    const loc = (
      id: string,
      code: string,
      zone: WarehouseLocation['zone'],
      cap: number,
    ): WarehouseLocation => ({
      id,
      warehouse: 'WH',
      code,
      zone,
      capacityPallets: cap,
      active: true,
    });
    const rows = warehouseOccupancy(
      [loc('l1', 'A-1', 'Ambient', 30), loc('l2', 'A-2', 'Ambient', 30), loc('l3', 'D-1', 'Chilled', 20)],
      [
        { locationId: 'l1', location: 'x', pallets: 15, warehouse: 'WH' },
        { location: 'A-2', pallets: 6, warehouse: 'WH' },
        { location: 'D-1', pallets: 5, warehouse: 'WH' },
        { location: 'ZZ', pallets: 4, warehouse: 'WH' },
        { location: 'A-1', pallets: 0, warehouse: 'WH' },
      ],
    );
    expect(rows).toEqual([
      { zone: 'Ambient', locations: 2, capacity: 60, used: 21, pct: 35 },
      { zone: 'Chilled', locations: 1, capacity: 20, used: 5, pct: 25 },
      { zone: 'Not in a bin', locations: 0, capacity: 0, used: 4, pct: null },
    ]);
  });
});

describe('PDC maturity (A15)', () => {
  it('buckets open received and issued PDCs by days to cheque date', () => {
    const col = (id: string, chequeDate: string, over: Partial<Collection> = {}): Collection => ({
      id,
      number: id,
      customerId: 'c1',
      date: '2026-11-01',
      method: 'PDC',
      amount: 1000,
      reference: '',
      chequeDate,
      allocations: [],
      status: 'PDC pending',
      ...over,
    });
    const pay = (id: string, chequeDate: string, over: Partial<VendorPayment> = {}): VendorPayment => ({
      id,
      number: id,
      vendorId: 'v1',
      date: '2026-11-01',
      method: 'PDC',
      amount: 400,
      reference: '',
      chequeDate,
      allocations: [],
      status: 'PDC issued',
      ...over,
    });
    const pdcs = openPdcs(
      [
        col('c-past', '2026-11-20'),
        col('c-10', '2026-12-03'),
        col('c-45', '2027-01-07'),
        col('c-cleared', '2026-12-01', { pdcStatus: 'Cleared' }),
        col('c-bank', '2026-12-01', { method: 'Bank transfer', status: 'Allocated', chequeDate: undefined }),
      ],
      [
        pay('p-10', '2026-12-01'),
        pay('p-80', '2027-02-11'),
        pay('p-x', '2026-12-01', { status: 'Cancelled' }),
      ],
      '2026-11-23',
    );
    expect(pdcs.map((p) => p.id)).toEqual(['c-past', 'p-10', 'c-10', 'c-45', 'p-80']);
    expect(pdcs[0]!.daysLeft).toBe(-3);
    const buckets = pdcMaturity(pdcs);
    expect(buckets.map((b) => [b.bucket, b.receivedCount, b.received, b.issuedCount, b.issued])).toEqual([
      ['Past cheque date', 1, 1000, 0, 0],
      ['Next 30 days', 1, 1000, 1, 400],
      ['31–60 days', 1, 1000, 0, 0],
      ['61–90 days', 0, 0, 1, 400],
      ['After 90 days', 0, 0, 0, 0],
    ]);
  });
});
