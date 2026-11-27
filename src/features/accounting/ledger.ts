import type { JournalEntry } from '@/domain/types';
import { newId, protoDb } from '@/prototype/store';

/**
 * Prototype journal posting used by the finance modules (invoices, vendor bills, collections).
 * ILLUSTRATIVE ONLY: account codes and posting rules are pending accountant sign-off (Phase 8);
 * the backend will own posting, numbering and balancing.
 */
export const ACCOUNTS = {
  bank: '1100 Bank — current account',
  ar: '1200 Accounts receivable',
  pdc: '1250 PDC receivable',
  vatIn: '1300 VAT input recoverable',
  ap: '2100 Accounts payable',
  vatOut: '2200 VAT output payable',
  costOfSales: '5100 Freight cost of sales',
  freightRevenue: '4100 Freight revenue',
  storageRevenue: '4200 Storage revenue',
  customerAdvances: '2300 Customer advances',
  pdcIssued: '2150 PDC issued (cheques payable)',
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function journalTotals(lines: JournalEntry['lines']) {
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { debit, credit, balanced: debit === credit };
}

export function postJournal(entry: Omit<JournalEntry, 'id' | 'number' | 'status'>): JournalEntry {
  if (!journalTotals(entry.lines).balanced) throw new Error('Journal does not balance');
  const db = protoDb.get();
  const next = Math.max(9000, ...db.journals.map((j) => Number(j.number.split('-')[1]) || 0)) + 1;
  const journal: JournalEntry = { ...entry, id: newId('jv'), number: `JV-${next}`, status: 'Posted' };
  protoDb.update((s) => ({ ...s, journals: [journal, ...s.journals] }));
  return journal;
}
