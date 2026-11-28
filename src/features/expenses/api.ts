import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assertOpenPeriod } from '@/domain/controls';
import type { Expense } from '@/domain/types';
import { approvalFor, approvalNeeded, onApprovalDecided, requestApproval } from '@/shared/data/approvals';
import { paginate, type ListParams, type Page } from '@/shared/data/paging';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, logActivity, newId, protoDb } from '@/prototype/store';
import { ACCOUNTS, ledgerBalance, nextSeries, postJournal } from '@/features/accounting/ledger';
import { invalidateFinance } from '@/features/invoices/api';

/**
 * A18 overhead expenses outside jobs (rent, salaries, utilities, petty cash). PROTOTYPE ADAPTER —
 * posting rules are illustrative and pending accountant sign-off. Payroll and fixed assets stay
 * outside AENIX until the owner decides.
 */
export interface ExpenseRow extends Expense {
  accountLabel: string;
  vat: number;
  total: number;
}

export interface ExpenseInput {
  date: string;
  accountId: string;
  description: string;
  amount: number;
  vatRate: number;
  paidFrom: Expense['paidFrom'];
  payee: string;
  reference?: string;
}

export interface ExpenseFilters extends ListParams {
  paidFrom?: Expense['paidFrom'];
  accountId?: string;
}

export interface ExpenseSummary {
  pettyCashBalance: number;
  pettyCashSpentMonth: number;
  postedMonth: number;
  pendingApproval: number;
  accounts: { value: string; label: string }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function accountLabel(accountId: string): string {
  const a = protoDb.get().ledgerAccounts.find((x) => x.id === accountId);
  return a ? `${a.code} ${a.name}` : accountId;
}

function toRow(e: Expense): ExpenseRow {
  const vat = r2(e.amount * e.vatRate);
  return { ...e, accountLabel: accountLabel(e.accountId), vat, total: r2(e.amount + vat) };
}

const creditAccount = (paidFrom: Expense['paidFrom']) =>
  paidFrom === 'Petty cash'
    ? ACCOUNTS.pettyCash
    : paidFrom === 'Credit card'
      ? ACCOUNTS.creditCard
      : ACCOUNTS.bank;

/** Dr expense account + VAT input / Cr bank, petty cash or credit card. */
function postExpense(e: Expense): Expense {
  assertOpenPeriod(protoDb.get().company, e.date);
  const vat = r2(e.amount * e.vatRate);
  postJournal({
    date: e.date,
    source: 'Expense',
    reference: e.number,
    memo: `${e.description} — ${e.payee} (${e.paidFrom})`,
    lines: [
      { account: accountLabel(e.accountId), debit: e.amount, credit: 0 },
      { account: ACCOUNTS.vatIn, debit: vat, credit: 0 },
      { account: creditAccount(e.paidFrom), debit: 0, credit: r2(e.amount + vat) },
    ],
  });
  const posted: Expense = { ...e, status: 'Posted' };
  protoDb.update((s) => ({ ...s, expenses: s.expenses.map((x) => (x.id === e.id ? posted : x)) }));
  logActivity({ entity: 'Expense', entityId: e.id, entityRef: e.number, action: 'posted the expense' });
  return posted;
}

onApprovalDecided('Expense', (req) => {
  const e = protoDb.get().expenses.find((x) => x.id === req.entityId);
  if (!e || e.status !== 'Pending approval') return;
  // Back to Draft: approved → posted right away (a failed post can be retried); rejected → stays a draft.
  const next: Expense = { ...e, approval: req.record, status: 'Draft' };
  protoDb.update((s) => ({ ...s, expenses: s.expenses.map((x) => (x.id === e.id ? next : x)) }));
  if (req.record.status === 'Approved') {
    try {
      postExpense(next);
    } catch (err) {
      logActivity({
        entity: 'Expense',
        entityId: e.id,
        entityRef: e.number,
        action: `approved but not posted: ${err instanceof Error ? err.message : 'error'}`,
      });
    }
  }
});

function newExpense(input: ExpenseInput): Expense {
  const db = protoDb.get();
  const acc = db.ledgerAccounts.find((a) => a.id === input.accountId);
  if (!acc || acc.group !== 'Expenses' || acc.kind !== 'Ledger')
    throw new Error('Choose an expense ledger account');
  if (!(input.amount > 0)) throw new Error('Enter an amount more than 0');
  if (input.description.trim().length < 3) throw new Error('Describe the expense');
  if (input.payee.trim().length < 2) throw new Error('Enter who was paid');
  const e: Expense = {
    id: newId('exp'),
    number: nextSeries(
      'EXP',
      db.expenses.map((x) => x.number),
    ),
    date: input.date,
    accountId: input.accountId,
    description: input.description.trim(),
    amount: r2(input.amount),
    vatRate: input.vatRate,
    paidFrom: input.paidFrom,
    payee: input.payee.trim(),
    reference: input.reference?.trim() || undefined,
    status: 'Draft',
  };
  protoDb.update((s) => ({ ...s, expenses: [e, ...s.expenses] }));
  logActivity({
    entity: 'Expense',
    entityId: e.id,
    entityRef: e.number,
    action: `recorded ${e.description}`,
  });
  return e;
}

/** Submit: at or above the 'Expense' rule → approval request; otherwise posts now. */
function submit(id: string): Expense {
  const e = protoDb.get().expenses.find((x) => x.id === id);
  if (!e || e.status !== 'Draft') throw new Error('Only draft expenses can be posted');
  assertOpenPeriod(protoDb.get().company, e.date);
  const total = r2(e.amount * (1 + e.vatRate));
  const rule = e.approval?.status === 'Approved' ? undefined : approvalNeeded('Expense', total);
  if (rule) {
    const record = requestApproval({
      docType: 'Expense',
      rule,
      entity: 'Expense',
      entityId: e.id,
      entityRef: e.number,
      summary: `${e.description} — ${e.payee}`,
      amount: total,
      href: '/expenses',
    });
    const pending: Expense = { ...e, approval: record, status: 'Pending approval' };
    protoDb.update((s) => ({ ...s, expenses: s.expenses.map((x) => (x.id === id ? pending : x)) }));
    return pending;
  }
  return postExpense(e);
}

export const expensesApi = {
  list(params: ExpenseFilters): Promise<Page<ExpenseRow>> {
    const rows = [...protoDb.get().expenses]
      .filter((e) => !params.paidFrom || e.paidFrom === params.paidFrom)
      .filter((e) => !params.accountId || e.accountId === params.accountId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
      .map(toRow);
    return latency(
      paginate(rows, params, {
        searchText: (r) => `${r.number} ${r.description} ${r.payee} ${r.accountLabel} ${r.reference ?? ''}`,
        status: (r) => r.status,
      }),
    );
  },
  summary(): Promise<ExpenseSummary> {
    const db = protoDb.get();
    const month = PROTO_TODAY.slice(0, 7);
    const posted = db.expenses.filter((e) => e.status === 'Posted' && e.date.startsWith(month));
    return latency({
      pettyCashBalance: ledgerBalance(['1120']),
      pettyCashSpentMonth: r2(
        posted.filter((e) => e.paidFrom === 'Petty cash').reduce((s, e) => s + e.amount * (1 + e.vatRate), 0),
      ),
      postedMonth: r2(posted.reduce((s, e) => s + e.amount * (1 + e.vatRate), 0)),
      pendingApproval: db.expenses.filter((e) => e.status === 'Pending approval').length,
      accounts: db.ledgerAccounts
        .filter((a) => a.group === 'Expenses' && a.kind === 'Ledger' && a.active && !a.party)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
    });
  },
  create(input: ExpenseInput, post: boolean): Promise<Expense> {
    try {
      const e = newExpense(input);
      return latency(post ? submit(e.id) : e, 250);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error('Could not save the expense'));
    }
  },
  post(id: string): Promise<Expense> {
    try {
      return latency(submit(id), 250);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error('Could not post the expense'));
    }
  },
  /** Petty cash float top-up from the bank (Dr 1120 / Cr 1110). */
  topUpPettyCash(amount: number, date: string): Promise<void> {
    if (!(amount > 0)) return Promise.reject(new Error('Enter an amount more than 0'));
    try {
      postJournal({
        date,
        source: 'Manual',
        reference: 'PETTY-CASH',
        memo: 'Petty cash top-up from bank',
        lines: [
          { account: ACCOUNTS.pettyCash, debit: r2(amount), credit: 0 },
          { account: ACCOUNTS.bank, debit: 0, credit: r2(amount) },
        ],
      });
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error('Could not post'));
    }
    logActivity({
      entity: 'Expense',
      entityId: 'petty-cash',
      entityRef: 'Petty cash',
      action: `topped up ${amount}`,
    });
    return latency(undefined, 200);
  },
  approvalOf(id: string) {
    return approvalFor(id, 'Expense');
  },
};

/** A13: unmatched bank charge on the statement → posted expense on 6400 Bank charges. */
export function postBankChargeExpense(input: {
  date: string;
  description: string;
  amount: number;
  reference: string;
}): Expense {
  const acc = protoDb.get().ledgerAccounts.find((a) => a.code === '6400');
  if (!acc) throw new Error('Ledger 6400 Bank charges is missing');
  const e = newExpense({
    date: input.date,
    accountId: acc.id,
    description: input.description,
    amount: input.amount,
    vatRate: 0,
    paidFrom: 'Bank',
    payee: 'Bank',
    reference: input.reference,
  });
  return postExpense(e);
}

export function useExpenses(params: ExpenseFilters) {
  return useQuery({
    queryKey: ['expenses', 'list', params],
    queryFn: () => expensesApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useExpenseSummary() {
  return useQuery({ queryKey: ['expenses', 'summary'], queryFn: () => expensesApi.summary() });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, post }: { input: ExpenseInput; post: boolean }) => expensesApi.create(input, post),
    onSuccess: () => invalidateFinance(qc),
  });
}

export function usePostExpense() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: expensesApi.post, onSuccess: () => invalidateFinance(qc) });
}

export function useTopUpPettyCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ amount, date }: { amount: number; date: string }) =>
      expensesApi.topUpPettyCash(amount, date),
    onSuccess: () => invalidateFinance(qc),
  });
}
