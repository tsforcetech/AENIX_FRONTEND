import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assertOpenPeriod } from '@/domain/controls';
import { autoMatchBank, type BookItem } from '@/domain/reconcile';
import type { AccrualRun, BankStatementLine } from '@/domain/types';
import { lookupName } from '@/shared/data/lookups';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { invalidateFinance } from '@/features/invoices/api';
import { postBankChargeExpense } from '@/features/expenses/api';
import { accrualTotals, computeAccruals, nextDay, type AccrualLine } from './accruals';
import { ACCOUNTS, BANK_CODES, ledgerBalance, nextSeries, postJournal } from './ledger';
import { computeVatReturn, quarterRange, type VatReturn } from './vatReturn';

/**
 * Month-end tools: accruals (A7), bank reconciliation (A13), VAT return draft (A12) and period close (A14).
 * PROTOTYPE ADAPTER — every posting here is ILLUSTRATIVE and PENDING ACCOUNTANT SIGN-OFF.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------- A7 accruals ----------
export interface AccrualPreview {
  periodEnd: string;
  lines: AccrualLine[];
  revenue: number;
  cost: number;
  existing?: AccrualRun;
}

export const accrualsApi = {
  preview(periodEnd: string): Promise<AccrualPreview> {
    const db = protoDb.get();
    const lines = computeAccruals({ periodEnd, ...db });
    return latency({
      periodEnd,
      lines,
      ...accrualTotals(lines),
      existing: db.accrualRuns.find((r) => r.periodEnd === periodEnd && r.status !== 'Draft'),
    });
  },
  runs(): Promise<AccrualRun[]> {
    return latency([...protoDb.get().accrualRuns].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)));
  },
  /** Posts the accrual (dated the period end) and its reversal (dated the first day of the next period). */
  post(periodEnd: string, lines: AccrualLine[]): Promise<AccrualRun> {
    const db = protoDb.get();
    if (db.accrualRuns.some((r) => r.periodEnd === periodEnd && r.status === 'Posted'))
      return Promise.reject(new Error(`Accruals for ${periodEnd} are already posted`));
    if (!lines.length) return Promise.reject(new Error('Nothing to accrue — select at least one line'));
    const { revenue, cost } = accrualTotals(lines);
    const reverseOn = nextDay(periodEnd);
    const number = nextSeries(
      'ACR',
      db.accrualRuns.map((r) => r.number),
    );
    const accrualLines = [
      { account: ACCOUNTS.unbilledRevenue, debit: revenue, credit: 0 },
      { account: ACCOUNTS.freightRevenue, debit: 0, credit: revenue },
      { account: ACCOUNTS.costOfSales, debit: cost, credit: 0 },
      { account: ACCOUNTS.accruedCosts, debit: 0, credit: cost },
    ];
    let journalId: string;
    let reversalJournalId: string;
    try {
      assertOpenPeriod(db.company, periodEnd);
      assertOpenPeriod(db.company, reverseOn);
      journalId = postJournal({
        date: periodEnd,
        source: 'Accrual',
        reference: number,
        memo: `Month-end accruals to ${periodEnd}: unbilled revenue and costs without a vendor invoice`,
        lines: accrualLines,
      }).id;
      reversalJournalId = postJournal({
        date: reverseOn,
        source: 'Accrual',
        reference: number,
        memo: `Auto-reversal of ${number} (accruals to ${periodEnd})`,
        lines: accrualLines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit })),
      }).id;
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('Could not post'));
    }
    const run: AccrualRun = {
      id: newId('acr'),
      number,
      periodEnd,
      lines,
      status: 'Posted',
      journalId,
      reversalJournalId,
    };
    protoDb.update((s) => ({ ...s, accrualRuns: [run, ...s.accrualRuns] }));
    logActivity({
      entity: 'Ledger',
      entityId: run.id,
      entityRef: number,
      action: `posted accruals to ${periodEnd}`,
    });
    return latency(run, 250);
  },
};

// ---------- A13 bank reconciliation ----------
export interface BankRecLine extends BankStatementLine {
  suggestedCharge: boolean;
}

export interface BankRecState {
  lines: BankRecLine[];
  openItems: BookItem[];
  bookBalance: number;
  bankBalance: number;
  difference: number;
  unmatched: number;
  bankAccount: string;
}

function bookItems(): BookItem[] {
  const db = protoDb.get();
  const items: BookItem[] = [];
  for (const c of db.collections) {
    if (c.status === 'PDC pending' || c.status === 'Bounced' || c.reconciledAt) continue;
    items.push({
      kind: 'Receipt',
      id: c.id,
      ref: c.number,
      refs: [c.reference, c.chequeNo ?? ''].filter(Boolean),
      date: c.clearedAt ?? c.date,
      amount: c.amount,
    });
  }
  for (const p of db.vendorPayments) {
    if (p.status !== 'Posted' || p.reconciledAt) continue;
    items.push({
      kind: 'Payment',
      id: p.id,
      ref: p.number,
      refs: [p.reference, p.chequeNo ?? ''].filter(Boolean),
      date: p.date,
      amount: -p.amount,
    });
  }
  const matchedIds = new Set(db.bankStatementLines.flatMap((l) => (l.matched?.id ? [l.matched.id] : [])));
  for (const e of db.expenses) {
    if (e.status !== 'Posted' || e.paidFrom !== 'Bank' || matchedIds.has(e.id)) continue;
    items.push({
      kind: 'Expense',
      id: e.id,
      ref: e.number,
      refs: [e.reference ?? ''].filter(Boolean),
      date: e.date,
      amount: -r2(e.amount * (1 + e.vatRate)),
    });
  }
  return items;
}

function applyMatch(lineId: string, item: BookItem) {
  protoDb.update((s) => ({
    ...s,
    bankStatementLines: s.bankStatementLines.map((l) =>
      l.id === lineId ? { ...l, matched: { kind: item.kind, id: item.id, ref: item.ref } } : l,
    ),
    collections:
      item.kind === 'Receipt'
        ? s.collections.map((c) => (c.id === item.id ? { ...c, reconciledAt: PROTO_TODAY } : c))
        : s.collections,
    vendorPayments:
      item.kind === 'Payment'
        ? s.vendorPayments.map((p) => (p.id === item.id ? { ...p, reconciledAt: PROTO_TODAY } : p))
        : s.vendorPayments,
  }));
}

const looksLikeCharge = (l: BankStatementLine) =>
  l.amount < 0 && /charge|fee|commission|chg/i.test(`${l.description} ${l.reference}`);

export const bankRecApi = {
  state(): Promise<BankRecState> {
    const db = protoDb.get();
    const lines = [...db.bankStatementLines]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => ({ ...l, suggestedCharge: !l.matched && looksLikeCharge(l) }));
    const bookBalance = ledgerBalance(BANK_CODES);
    const bankBalance = r2(lines.reduce((s, l) => s + l.amount, 0));
    return latency({
      lines,
      openItems: bookItems().sort((a, b) => a.date.localeCompare(b.date)),
      bookBalance,
      bankBalance,
      difference: r2(bookBalance - bankBalance),
      unmatched: lines.filter((l) => !l.matched).length,
      bankAccount: ACCOUNTS.bank,
    });
  },
  autoMatch(): Promise<number> {
    const open = protoDb.get().bankStatementLines.filter((l) => !l.matched);
    const matches = autoMatchBank(open, bookItems());
    for (const m of matches) applyMatch(m.lineId, m.item);
    if (matches.length)
      logActivity({
        entity: 'Ledger',
        entityId: 'bank-rec',
        entityRef: 'Bank reconciliation',
        action: `auto-matched ${matches.length} statement line(s)`,
      });
    return latency(matches.length, 200);
  },
  match(lineId: string, itemId: string): Promise<void> {
    const line = protoDb.get().bankStatementLines.find((l) => l.id === lineId);
    const item = bookItems().find((i) => i.id === itemId);
    if (!line || line.matched || !item) return Promise.reject(new Error('Line or book item not available'));
    if (Math.abs(line.amount - item.amount) > 0.005)
      return Promise.reject(new Error('Amounts differ — only equal amounts can be matched'));
    applyMatch(lineId, item);
    logActivity({
      entity: 'Ledger',
      entityId: lineId,
      entityRef: 'Bank reconciliation',
      action: `matched ${line.reference} to ${item.ref}`,
    });
    return latency(undefined, 150);
  },
  unmatch(lineId: string): Promise<void> {
    const line = protoDb.get().bankStatementLines.find((l) => l.id === lineId);
    if (!line?.matched) return Promise.reject(new Error('Line is not matched'));
    const id = line.matched.id;
    protoDb.update((s) => ({
      ...s,
      bankStatementLines: s.bankStatementLines.map((l) =>
        l.id === lineId ? { ...l, matched: undefined } : l,
      ),
      collections: s.collections.map((c) => (c.id === id ? { ...c, reconciledAt: undefined } : c)),
      vendorPayments: s.vendorPayments.map((p) => (p.id === id ? { ...p, reconciledAt: undefined } : p)),
    }));
    return latency(undefined, 150);
  },
  /** Unmatched bank charge → posted expense on 6400 Bank charges, matched to the line. */
  bookCharge(lineId: string): Promise<string> {
    const line = protoDb.get().bankStatementLines.find((l) => l.id === lineId);
    if (!line || line.matched || line.amount >= 0)
      return Promise.reject(new Error('Only unmatched money-out lines can be booked as a bank charge'));
    try {
      const e = postBankChargeExpense({
        date: line.date,
        description: `Bank charges — ${line.description}`,
        amount: -line.amount,
        reference: line.reference,
      });
      protoDb.update((s) => ({
        ...s,
        bankStatementLines: s.bankStatementLines.map((l) =>
          l.id === lineId ? { ...l, matched: { kind: 'Bank charge' as const, id: e.id, ref: e.number } } : l,
        ),
      }));
      return latency(e.number, 200);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error('Could not book the charge'));
    }
  },
  importLines(
    rows: { date: string; description: string; reference: string; amount: number }[],
  ): Promise<number> {
    const valid = rows.filter(
      (r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.amount) && r.amount !== 0,
    );
    if (!valid.length)
      return Promise.reject(new Error('No valid lines (date as YYYY-MM-DD and a non-zero amount)'));
    protoDb.update((s) => ({
      ...s,
      bankStatementLines: [
        ...s.bankStatementLines,
        ...valid.map((r): BankStatementLine => ({
          id: newId('bsl'),
          bankAccount: ACCOUNTS.bank,
          date: r.date,
          description: r.description || '—',
          reference: r.reference || '—',
          amount: r2(r.amount),
        })),
      ],
    }));
    logActivity({
      entity: 'Ledger',
      entityId: 'bank-rec',
      entityRef: 'Bank reconciliation',
      action: `imported ${valid.length} statement line(s)`,
    });
    return latency(valid.length, 200);
  },
};

// ---------- A12 VAT return ----------
export const vatApi = {
  draft(year: number, quarter: 1 | 2 | 3 | 4): Promise<VatReturn & { from: string; to: string }> {
    const db = protoDb.get();
    const range = quarterRange(year, quarter);
    return latency({ ...range, ...computeVatReturn({ ...range, ...db }) });
  },
};

// ---------- A14 period close ----------
export interface CloseCheck {
  key: 'accruals' | 'bank' | 'pdc' | 'vat';
  label: string;
  ok: boolean;
  detail: string;
  href: string;
}

export interface CloseState {
  periodEnd: string;
  lockedUntil?: string;
  checks: CloseCheck[];
  history: { at: string; actor: string; action: string }[];
}

export const periodCloseApi = {
  state(periodEnd: string, vatReviewed: boolean): Promise<CloseState> {
    const db = protoDb.get();
    const run = db.accrualRuns.find((r) => r.periodEnd === periodEnd && r.status === 'Posted');
    const unmatched = db.bankStatementLines.filter((l) => l.date <= periodEnd && !l.matched).length;
    const pendingPdc = db.collections.filter(
      (c) => c.status === 'PDC pending' && (c.chequeDate ?? c.date) <= periodEnd,
    );
    const pendingIssued = db.vendorPayments.filter(
      (p) => p.status === 'PDC issued' && (p.chequeDate ?? p.date) <= periodEnd,
    );
    return latency({
      periodEnd,
      lockedUntil: db.company.lockedUntil,
      checks: [
        {
          key: 'accruals',
          label: 'Month-end accruals posted',
          ok: !!run,
          detail: run ? `${run.number} posted` : 'No accrual run for this period end',
          href: '/accounting/accruals',
        },
        {
          key: 'bank',
          label: 'Bank reconciled',
          ok: unmatched === 0,
          detail: unmatched ? `${unmatched} statement line(s) not matched` : 'All statement lines matched',
          href: '/accounting/bank-reconciliation',
        },
        {
          key: 'pdc',
          label: 'PDCs reviewed',
          ok: pendingPdc.length + pendingIssued.length === 0,
          detail:
            pendingPdc.length + pendingIssued.length
              ? `${pendingPdc.length} received and ${pendingIssued.length} issued cheque(s) due by the period end are still open`
              : 'No matured cheques left open',
          href: '/collections/pdc',
        },
        {
          key: 'vat',
          label: 'VAT reviewed',
          ok: vatReviewed,
          detail: vatReviewed ? 'Marked reviewed' : 'Open the VAT return draft and tick when reviewed',
          href: '/accounting/vat-return',
        },
      ],
      history: db.activity
        .filter((a) => a.entity === 'Settings' && a.entityId === 'period-lock')
        .slice(0, 10)
        .map((a) => ({ at: a.at, actor: a.actor, action: a.action })),
    });
  },
  lock(upTo: string): Promise<void> {
    const cur = protoDb.get().company.lockedUntil;
    if (cur && upTo <= cur) return Promise.reject(new Error(`Already locked up to ${cur}`));
    if (upTo > PROTO_TODAY) return Promise.reject(new Error('You cannot lock a date in the future'));
    protoDb.update((s) => ({ ...s, company: { ...s.company, lockedUntil: upTo } }));
    logActivity({
      entity: 'Settings',
      entityId: 'period-lock',
      entityRef: 'Period lock',
      action: `locked the books up to ${upTo}`,
      changes: [{ field: 'Locked until', from: cur ?? '—', to: upTo }],
    });
    return latency(undefined, 200);
  },
  /** Re-opens periods back to `to` (or fully). A reason is required and logged. */
  unlock(to: string | undefined, reason: string): Promise<void> {
    const cur = protoDb.get().company.lockedUntil;
    if (!cur) return Promise.reject(new Error('No period is locked'));
    if (reason.trim().length < 5) return Promise.reject(new Error('Give a reason of at least 5 characters'));
    if (to && to >= cur)
      return Promise.reject(new Error('The new lock date must be earlier than the current one'));
    protoDb.update((s) => ({ ...s, company: { ...s.company, lockedUntil: to || undefined } }));
    logActivity({
      entity: 'Settings',
      entityId: 'period-lock',
      entityRef: 'Period lock',
      action: `re-opened the books (${to ? `locked up to ${to}` : 'no lock'}) — ${reason.trim()}`,
      changes: [{ field: 'Locked until', from: cur, to: to ?? '—' }],
    });
    return latency(undefined, 200);
  },
  lockedUntil(): Promise<string | null> {
    return latency(protoDb.get().company.lockedUntil ?? null, 40);
  },
};

export function vendorOrCustomer(item: BookItem): string {
  const db = protoDb.get();
  if (item.kind === 'Receipt') {
    const c = db.collections.find((x) => x.id === item.id);
    return c ? lookupName.customer(c.customerId) : '';
  }
  if (item.kind === 'Payment') {
    const p = db.vendorPayments.find((x) => x.id === item.id);
    return p ? lookupName.vendor(p.vendorId) : '';
  }
  return db.expenses.find((x) => x.id === item.id)?.payee ?? '';
}

// ---------- hooks ----------
export function useAccrualPreview(periodEnd: string) {
  return useQuery({
    queryKey: ['accounting', 'accruals', 'preview', periodEnd],
    queryFn: () => accrualsApi.preview(periodEnd),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(periodEnd),
  });
}

export function useAccrualRuns() {
  return useQuery({ queryKey: ['accounting', 'accruals', 'runs'], queryFn: () => accrualsApi.runs() });
}

export function usePostAccruals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ periodEnd, lines }: { periodEnd: string; lines: AccrualLine[] }) =>
      accrualsApi.post(periodEnd, lines),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useBankRec() {
  return useQuery({ queryKey: ['accounting', 'bank-rec'], queryFn: () => bankRecApi.state() });
}

export function useBankRecAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a:
        | { kind: 'auto' }
        | { kind: 'match'; lineId: string; itemId: string }
        | { kind: 'unmatch'; lineId: string }
        | { kind: 'charge'; lineId: string }
        | {
            kind: 'import';
            rows: { date: string; description: string; reference: string; amount: number }[];
          },
    ): Promise<string> => {
      if (a.kind === 'auto') return `${await bankRecApi.autoMatch()} line(s) matched`;
      if (a.kind === 'match') return bankRecApi.match(a.lineId, a.itemId).then(() => 'Matched');
      if (a.kind === 'unmatch') return bankRecApi.unmatch(a.lineId).then(() => 'Match removed');
      if (a.kind === 'charge') return bankRecApi.bookCharge(a.lineId).then((n) => `Expense ${n} posted`);
      return bankRecApi.importLines(a.rows).then((n) => `${n} line(s) imported`);
    },
    onSuccess: () => invalidateFinance(qc),
  });
}

export function useVatReturn(year: number, quarter: 1 | 2 | 3 | 4) {
  return useQuery({
    queryKey: ['accounting', 'vat-return', year, quarter],
    queryFn: () => vatApi.draft(year, quarter),
  });
}

export function usePeriodClose(periodEnd: string, vatReviewed: boolean) {
  return useQuery({
    queryKey: ['accounting', 'period-close', periodEnd, vatReviewed],
    queryFn: () => periodCloseApi.state(periodEnd, vatReviewed),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(periodEnd),
  });
}

export function useLockedUntil() {
  return useQuery({ queryKey: ['accounting', 'locked-until'], queryFn: () => periodCloseApi.lockedUntil() });
}

export function usePeriodLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { kind: 'lock'; upTo: string } | { kind: 'unlock'; to?: string; reason: string }) =>
      a.kind === 'lock' ? periodCloseApi.lock(a.upTo) : periodCloseApi.unlock(a.to, a.reason),
    onSuccess: () => {
      invalidateFinance(qc);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
