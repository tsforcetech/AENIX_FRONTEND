import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { SalesOrderStatus } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { ButtonLink } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { formatDate } from '@/shared/utils/format';
import { useSalesOrders, type SalesOrderRow } from './api';
import { ServiceTypeCell, ServiceTypeFilter } from './commercial-ui';

const route = getRouteApi('/_app/sales-orders');
const STATUSES: SalesOrderStatus[] = ['Draft', 'Confirmed', 'In progress', 'Completed', 'Cancelled'];

const columns: Column<SalesOrderRow>[] = [
  {
    key: 'number',
    header: 'Sales order',
    cell: (r) => (
      <div className="whitespace-nowrap">
        <DocRef>{r.number}</DocRef>
        <p className="text-caption text-fg-muted">{formatDate(r.orderDate)}</p>
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) => (
      <div className="min-w-40">
        <p className="font-medium">{r.customerName}</p>
        <p className="text-caption text-fg-muted">PO {r.customerPoRef}</p>
      </div>
    ),
  },
  {
    key: 'service',
    header: 'Service',
    cell: (r) => (
      <ServiceTypeCell
        category={r.serviceCategory}
        mode={r.mode}
        origin={r.origin}
        destination={r.destination}
      />
    ),
  },
  {
    key: 'source',
    header: 'Source',
    hideOnMobile: true,
    cell: (r) => (
      <span className="whitespace-nowrap text-caption text-fg-secondary">
        {r.quotationId ? 'Quotation' : r.contractId ? 'Contract' : 'Direct'}
      </span>
    ),
  },
  {
    key: 'value',
    header: 'Value (excl. VAT)',
    align: 'right',
    cell: (r) => <Money amount={r.value} className="whitespace-nowrap font-medium" />,
  },
  {
    key: 'jobs',
    header: 'Work orders',
    hideOnMobile: true,
    cell: (r) =>
      r.workOrderCount ? (
        <div className="w-28">
          <p className="text-caption text-fg-secondary">
            {r.workOrdersCompleted} of {r.workOrderCount} completed
          </p>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-label={`${r.number} work orders completed`}
            aria-valuenow={Math.round((r.workOrdersCompleted / r.workOrderCount) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(r.workOrdersCompleted / r.workOrderCount) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <span className="text-caption text-fg-muted">None yet</span>
      ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function SalesOrdersListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/sales-orders' });
  const { data, isLoading, isFetching, error } = useSalesOrders({
    page: search.page,
    status: search.status,
    search: search.q,
    type: search.type,
  });

  return (
    <div>
      <PageHeader
        title="Sales orders"
        description="Confirmed customer orders for transport, warehousing or a direct service. Each sales order runs as one or more work orders."
        actions={
          <ButtonLink to="/sales-orders/new" icon={<Plus aria-hidden="true" />}>
            New sales order
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
          searchPlaceholder="Search SO, customer, PO reference…"
          extra={
            <ServiceTypeFilter
              value={search.type}
              onChange={(type) => void navigate({ search: (p) => ({ ...p, type, page: undefined }) })}
            />
          }
        />
        <DataTable
          caption="Sales orders"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/sales-orders/$id', params: { id: r.id } })}
          emptyTitle="No sales orders match"
          emptyDescription="Try another status, service type or search term."
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
