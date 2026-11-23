import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import type { ContractStatus } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { formatDate } from '@/shared/utils/format';
import { useContracts, type ContractRow } from './api';

const route = getRouteApi('/_app/contracts');
const STATUSES: ContractStatus[] = ['Active', 'Expiring', 'Draft', 'Expired'];

export function remainingLabel(days: number) {
  if (days < 0) return `Ended ${Math.abs(days)} d ago`;
  if (days === 0) return 'Ends today';
  return `${days} d left`;
}

const columns: Column<ContractRow>[] = [
  {
    key: 'number',
    header: 'Contract',
    cell: (r) => (
      <div className="min-w-48">
        <DocRef>{r.number}</DocRef>
        <p className="font-medium">{r.title}</p>
      </div>
    ),
  },
  { key: 'customer', header: 'Customer', cell: (r) => <span className="font-medium">{r.customerName}</span> },
  {
    key: 'period',
    header: 'Period',
    hideOnMobile: true,
    cell: (r) => (
      <div className="min-w-44">
        <p className="whitespace-nowrap">
          {formatDate(r.startDate)} – {formatDate(r.endDate)}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-fg-secondary" style={{ width: `${r.elapsedPct}%` }} />
        </div>
      </div>
    ),
  },
  {
    key: 'billing',
    header: 'Billing',
    hideOnMobile: true,
    cell: (r) => <span className="text-fg-secondary">{r.billingCycle}</span>,
  },
  {
    key: 'remaining',
    header: 'Remaining',
    align: 'right',
    cell: (r) => (
      <span
        className={clsx(
          'whitespace-nowrap font-medium',
          r.daysRemaining < 0 ? 'text-fg-muted' : r.daysRemaining <= 30 ? 'text-warning' : 'text-fg',
        )}
      >
        {remainingLabel(r.daysRemaining)}
      </span>
    ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function ContractsListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/contracts' });
  const { data, isLoading, isFetching, error } = useContracts({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  const expiring = data?.counts?.Expiring ?? 0;

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Agreed rates for long-term customers. Jobs under a contract use these rates without a new quotation."
        meta={
          expiring ? (
            <span className="rounded-full bg-warning-subtle px-2.5 py-0.5 text-caption font-medium text-warning">
              {expiring} expiring soon
            </span>
          ) : null
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
          searchPlaceholder="Search number, title, customer…"
        />
        <DataTable
          caption="Contracts"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/contracts/$id', params: { id: r.id } })}
          emptyTitle="No contracts match"
          emptyDescription="Long-term quotations become contracts once accepted."
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
