import { invoiceTotals, marginPct, workOrderFinancials } from './calc';

describe('calc', () => {
  it('computes invoice totals with 5% VAT and outstanding', () => {
    const t = invoiceTotals({
      paid: 50,
      lines: [{ id: 'a', description: 'x', quantity: 2, unitPrice: 100, vatRate: 0.05 }],
    });
    expect(t).toEqual({ subtotal: 200, vat: 10, total: 210, outstanding: 160 });
  });

  it('prefers assigned vendor cost for work order margin', () => {
    const f = workOrderFinancials({
      lines: [
        {
          id: 'l',
          serviceId: 's',
          description: 'd',
          quantity: 1,
          unit: 'Truck',
          unitPrice: 1000,
          unitCost: 600,
        },
      ],
      vendorAssignments: [{ id: 'v', vendorId: 'x', serviceId: 's', agreedCost: 700, status: 'Accepted' }],
    });
    expect(f).toEqual({ revenue: 1000, cost: 700, margin: 300, marginPct: 30 });
    expect(marginPct(0, 10)).toBe(0);
  });
});
