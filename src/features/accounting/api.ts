import { useQuery } from '@tanstack/react-query';
import { daysBetween, invoiceTotals } from '@/domain/calc';
import type { JournalEntry } from '@/domain/types';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, protoDb } from '@/prototype/store';
import { journalTotals } from './ledger';

/**
 * Accounting (GL) read models. PROTOTYPE ADAPTER — chart of accounts and posting rules are
 * pending accountant sign-off (Phase 8); replace with the Finance contract when published.
 */
export interface JournalRow extends JournalEntry {
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface TrialBalanceLine {
  account: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  lines: TrialBalanceLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  asOf: string;
}

export interface AgeingBucket {
  label: string;
  amount: number;
  count: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toRow(j: JournalEntry): JournalRow {
  const t = journalTotals(j.lines);
  return { ...j, totalDebit: t.debit, totalCredit: t.credit, balanced: t.balanced };
}

export const accountingApi = {
  journals(params: ListParams): Promise<Page<JournalRow>> {
    const rows = [...protoDb.get().journals]
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.reference} ${r.memo} ${r.source}`,
        status: (r) => r.source,
      }),
    );
  },
  journal(id: string): Promise<JournalRow> {
    const j = protoDb.get().journals.find((x) => x.id === id);
    return j ? latency(toRow(j)) : Promise.reject(new Error('Not found'));
  },
  trialBalance(): Promise<TrialBalance> {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const j of protoDb.get().journals) {
      if (j.status !== 'Posted') continue;
      for (const l of j.lines) {
        const cur = map.get(l.account) ?? { debit: 0, credit: 0 };
        cur.debit += l.debit;
        cur.credit += l.credit;
        map.set(l.account, cur);
      }
    }
    const lines = [...map.entries()]
      .map(([account, v]) => ({
        account,
        debit: round2(v.debit),
        credit: round2(v.credit),
        balance: round2(v.debit - v.credit),
      }))
      .sort((a, b) => a.account.localeCompare(b.account));
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    return latency({
      lines,
      totalDebit,
      totalCredit,
      balanced: totalDebit === totalCredit,
      asOf: PROTO_TODAY,
    });
  },
  arAgeing(): Promise<AgeingBucket[]> {
    const buckets: AgeingBucket[] = [
      { label: 'Current', amount: 0, count: 0 },
      { label: '1–30 days', amount: 0, count: 0 },
      { label: '31–60 days', amount: 0, count: 0 },
      { label: '60+ days', amount: 0, count: 0 },
    ];
    for (const inv of protoDb.get().invoices) {
      if (!['Posted', 'Partially paid', 'Overdue'].includes(inv.status)) continue;
      const { outstanding } = invoiceTotals(inv);
      if (outstanding <= 0) continue;
      const late = daysBetween(inv.dueDate, PROTO_TODAY);
      const b = buckets[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3]!;
      b.amount = round2(b.amount + outstanding);
      b.count += 1;
    }
    return latency(buckets);
  },
};

export function useJournals(params: ListParams) {
  return useQuery({
    queryKey: ['accounting', 'journals', params],
    queryFn: () => accountingApi.journals(params),
    placeholderData: (prev) => prev,
  });
}

export function useJournal(id: string) {
  return useQuery({ queryKey: ['accounting', 'journal', id], queryFn: () => accountingApi.journal(id) });
}

export function useTrialBalance(enabled = true) {
  return useQuery({
    queryKey: ['accounting', 'trial-balance'],
    queryFn: () => accountingApi.trialBalance(),
    enabled,
  });
}

export function useArAgeing() {
  return useQuery({ queryKey: ['accounting', 'ar-ageing'], queryFn: () => accountingApi.arAgeing() });
}
