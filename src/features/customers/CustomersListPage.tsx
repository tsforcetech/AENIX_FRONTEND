import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { StatusBadge } from '@/shared/ui/Badge';
import { ButtonLink } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useCustomers, type CustomerRow } from './api';

const route = getRouteApi('/_app/customers');
const STATUSES = ['Active', 'On hold', 'Inactive'] as const;

const columns: Column<CustomerRow>[] = [
  { key: 'code', header: 'Code', cell: (r) => <DocRef className="whitespace-nowrap">{r.code}</DocRef> },
  {
    key: 'name',
    header: 'Customer',
    cell: (r) => (
      <div className="min-w-44">
        <p className="font-medium">{r.name}</p>
        <p className="text-caption text-fg-muted">
          {r.industry} · {r.city}, {r.country}
        </p>
      </div>
    ),
  },
  {
    key: 'contact',
    header: 'Contact',
    hideOnMobile: true,
    cell: (r) => (
      <div>
        <p className="whitespace-nowrap">{r.contactName}</p>
        <p className="max-w-48 truncate text-caption text-fg-muted" title={r.contactEmail}>
          {r.contactEmail}
        </p>
      </div>
    ),
  },
  {
    key: 'limit',
    header: 'Credit limit',
    align: 'right',
    hideOnMobile: true,
    cell: (r) => <Money amount={r.creditLimit} />,
  },
  {
    key: 'outstanding',
    header: 'Outstanding',
    align: 'right',
    cell: (r) => <Money amount={r.outstanding} muted={r.outstanding === 0} />,
  },
  {
    key: 'used',
    header: 'Credit used',
    hideOnMobile: true,
    cell: (r) => (
      <div className="w-28">
        <span className="text-caption tabular-nums text-fg-secondary">{r.creditUsedPct}%</span>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="meter"
          aria-label={`${r.name} credit used`}
          aria-valuenow={r.creditUsedPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={clsx(
              'h-full rounded-full',
              r.creditUsedPct >= 80 ? 'bg-danger' : 'bg-surface-inverse',
            )}
            style={{ width: `${Math.max(r.creditUsedPct, 2)}%` }}
          />
        </div>
      </div>
    ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function CustomersListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/customers' });
  const { data, isLoading, isFetching, error } = useCustomers({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  return (
    <div>
      <PageHeader
        title="Customers"
        description="Customer master: credit terms, contacts and account standing."
        actions={
          <ButtonLink to="/customers/new" icon={<Plus aria-hidden="true" />}>
            New customer
          </ButtonLink>
        }
      />
      <Card>
        <ListToolbar
          tabs={statusTabs(STATUSES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search code, name, city…"
        />
        <DataTable
          caption="Customers"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/customers/$id', params: { id: r.id } })}
          emptyTitle="No customers match"
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
