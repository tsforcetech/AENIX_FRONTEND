import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billTotals, daysBetween, invoiceTotals } from '@/domain/calc';
import type { AccountGroup, JournalEntry, LedgerAccount } from '@/domain/types';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
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

export interface AccountNode extends LedgerAccount {
  depth: number;
  /** Debit-positive balance: own postings (+ children for groups). Party sub-ledgers use open documents. */
  balance: number;
  childCount: number;
}

export interface NewLedgerInput {
  group: AccountGroup;
  parentId: string;
  code: string;
  name: string;
  kind: 'Group' | 'Ledger';
}

const codeOf = (account: string) => account.split(' ')[0] ?? account;

/** Depth-first chart: groups, then their ledgers / sub-groups, sorted by code. */
function buildChart(): AccountNode[] {
  const db = protoDb.get();
  const posted = new Map<string, number>();
  for (const j of db.journals) {
    if (j.status !== 'Posted') continue;
    for (const l of j.lines) {
      const c = codeOf(l.account);
      posted.set(c, round2((posted.get(c) ?? 0) + l.debit - l.credit));
    }
  }
  const partyBalance = (a: LedgerAccount): number => {
    if (!a.party) return posted.get(a.code) ?? 0;
    if (a.party.type === 'Customer')
      return round2(
        db.invoices
          .filter(
            (i) => i.customerId === a.party!.id && ['Posted', 'Partially paid', 'Overdue'].includes(i.status),
          )
          .reduce((s, i) => s + invoiceTotals(i).outstanding, 0),
      );
    return -round2(
      db.vendorBills
        .filter(
          (b) => b.vendorId === a.party!.id && ['Approved', 'Partially paid', 'Overdue'].includes(b.status),
        )
        .reduce((s, b) => s + billTotals(b).outstanding, 0),
    );
  };
  const children = (parentId?: string) =>
    db.ledgerAccounts.filter((a) => a.parentId === parentId).sort((a, b) => a.code.localeCompare(b.code));
  const out: AccountNode[] = [];
  const walk = (a: LedgerAccount, depth: number): number => {
    const node: AccountNode = { ...a, depth, balance: 0, childCount: 0 };
    out.push(node);
    const kids = children(a.id);
    node.childCount = kids.length;
    let total = a.kind === 'Ledger' ? partyBalance(a) : (posted.get(a.code) ?? 0);
    for (const k of kids) total += walk(k, depth + 1);
    node.balance = round2(total);
    return node.balance;
  };
  for (const root of children(undefined)) walk(root, 0);
  return out;
}

export const accountingApi = {
  chart(): Promise<AccountNode[]> {
    return latency(buildChart(), 120);
  },
  createLedger(input: NewLedgerInput): Promise<LedgerAccount> {
    const db = protoDb.get();
    const code = input.code.trim();
    if (db.ledgerAccounts.some((a) => a.code === code))
      return Promise.reject(new Error(`Account code ${code} is already used`));
    const parent = db.ledgerAccounts.find((a) => a.id === input.parentId);
    if (!parent || parent.kind !== 'Group' || parent.group !== input.group)
      return Promise.reject(new Error('Choose a parent group in the same section'));
    const acc: LedgerAccount = {
      id: newId('la'),
      code,
      name: input.name.trim(),
      group: input.group,
      kind: input.kind,
      parentId: parent.id,
      system: false,
      active: true,
    };
    protoDb.update((s) => ({ ...s, ledgerAccounts: [...s.ledgerAccounts, acc] }));
    logActivity({
      entity: 'Ledger',
      entityId: acc.id,
      entityRef: `${acc.code} ${acc.name}`,
      action: 'created a ledger account',
    });
    return latency(acc, 200);
  },
  setActive(id: string, active: boolean): Promise<void> {
    const acc = protoDb.get().ledgerAccounts.find((a) => a.id === id);
    if (!acc || acc.system || acc.party)
      return Promise.reject(new Error('System and party accounts cannot be changed'));
    protoDb.update((s) => ({
      ...s,
      ledgerAccounts: s.ledgerAccounts.map((a) => (a.id === id ? { ...a, active } : a)),
    }));
    logActivity({
      entity: 'Ledger',
      entityId: id,
      entityRef: `${acc.code} ${acc.name}`,
      action: active ? 'reactivated a ledger account' : 'deactivated a ledger account',
    });
    return latency(undefined, 150);
  },
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

export function useChartOfAccounts(enabled = true) {
  return useQuery({ queryKey: ['accounting', 'chart'], queryFn: () => accountingApi.chart(), enabled });
}

export function useCreateLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountingApi.createLedger,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['accounting'] }),
  });
}

export function useSetLedgerActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => accountingApi.setActive(id, active),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['accounting'] }),
  });
}
