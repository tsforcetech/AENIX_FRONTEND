import { invoicePostingLines } from './billing';

const accounts = { ar: 'AR', revenue: 'REV', disbursements: 'DISB', vatOut: 'VAT' };

describe('invoicePostingLines', () => {
  it('posts disbursements to 1250 instead of revenue, with no VAT', () => {
    const lines = invoicePostingLines(
      {
        lines: [
          { id: 'a', description: 'Clearance', quantity: 1, unitPrice: 1000, vatRate: 0.05 },
          {
            id: 'b',
            description: 'Customs duty',
            quantity: 1,
            unitPrice: 4000,
            vatRate: 0,
            isDisbursement: true,
          },
        ],
      },
      accounts,
    );
    expect(lines).toEqual([
      { account: 'AR', debit: 5050, credit: 0 },
      { account: 'REV', debit: 0, credit: 1000 },
      { account: 'DISB', debit: 0, credit: 4000 },
      { account: 'VAT', debit: 0, credit: 50 },
    ]);
  });

  it('converts a USD invoice to AED at the invoice rate', () => {
    const lines = invoicePostingLines(
      {
        currency: 'USD',
        exchangeRate: 3.6725,
        lines: [{ id: 'a', description: 'Freight', quantity: 2, unitPrice: 500, vatRate: 0.05 }],
      },
      accounts,
    );
    expect(lines).toEqual([
      { account: 'AR', debit: 3856.13, credit: 0 },
      { account: 'REV', debit: 0, credit: 3672.5 },
      { account: 'VAT', debit: 0, credit: 183.63 },
    ]);
  });
});
