import { invoiceTotals } from '@/domain/calc';
import type { Collection, Invoice } from '@/domain/types';
import { formatDate } from '@/shared/utils/format';

/** Statement-of-account line (public helper of the customers feature; also used by the customer portal). */
export interface StatementLine {
  id: string;
  date: string;
  type: 'Invoice' | 'Receipt';
  reference: string;
  refId: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

/** Chronological invoices (debit) and receipts (credit) with running balance. Prototype maths only. */
export function buildStatement(invoices: Invoice[], collections: Collection[]): StatementLine[] {
  const entries = [
    ...invoices
      .filter((i) => i.status !== 'Draft' && i.status !== 'Cancelled')
      .map((i) => ({
        id: `i-${i.id}`,
        date: i.issueDate,
        type: 'Invoice' as const,
        reference: i.number,
        refId: i.id,
        description: `Invoice · due ${formatDate(i.dueDate)}`,
        debit: invoiceTotals(i).total,
        credit: 0,
      })),
    ...collections
      .filter((c) => c.status !== 'Bounced' && c.status !== 'PDC pending')
      .map((c) => ({
        id: `c-${c.id}`,
        date: c.date,
        type: 'Receipt' as const,
        reference: c.number,
        refId: c.id,
        description: `${c.method} · ${c.reference}`,
        debit: 0,
        credit: c.amount,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'Invoice' ? -1 : 1));
  let balance = 0;
  return entries.map((e) => {
    balance = Math.round((balance + e.debit - e.credit) * 100) / 100;
    return { ...e, balance };
  });
}

export function openInvoiceStats(invoices: Invoice[]) {
  const open = invoices.filter((i) => ['Posted', 'Partially paid', 'Overdue'].includes(i.status));
  const outstanding = open.reduce((s, i) => s + invoiceTotals(i).outstanding, 0);
  const overdue = open
    .filter((i) => i.status === 'Overdue')
    .reduce((s, i) => s + invoiceTotals(i).outstanding, 0);
  return {
    outstanding: Math.round(outstanding * 100) / 100,
    overdue: Math.round(overdue * 100) / 100,
    openCount: open.length,
  };
}
