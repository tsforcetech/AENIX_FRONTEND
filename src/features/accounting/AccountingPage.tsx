import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { JournalEntry } from '@/domain/types';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { Tabs } from '@/shared/ui/Tabs';
import { formatDate } from '@/shared/utils/format';
import { useArAgeing, useJournals, useTrialBalance, type JournalRow } from './api';
import { ChartOfAccountsView } from './ChartOfAccountsView';
import { useLockedUntil } from './closing';
import { ButtonLink } from '@/shared/ui/Button';

const route = getRouteApi('/_app/accounting');
const SOURCES: JournalEntry['source'][] = [
  'Invoice',
  'Storage billing',
  'Collection',
  'Payment',
  'Vendor bill',
  'Credit note',
  'Debit note',
  'Write-off',
  'Expense',
  'Accrual',
  'Manual',
];

const columns: Column<JournalRow>[] = [
  {
    key: 'number',
    header: 'Journal',
    cell: (r) => (
      <div>
        <DocRef>{r.number}</DocRef>
        <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.date)}</p>
      </div>
    ),
  },
  {
    key: 'source',
    header: 'Source',
    cell: (r) => (
      <div className="whitespace-nowrap">
        <p>{r.source}</p>
        <p className="font-mono text-caption text-fg-muted">{r.reference}</p>
      </div>
    ),
  },
  {
    key: 'memo',
    header: 'Memo',
    hideOnMobile: true,
    cell: (r) => <p className="min-w-48 text-fg-secondary">{r.memo}</p>,
  },
  {
    key: 'debit',
    header: 'Total debit',
    align: 'right',
    cell: (r) => <Money amount={r.totalDebit} className="whitespace-nowrap" />,
  },
  {
    key: 'check',
    header: 'Balance',
    hideOnMobile: true,
    cell: (r) =>
      r.balanced ? <Badge tone="success">Balanced</Badge> : <Badge tone="danger">Out of balance</Badge>,
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function AccountingPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/accounting' });
  const view = search.view ?? 'journals';
  const lockedUntil = useLockedUntil();

  return (
    <div>
      <PageHeader
        title="Accounting"
        description="Journals from invoices, receipts, purchase invoices and payments; the chart of accounts where staff add ledger accounts."
        meta={
          lockedUntil.data ? (
            <Badge tone="dark">{`Books locked up to ${formatDate(lockedUntil.data)}`}</Badge>
          ) : lockedUntil.data === null ? (
            <Badge tone="warning">No period locked</Badge>
          ) : null
        }
        actions={
          <>
            <ButtonLink to="/accounting/accruals" variant="secondary" size="sm">
              Accruals
            </ButtonLink>
            <ButtonLink to="/accounting/bank-reconciliation" variant="secondary" size="sm">
              Bank reconciliation
            </ButtonLink>
            <ButtonLink to="/accounting/vat-return" variant="secondary" size="sm">
              VAT return
            </ButtonLink>
            <ButtonLink to="/accounting/period-close" variant="secondary" size="sm">
              Period close
            </ButtonLink>
            <ButtonLink to="/expenses" variant="secondary" size="sm">
              Expenses
            </ButtonLink>
          </>
        }
      />
      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-subtle p-4 text-body-s text-warning"
      >
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p>
          <strong className="font-semibold">
            Chart of accounts and posting rules pending accountant sign-off (Phase 8).
          </strong>{' '}
          Accounts and journals shown here are illustrative prototype data. Posted journals are never edited —
          corrections are made by reversal.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="px-5 pt-4">
            <Tabs
              label="Accounting views"
              value={view}
              onChange={(v) =>
                void navigate({
                  search: { view: v === 'journals' ? undefined : (v as 'trial-balance' | 'accounts') },
                })
              }
              items={[
                { value: 'journals', label: 'Journals' },
                { value: 'trial-balance', label: 'Trial balance' },
                { value: 'accounts', label: 'Chart of accounts' },
              ]}
            />
          </div>
          {view === 'journals' ? (
            <JournalsView />
          ) : view === 'accounts' ? (
            <ChartOfAccountsView />
          ) : (
            <TrialBalanceView />
          )}
        </Card>
        <AgeingCard />
      </div>
    </div>
  );
}

function JournalsView() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/accounting' });
  const { data, isLoading, isFetching, error } = useJournals({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  return (
    <>
      <ListToolbar
        tabs={statusTabs(SOURCES, data?.counts)}
        status={search.status}
        onStatus={(s) =>
          void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
        }
        search={search.q ?? ''}
        onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
        searchPlaceholder="Search journal, reference, memo…"
      />
      <DataTable
        caption="Journal entries"
        columns={columns}
        rows={data?.items}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        error={error}
        onRowClick={(r) => void navigate({ to: '/accounting/$id', params: { id: r.id } })}
        emptyTitle="No journals match"
        footer={
          data ? (
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={(page) => void navigate({ search: (p) => ({ ...p, page }) })}
            />
          ) : null
        }
      />
    </>
  );
}

function TrialBalanceView() {
  const { data, isLoading, error } = useTrialBalance();
  if (error)
    return (
      <div className="p-5">
        <StatusMessage kind="error" title="Could not load the trial balance" />
      </div>
    );
  if (isLoading || !data)
    return (
      <div className="p-5">
        <StatusMessage kind="loading" title="Building trial balance…" />
      </div>
    );
  return (
    <div className="p-5">
      <div
        className={clsx(
          'mb-4 flex items-center gap-2 text-body-s font-medium',
          data.balanced ? 'text-success' : 'text-danger',
        )}
      >
        {data.balanced ? (
          <CheckCircle2 aria-hidden="true" className="size-4" />
        ) : (
          <AlertTriangle aria-hidden="true" className="size-4" />
        )}
        {data.balanced ? 'Debits equal credits' : 'Trial balance does not balance'} · as of{' '}
        {formatDate(data.asOf)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-body-s">
          <caption className="sr-only">Trial balance</caption>
          <thead>
            <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
              <th scope="col" className="py-2 pr-3 text-left font-medium">
                Account
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Debit
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Credit
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.account} className="border-b border-border-subtle">
                <td className="py-2.5 pr-3">
                  <span className="font-mono text-[13px] text-fg-muted">{l.account.slice(0, 4)}</span>{' '}
                  {l.account.slice(5)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Money amount={l.debit} muted={l.debit === 0} className="whitespace-nowrap" />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Money amount={l.credit} muted={l.credit === 0} className="whitespace-nowrap" />
                </td>
                <td className="py-2.5 pl-3 text-right">
                  <span className="whitespace-nowrap tabular-nums">
                    <Money amount={Math.abs(l.balance)} />{' '}
                    <span className="text-caption text-fg-muted">{l.balance >= 0 ? 'Dr' : 'Cr'}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="py-3 pr-3 text-left">
                Total
              </th>
              <td className="px-3 py-3 text-right">
                <Money amount={data.totalDebit} className="whitespace-nowrap" />
              </td>
              <td className="px-3 py-3 text-right">
                <Money amount={data.totalCredit} className="whitespace-nowrap" />
              </td>
              <td className="py-3 pl-3 text-right">
                {data.balanced ? (
                  <Badge tone="success">Balanced</Badge>
                ) : (
                  <Badge tone="danger">Difference</Badge>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function AgeingCard() {
  const { data } = useArAgeing();
  const total = (data ?? []).reduce((s, b) => s + b.amount, 0);
  const tone = ['bg-success', 'bg-warning', 'bg-danger/70', 'bg-danger'];
  return (
    <Card className="self-start">
      <CardHeader title="Receivables ageing" description="Open invoices by days past due" />
      <CardBody>
        <p className="text-[24px] font-semibold tracking-tight">
          <Money amount={total} />
        </p>
        <ul className="mt-4 space-y-3">
          {(data ?? []).map((b, i) => (
            <li key={b.label}>
              <div className="flex items-center justify-between text-body-s">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={clsx('size-2.5 rounded-sm', tone[i])} />
                  {b.label}
                  <span className="text-caption text-fg-muted">({b.count})</span>
                </span>
                <Money amount={b.amount} className="font-medium" />
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={clsx('h-full rounded-full', tone[i])}
                  style={{ width: `${total ? (b.amount / total) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-caption text-fg-muted">As of {formatDate('2026-11-23')} (prototype date).</p>
      </CardBody>
    </Card>
  );
}
