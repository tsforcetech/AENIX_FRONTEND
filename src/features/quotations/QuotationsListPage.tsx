import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import type { QuotationStatus } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { ButtonLink } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { formatDate } from '@/shared/utils/format';
import { ServiceTypeCell, ServiceTypeFilter } from '@/features/sales-orders/commercial-ui';
import { useQuotations, type QuotationRow } from './api';

const route = getRouteApi('/_app/quotations');
const STATUSES: QuotationStatus[] = ['Draft', 'Pending approval', 'Sent', 'Accepted', 'Rejected', 'Expired'];

const columns: Column<QuotationRow>[] = [
  {
    key: 'number',
    header: 'Quotation',
    cell: (r) => (
      <div className="whitespace-nowrap">
        <DocRef>{r.number}</DocRef>
        <span className="ml-1.5 rounded bg-surface-muted px-1.5 py-px font-mono text-[11px] text-fg-muted">
          v{r.version}
        </span>
        <p className="text-caption text-fg-muted">{formatDate(r.createdAt)}</p>
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) => (
      <div className="min-w-36">
        <p className="font-medium">{r.customerName}</p>
        <p className="text-caption text-fg-muted">{r.owner}</p>
      </div>
    ),
  },
  {
    key: 'lane',
    header: 'Service',
    cell: (r) => (
      <div>
        <ServiceTypeCell
          category={r.serviceCategory}
          mode={r.mode}
          origin={r.origin}
          destination={r.destination}
        />
        <p className="ml-6 text-caption text-fg-muted">{r.agreement}</p>
      </div>
    ),
  },
  {
    key: 'value',
    header: 'Value (excl. VAT)',
    align: 'right',
    cell: (r) => <Money amount={r.revenue} className="whitespace-nowrap font-medium" />,
  },
  {
    key: 'margin',
    header: 'Margin',
    align: 'right',
    hideOnMobile: true,
    cell: (r) => (
      <span className={clsx('font-medium', r.marginPct < 15 ? 'text-warning' : 'text-success')}>
        {r.marginPct}%
      </span>
    ),
  },
  {
    key: 'valid',
    header: 'Valid until',
    hideOnMobile: true,
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.validUntil)}</span>,
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function QuotationsListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/quotations' });
  const { data, isLoading, isFetching, error } = useQuotations({
    page: search.page,
    status: search.status,
    search: search.q,
    type: search.type,
  });

  return (
    <div>
      <PageHeader
        title="Quotations"
        description="Priced offers to customers. An accepted quotation becomes a sales order, or a contract for long-term rates."
        actions={
          <ButtonLink to="/quotations/new" icon={<Plus aria-hidden="true" />}>
            New quotation
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
          searchPlaceholder="Search number, customer, location…"
          extra={
            <ServiceTypeFilter
              value={search.type}
              onChange={(type) => void navigate({ search: (p) => ({ ...p, type, page: undefined }) })}
            />
          }
        />
        <DataTable
          caption="Quotations"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/quotations/$id', params: { id: r.id } })}
          emptyTitle="No quotations match"
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
