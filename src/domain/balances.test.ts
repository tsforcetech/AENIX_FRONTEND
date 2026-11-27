import { customerBalance } from './balances';
import type { Collection, Invoice, SalesOrder } from './types';

const so = (id: string, price: number): SalesOrder => ({
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
      quantity: 1,
      unit: 'Truck',
      unitPrice: price,
      unitCost: 0,
    },
  ],
  status: 'Completed',
  owner: 'o',
  notes: '',
});

describe('customerBalance', () => {
  const salesOrders = [so('so1', 1000), so('so2', 2000), so('so3', 500)];
  // One invoice billing two sales orders; half paid.
  const invoices: Invoice[] = [
    {
      id: 'i1',
      number: 'INV-1',
      customerId: 'c1',
      salesOrderIds: ['so1', 'so2'],
      issueDate: '2026-11-02',
      dueDate: '2026-12-02',
      lines: [
        { id: 'a', salesOrderId: 'so1', description: 'so1', quantity: 1, unitPrice: 1000, vatRate: 0.05 },
        { id: 'b', salesOrderId: 'so2', description: 'so2', quantity: 1, unitPrice: 2000, vatRate: 0.05 },
      ],
      paid: 1575,
      status: 'Partially paid',
    },
  ];
  const collections: Collection[] = [
    {
      id: 'r1',
      number: 'R1',
      customerId: 'c1',
      date: '2026-11-03',
      method: 'Bank transfer',
      amount: 1575,
      reference: '',
      allocations: [{ invoiceId: 'i1', amount: 1575 }],
      status: 'Allocated',
    },
    {
      id: 'r2',
      number: 'R2',
      customerId: 'c1',
      date: '2026-11-04',
      method: 'Cash',
      amount: 200,
      reference: '',
      allocations: [{ salesOrderId: 'so3', amount: 200 }],
      status: 'Advance',
    },
  ];

  it('gives the exact overall position', () => {
    const b = customerBalance('c1', { salesOrders, invoices, collections });
    expect(b.invoiced).toBe(3150);
    expect(b.outstanding).toBe(1575);
    expect(b.advances).toBe(200);
    expect(b.balance).toBe(1375);
    expect(b.notYetInvoiced).toBe(525);
  });

  it('splits invoices and receipts per sales order', () => {
    const b = customerBalance('c1', { salesOrders, invoices, collections });
    const [s1, s2, s3] = b.salesOrders;
    expect(s1).toMatchObject({ invoiced: 1050, received: 525, balance: 525, notInvoiced: 0 });
    expect(s2).toMatchObject({ invoiced: 2100, received: 1050, balance: 1050 });
    expect(s3).toMatchObject({ invoiced: 0, advance: 200, received: 200, balance: -200, notInvoiced: 525 });
  });
});
