import type { Invoice, PurchaseOrder, SalesOrder, WorkOrder } from '@/domain/types';
import { accrualTotals, computeAccruals, monthEnd, nextDay } from './accruals';

const so = (id: string, status: SalesOrder['status'], price: number): SalesOrder => ({
  id,
  number: id.toUpperCase(),
  customerId: 'c1',
  serviceCategory: 'Transport',
  serviceCategories: ['Transport'],
  customerPoRef: 'PO',
  orderDate: '2026-11-01',
  origin: 'A',
  destination: 'B',
  lines: [
    {
      id: `${id}-l`,
      serviceId: 's',
      description: 'x',
      quantity: 2,
      unit: 'Truck',
      unitPrice: price,
      unitCost: 0,
    },
  ],
  status,
  owner: 'o',
  notes: '',
});

const job = (id: string, status: WorkOrder['status'], salesOrderId?: string): WorkOrder =>
  ({
    id,
    number: id.toUpperCase(),
    customerId: 'c1',
    serviceCategory: 'Transport',
    serviceCategories: ['Transport'],
    salesOrderId,
    source: { type: 'Direct' },
    origin: 'A',
    destination: 'B',
    cargo: { description: '', packages: 0, weightKg: 0, volumeCbm: 0 },
    status,
    priority: 'Normal',
    milestones: [],
    vendorAssignments: [],
    lines: [
      { id: 'l', serviceId: 's', description: 'x', quantity: 1, unit: 'Trip', unitPrice: 800, unitCost: 0 },
    ],
    hasWarehouse: false,
    inbounds: [],
    customerRequests: [],
    createdAt: '2026-11-05T09:00:00+04:00',
    eta: '2026-11-20',
    owner: 'o',
  }) as WorkOrder;

const po = (id: string, status: PurchaseOrder['status'], vendorBillId?: string): PurchaseOrder => ({
  id,
  number: id.toUpperCase(),
  vendorId: 'v1',
  workOrderId: 'w1',
  serviceId: 's',
  description: 'Haulage',
  amount: 600,
  vatRate: 0.05,
  issuedAt: '2026-11-04T10:00:00+04:00',
  status,
  vendorBillId,
});

describe('computeAccruals', () => {
  const invoices: Invoice[] = [
    {
      id: 'i1',
      number: 'INV-1',
      customerId: 'c1',
      salesOrderIds: ['so1'],
      issueDate: '2026-11-10',
      dueDate: '2026-12-10',
      lines: [
        { id: 'a', salesOrderId: 'so1', description: 'x', quantity: 1, unitPrice: 1000, vatRate: 0.05 },
      ],
      paid: 0,
      status: 'Posted',
    },
  ];

  it('accrues unbilled revenue and costs without a vendor invoice', () => {
    const lines = computeAccruals({
      periodEnd: '2026-11-30',
      salesOrders: [so('so1', 'Completed', 1000), so('so2', 'Confirmed', 500), so('so3', 'Draft', 900)],
      workOrders: [job('w1', 'Completed', 'so1'), job('w2', 'In progress'), job('w3', 'Confirmed')],
      invoices,
      purchaseOrders: [po('po1', 'Completed'), po('po2', 'Accepted', 'bill-1'), po('po3', 'Issued')],
    });
    expect(lines.map((l) => [l.kind, l.reference, l.amount])).toEqual([
      ['Unbilled revenue', 'SO1 · W1', 1000],
      ['Unbilled revenue', 'SO2', 1000],
      ['Unbilled revenue', 'W2', 800],
      ['Accrued cost', 'PO1 · W1', 600],
    ]);
    expect(accrualTotals(lines)).toEqual({ revenue: 2800, cost: 600 });
  });

  it('ignores invoices dated after the period end', () => {
    const lines = computeAccruals({
      periodEnd: '2026-11-05',
      salesOrders: [so('so1', 'Completed', 1000)],
      workOrders: [],
      invoices,
      purchaseOrders: [],
    });
    expect(lines[0]?.amount).toBe(2000);
  });
});

describe('period helpers', () => {
  it('finds month end and the reversal date', () => {
    expect(monthEnd('2026-11-23')).toBe('2026-11-30');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(nextDay('2026-11-30')).toBe('2026-12-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
});
