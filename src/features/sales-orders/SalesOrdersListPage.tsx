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
import { ServicesCell, ServiceTypeFilter } from './commercial-ui';

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
        <p className="text-caption text-fg-muted">
          {r.quotationId ? 'From quotation' : r.contractId ? 'From contract' : 'Direct'}
        </p>
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) => (
      <div className="min-w-32">
        <p className="font-medium">{r.customerName}</p>
        <p className="text-caption text-fg-muted">PO {r.customerPoRef}</p>
      </div>
    ),
  },
  {
    key: 'service',
    header: 'Service',
    cell: (r) => (
      <ServicesCell
        categories={r.serviceCategories}
        mode={r.mode}
        origin={r.origin}
        destination={r.destination}
      />
    ),
  },
  {
    key: 'value',
    header: 'Value (excl. VAT)',
    align: 'right',
    cell: (r) => <Money amount={r.value} className="whitespace-nowrap font-medium" />,
  },
  {
    key: 'invoiced',
    header: 'Invoiced',
    align: 'right',
    hideOnMobile: true,
    cell: (r) =>
      r.billing.invoiced ? (
        <div className="whitespace-nowrap">
          <Money amount={r.billing.invoiced} />
          {r.billing.notInvoiced > 0.005 ? (
            <p className="text-caption text-warning">
              <Money amount={r.billing.notInvoiced} /> to invoice
            </p>
          ) : (
            <p className="text-caption text-success">Fully invoiced</p>
          )}
        </div>
      ) : (
        <span className="whitespace-nowrap text-caption text-fg-muted">
          {r.status === 'Draft' || r.status === 'Cancelled' ? '—' : 'Not invoiced'}
        </span>
      ),
  },
  {
    key: 'balance',
    header: 'Balance due',
    align: 'right',
    cell: (r) =>
      Math.abs(r.billing.balance) < 0.005 ? (
        <span className="text-caption text-fg-muted">—</span>
      ) : r.billing.balance < 0 ? (
        <div className="whitespace-nowrap">
          <Money amount={-r.billing.balance} className="font-medium text-success" />
          <p className="text-caption text-fg-muted">advance held</p>
        </div>
      ) : (
        <Money amount={r.billing.balance} className="whitespace-nowrap font-medium" />
      ),
  },
  {
    key: 'jobs',
    header: 'Jobs',
    hideOnMobile: true,
    cell: (r) =>
      r.workOrderCount ? (
        <div className="w-16">
          <p className="whitespace-nowrap text-caption text-fg-secondary">
            {r.workOrdersCompleted}/{r.workOrderCount} done
          </p>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-label={`${r.number} jobs completed`}
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
        <span className="whitespace-nowrap text-caption text-fg-muted">None yet</span>
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
    billing: search.billing,
  });

  return (
    <div>
      <PageHeader
        title="Sales orders"
        description="The customer's confirmed orders. One order can combine transport, warehouse and other services; it runs as one or more jobs and can be invoiced alone or together with other orders."
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
            <>
              <ServiceTypeFilter
                value={search.type}
                onChange={(type) => void navigate({ search: (p) => ({ ...p, type, page: undefined }) })}
              />
              <label className="flex items-center gap-2 text-body-s text-fg-secondary">
                <input
                  type="checkbox"
                  checked={search.billing === 'not-invoiced'}
                  onChange={(e) =>
                    void navigate({
                      search: (p) => ({
                        ...p,
                        billing: e.target.checked ? ('not-invoiced' as const) : undefined,
                        page: undefined,
                      }),
                    })
                  }
                  className="size-4 accent-[var(--color-brand)]"
                />
                Not fully invoiced
              </label>
            </>
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
