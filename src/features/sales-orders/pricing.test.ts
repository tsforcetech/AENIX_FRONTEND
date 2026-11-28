import { describe, expect, it } from 'vitest';
import type { CustomerBalance } from '@/domain/balances';
import type { Invoice, VendorRate } from '@/domain/types';
import { creditInputs } from './credit';
import {
  cheapestValidRate,
  discountPct,
  fuelSurchargeAmount,
  quotationApprovalCheck,
  rateCardPrice,
  valueChange,
} from './pricing';

const rate = (id: string, r: number, from = '2026-01-01', to = '2026-12-31', origin = 'A', dest = 'B') =>
  ({
    id,
    vendorId: 'v',
    serviceId: 's1',
    origin,
    destination: dest,
    unit: 'Truck',
    rate: r,
    validFrom: from,
    validTo: to,
  }) satisfies VendorRate;

describe('pricing (FLOW-003 WP-A)', () => {
  it('picks the cheapest rate valid on the date, preferring the lane', () => {
    const rates = [
      rate('a', 500),
      rate('b', 400, '2025-01-01', '2025-12-31'),
      rate('c', 450, undefined, undefined, 'X', 'Y'),
    ];
    expect(cheapestValidRate(rates, 's1', '2026-11-23')).toBe(450);
    expect(cheapestValidRate(rates, 's1', '2026-11-23', { origin: 'a', destination: 'b' })).toBe(500);
    expect(cheapestValidRate(rates, 's2', '2026-11-23')).toBeUndefined();
    expect(rateCardPrice(450)).toBe(540);
  });

  it('computes discount % against the rate card', () => {
    expect(discountPct(1000, 850)).toBe(15);
    expect(discountPct(1000, 1100)).toBe(0);
    expect(discountPct(undefined, 10)).toBe(0);
  });

  it('checks the worst discount and the overall margin, converting currency', () => {
    const r = quotationApprovalCheck(
      [
        { quantity: 1, unitPrice: 100, unitCost: 90, listPriceAed: 400 },
        { quantity: 2, unitPrice: 50, unitCost: 20 },
      ],
      3.6725,
    );
    // 100 USD = 367.25 AED vs 400 list → 8.2 %
    expect(r.maxDiscountPct).toBe(8.2);
    expect(r.marginPct).toBe(35);
  });

  it('adds the fuel surcharge on transport lines only', () => {
    const lines = [
      { serviceId: 't', quantity: 2, unitPrice: 1000 },
      { serviceId: 'w', quantity: 10, unitPrice: 5 },
    ];
    expect(fuelSurchargeAmount(lines, 7.5, (id) => id === 't')).toBe(150);
    expect(fuelSurchargeAmount(lines, 0, () => true)).toBe(0);
  });

  it('measures the value change of an amendment (with minimum charges)', () => {
    expect(
      valueChange(
        [{ quantity: 1, unitPrice: 100 }],
        [
          { quantity: 2, unitPrice: 100 },
          { quantity: 1, unitPrice: 10, minimumCharge: 50 },
        ],
      ),
    ).toBe(150);
  });
});

describe('creditInputs (C5)', () => {
  const so = (id: string, status: 'Confirmed' | 'Draft' | 'In progress', notInvoiced: number) => ({
    salesOrderId: id,
    number: id,
    status,
    orderValue: notInvoiced,
    invoiced: 0,
    notInvoiced,
    received: 0,
    advance: 0,
    balance: 0,
  });
  const balance: Pick<CustomerBalance, 'balance' | 'salesOrders'> = {
    balance: 1200,
    salesOrders: [so('a', 'Confirmed', 1000), so('b', 'Draft', 500), so('c', 'In progress', 300)],
  };
  const inv = (dueDate: string, status: Invoice['status'], paid = 0): Invoice => ({
    id: dueDate,
    number: dueDate,
    customerId: 'cus-1',
    issueDate: '2026-09-01',
    dueDate,
    lines: [{ id: 'l', description: 'x', quantity: 1, unitPrice: 100, vatRate: 0.05 }],
    paid,
    status,
  });

  it('sums other open orders and finds the oldest overdue invoice', () => {
    const r = creditInputs({
      balance,
      invoices: [inv('2026-10-01', 'Overdue'), inv('2026-11-01', 'Posted'), inv('2026-09-01', 'Paid', 105)],
      customerId: 'cus-1',
      today: '2026-11-23',
      excludeOrderId: 'c',
    });
    expect(r).toEqual({ openBalance: 1200, uninvoicedOrders: 1000, oldestOverdueDays: 53 });
  });

  it('never treats an advance as available credit', () => {
    expect(
      creditInputs({
        balance: { ...balance, balance: -500 },
        invoices: [],
        customerId: 'x',
        today: '2026-11-23',
      }).openBalance,
    ).toBe(0);
  });
});
