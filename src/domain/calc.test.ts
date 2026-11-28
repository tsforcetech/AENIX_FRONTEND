import { invoiceTotals, lineMargin, linesRevenue, marginPct, workOrderFinancials } from './calc';

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

  it('applies the minimum charge to line totals (S6)', () => {
    expect(linesRevenue([{ quantity: 2, unitPrice: 50, minimumCharge: 200 }])).toBe(200);
    expect(linesRevenue([{ quantity: 5, unitPrice: 50, minimumCharge: 200 }])).toBe(250);
    expect(
      linesRevenue([
        { quantity: 2, unitPrice: 50 },
        { quantity: 1, unitPrice: 10 },
      ]),
    ).toBe(110);
  });

  it('computes line cost, margin and margin % (C3)', () => {
    expect(lineMargin({ quantity: 2, unitPrice: 100, unitCost: 75 })).toEqual({
      amount: 200,
      cost: 150,
      margin: 50,
      marginPct: 25,
    });
    expect(lineMargin({ quantity: 1, unitPrice: 50, unitCost: 80, minimumCharge: 100 }).margin).toBe(20);
  });
});
