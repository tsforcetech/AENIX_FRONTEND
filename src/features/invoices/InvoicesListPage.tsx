import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { AlarmClock, CalendarClock, Receipt, Wallet } from 'lucide-react';
import type { InvoiceStatus } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { KpiCard } from '@/shared/ui/KpiCard';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ButtonLink } from '@/shared/ui/Button';
import { Plus } from 'lucide-react';
import { formatDate, formatMoneyCompact } from '@/shared/utils/format';
import { useInvoiceKpis, useInvoices, type InvoiceRow } from './api';

const route = getRouteApi('/_app/invoices');
const STATUSES: InvoiceStatus[] = ['Draft', 'Posted', 'Partially paid', 'Paid', 'Overdue'];

const columns: Column<InvoiceRow>[] = [
  {
    key: 'number',
    header: 'Invoice',
    cell: (r) => (
      <div>
        <DocRef>{r.number}</DocRef>
        <p className="whitespace-nowrap text-caption text-fg-muted">
          {r.status === 'Draft' ? 'Not issued' : formatDate(r.issueDate)}
        </p>
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) => <p className="min-w-40 font-medium">{r.customerName}</p>,
  },
  {
    key: 'source',
    header: 'Billed from',
    hideOnMobile: true,
    cell: (r) =>
      r.salesOrders.length ? (
        <div className="flex max-w-56 flex-wrap gap-x-2 gap-y-0.5">
          {r.salesOrders.map((so) => (
            <DocRef key={so.id}>{so.number}</DocRef>
          ))}
          {r.salesOrders.length > 1 ? (
            <span className="w-full text-caption text-fg-muted">{r.salesOrders.length} sales orders</span>
          ) : null}
        </div>
      ) : (
        <div className="whitespace-nowrap">
          <p className="font-mono text-[13px]">{r.sourceLabel}</p>
          <p className="text-caption text-fg-muted">
            {r.sourceType === 'Storage' ? 'Storage run' : r.sourceType}
          </p>
        </div>
      ),
  },
  {
    key: 'due',
    header: 'Due',
    cell: (r) => (
      <div className="whitespace-nowrap">
        <p>{formatDate(r.dueDate)}</p>
        {r.daysOverdue > 0 ? (
          <p className="text-caption font-medium text-danger">{r.daysOverdue} days overdue</p>
        ) : null}
      </div>
    ),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    cell: (r) => <Money amount={r.total} className="whitespace-nowrap" />,
  },
  {
    key: 'outstanding',
    header: 'Outstanding',
    align: 'right',
    cell: (r) =>
      r.status === 'Cancelled' ? (
        <span className="text-fg-muted">—</span>
      ) : (
        <Money amount={r.outstanding} muted={r.outstanding === 0} className="whitespace-nowrap font-medium" />
      ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function InvoicesListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/invoices' });
  const { data, isLoading, isFetching, error } = useInvoices({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  const kpis = useInvoiceKpis();
  const k = kpis.data;

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Customer tax invoices. One invoice can bill several sales orders of the same customer. Posted invoices are read-only — corrections go through credit notes."
        actions={
          <ButtonLink to="/invoices/new" icon={<Plus aria-hidden="true" />}>
            New invoice
          </ButtonLink>
        }
      />
      <section aria-label="Receivables summary" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total outstanding"
          value={k ? formatMoneyCompact(k.outstanding) : '…'}
          icon={<Receipt />}
        />
        <KpiCard
          label="Overdue"
          value={k ? formatMoneyCompact(k.overdue) : '…'}
          icon={<AlarmClock />}
          footnote={
            k ? (
              <span className={k.overdueCount ? 'font-medium text-danger' : 'text-success'}>
                {k.overdueCount ? `${k.overdueCount} invoice(s) past due` : 'Nothing overdue'}
              </span>
            ) : null
          }
        />
        <KpiCard
          label="Due in next 7 days"
          value={k ? formatMoneyCompact(k.dueNext7) : '…'}
          icon={<CalendarClock />}
        />
        <KpiCard
          label="Collected this month"
          value={k ? formatMoneyCompact(k.collectedMonth) : '…'}
          icon={<Wallet />}
        />
      </section>
      <Card>
        <ListToolbar
          tabs={statusTabs(STATUSES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search invoice, customer, job…"
        />
        <DataTable
          caption="Invoices"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/invoices/$id', params: { id: r.id } })}
          emptyTitle="No invoices match"
          emptyDescription="Try another status or search term."
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
      </Card>
    </div>
  );
}
