import { assertOpenPeriod } from '@/domain/controls';
import type { JournalEntry } from '@/domain/types';
import { newId, nowIso, protoDb } from '@/prototype/store';

/**
 * Prototype journal posting used by the finance modules (invoices, vendor bills, collections).
 * ILLUSTRATIVE ONLY: account codes and posting rules are pending accountant sign-off (Phase 8);
 * the backend will own posting, numbering and balancing.
 */
export const ACCOUNTS = {
  bank: '1110 Bank — current account',
  pettyCash: '1120 Petty cash',
  pdc: '1130 PDC received (cheques in hand)',
  ar: '1200 Accounts receivable',
  disbursements: '1250 Disbursements recoverable',
  vatIn: '1300 VAT input recoverable',
  unbilledRevenue: '1400 Unbilled revenue (accrued)',
  ap: '2100 Accounts payable',
  pdcIssued: '2150 PDC issued (cheques payable)',
  vatOut: '2200 VAT output payable',
  customerAdvances: '2300 Customer advances',
  accruedCosts: '2400 Accrued job costs',
  creditCard: '2500 Credit card payable',
  freightRevenue: '4100 Freight revenue',
  storageRevenue: '4200 Storage revenue',
  costOfSales: '5100 Freight cost of sales',
  bankCharges: '6400 Bank charges',
  badDebts: '6500 Bad debts written off',
  shortageClaims: '6600 Stock shortage / damage claims',
} as const;

/** Bank ledger codes (older sample journals used the group code 1100). */
export const BANK_CODES: readonly string[] = ['1100', '1110'];

const round2 = (n: number) => Math.round(n * 100) / 100;

export const accountCode = (account: string) => account.split(' ')[0] ?? account;

export function journalTotals(lines: JournalEntry['lines']) {
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { debit, credit, balanced: debit === credit };
}

/** Posts a balanced journal. Refuses dates inside a locked period (A14); zero lines are dropped. */
export function postJournal(entry: Omit<JournalEntry, 'id' | 'number' | 'status'>): JournalEntry {
  const db = protoDb.get();
  assertOpenPeriod(db.company, entry.date);
  const lines = entry.lines
    .map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);
  if (!journalTotals(lines).balanced) throw new Error('Journal does not balance');
  const next = Math.max(9000, ...db.journals.map((j) => Number(j.number.split('-')[1]) || 0)) + 1;
  const journal: JournalEntry = { ...entry, lines, id: newId('jv'), number: `JV-${next}`, status: 'Posted' };
  protoDb.update((s) => ({ ...s, journals: [journal, ...s.journals] }));
  return journal;
}

/** Posted balance (debit − credit) of ledger codes, optionally up to a date. */
export function ledgerBalance(codes: readonly string[], upTo?: string): number {
  let sum = 0;
  for (const j of protoDb.get().journals) {
    if (j.status !== 'Posted' || (upTo && j.date > upTo)) continue;
    for (const l of j.lines) if (codes.includes(accountCode(l.account))) sum += l.debit - l.credit;
  }
  return round2(sum);
}

/** In-app notification (prototype; X7 channels are delivered by the backend). */
export function notify(title: string, body: string, href?: string): void {
  protoDb.update((s) => ({
    ...s,
    notifications: [{ id: newId('ntf'), at: nowIso(), title, body, read: false, href }, ...s.notifications],
  }));
}

/** Next number in a simple PREFIX-### series. */
export function nextSeries(prefix: string, existing: readonly string[]): string {
  const n = Math.max(0, ...existing.map((x) => Number(x.split('-').pop()) || 0)) + 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}
