import type { Invoice } from '@/domain/types';
import { computeVatReturn, emirateFor, quarterRange } from './vatReturn';

const inv = (
  id: string,
  customerId: string,
  lines: Invoice['lines'],
  extra: Partial<Invoice> = {},
): Invoice => ({
  id,
  number: id.toUpperCase(),
  customerId,
  issueDate: '2026-11-10',
  dueDate: '2026-12-10',
  lines,
  paid: 0,
  status: 'Posted',
  ...extra,
});

describe('emirateFor', () => {
  it('maps UAE cities and flags outside the UAE', () => {
    expect(emirateFor({ city: 'Jebel Ali Free Zone', country: 'UAE' })).toBe('Dubai');
    expect(emirateFor({ city: 'Abu Dhabi', country: 'UAE' })).toBe('Abu Dhabi');
    expect(emirateFor({ city: 'Sharjah', country: 'United Arab Emirates' })).toBe('Sharjah');
    expect(emirateFor({ city: 'Dammam', country: 'Saudi Arabia' })).toBeUndefined();
  });
});

describe('computeVatReturn', () => {
  const customers = [
    { id: 'dxb', city: 'Dubai', country: 'UAE' },
    { id: 'shj', city: 'Sharjah', country: 'UAE' },
    { id: 'ksa', city: 'Riyadh', country: 'Saudi Arabia' },
  ];
  const r = computeVatReturn({
    ...quarterRange(2026, 4),
    customers,
    invoices: [
      inv('a', 'dxb', [
        { id: '1', description: 'Freight', quantity: 1, unitPrice: 10000, vatRate: 0.05 },
        { id: '2', description: 'Duty', quantity: 1, unitPrice: 4000, vatRate: 0, isDisbursement: true },
      ]),
      inv('b', 'shj', [{ id: '1', description: 'Storage', quantity: 1, unitPrice: 2000, vatRate: 0.05 }]),
      inv('c', 'ksa', [{ id: '1', description: 'Export', quantity: 1, unitPrice: 3000, vatRate: 0 }]),
      inv('d', 'dxb', [{ id: '1', description: 'Old', quantity: 1, unitPrice: 999, vatRate: 0.05 }], {
        issueDate: '2026-09-30',
      }),
      inv('e', 'dxb', [{ id: '1', description: 'Draft', quantity: 1, unitPrice: 999, vatRate: 0.05 }], {
        status: 'Draft',
      }),
    ],
    creditNotes: [
      {
        id: 'cn',
        number: 'CN-001',
        customerId: 'dxb',
        invoiceId: 'a',
        date: '2026-11-15',
        reason: 'Rate',
        amount: 1000,
        vatRate: 0.05,
        status: 'Posted',
      },
    ],
    vendorBills: [
      {
        id: 'b1',
        number: 'PI-1',
        vendorRef: 'V',
        vendorId: 'v',
        billDate: '2026-10-05',
        dueDate: '2026-11-05',
        amount: 6000,
        vat: 300,
        paid: 0,
        status: 'Approved',
      },
    ],
    expenses: [
      {
        id: 'x',
        number: 'EXP-1',
        date: '2026-11-01',
        accountId: 'la-6100',
        description: 'Rent',
        amount: 1000,
        vatRate: 0.05,
        paidFrom: 'Bank',
        payee: 'Landlord',
        status: 'Posted',
      },
    ],
  });

  it('puts standard-rated supplies by emirate, net of credit notes', () => {
    expect(r.box1.find((b) => b.emirate === 'Dubai')).toEqual({ emirate: 'Dubai', amount: 9000, vat: 450 });
    expect(r.box1.find((b) => b.emirate === 'Sharjah')).toEqual({
      emirate: 'Sharjah',
      amount: 2000,
      vat: 100,
    });
    expect(r.standardTotal).toEqual({ amount: 11000, vat: 550 });
  });

  it('classifies zero-rated, out-of-scope and input VAT', () => {
    expect(r.zeroRated).toBe(3000);
    expect(r.outOfScope).toBe(4000);
    expect(r.box9).toEqual({ amount: 7000, vat: 350, bills: 1, expenses: 1 });
    expect(r.netVatDue).toBe(200);
    expect(r.invoiceCount).toBe(3);
  });

  it('gives calendar quarter ranges', () => {
    expect(quarterRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });
});
