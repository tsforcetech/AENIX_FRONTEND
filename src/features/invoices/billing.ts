import { toAed } from '@/domain/controls';
import type { Invoice, JournalEntry } from '@/domain/types';

/**
 * Invoice posting split (ILLUSTRATIVE — pending accountant sign-off).
 * Revenue lines → revenue account; disbursement lines (A9) → 1250 Disbursements recoverable;
 * VAT → output VAT; the AR debit is the sum of the AED parts so the journal always balances.
 * Amounts are converted to AED with the invoice rate (C10).
 */
export function invoicePostingLines(
  inv: Pick<Invoice, 'lines' | 'currency' | 'exchangeRate'>,
  accounts: { ar: string; revenue: string; disbursements: string; vatOut: string },
): JournalEntry['lines'] {
  const aed = (n: number) => toAed(n, inv.currency ?? 'AED', inv.exchangeRate);
  const net = (disb: boolean) =>
    inv.lines.filter((l) => !!l.isDisbursement === disb).reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vat = inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice * l.vatRate, 0);
  const revenue = aed(net(false));
  const disbursements = aed(net(true));
  const vatAed = aed(vat);
  const ar = Math.round((revenue + disbursements + vatAed) * 100) / 100;
  return [
    { account: accounts.ar, debit: ar, credit: 0 },
    { account: accounts.revenue, debit: 0, credit: revenue },
    { account: accounts.disbursements, debit: 0, credit: disbursements },
    { account: accounts.vatOut, debit: 0, credit: vatAed },
  ].filter((l) => l.debit !== 0 || l.credit !== 0);
}
