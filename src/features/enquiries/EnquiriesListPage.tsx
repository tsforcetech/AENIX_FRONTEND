import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { EnquiryStatus } from '@/domain/types';
import { StatusBadge } from '@/shared/ui/Badge';
import { ButtonLink } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { formatDate, formatNumber } from '@/shared/utils/format';
import { ServicesCell, ServiceTypeFilter } from '@/features/sales-orders/commercial-ui';
import { useEnquiries, type EnquiryRow } from './api';

const route = getRouteApi('/_app/enquiries');
const STATUSES: EnquiryStatus[] = ['New', 'Quoting', 'Quoted', 'Won', 'Lost'];

const columns: Column<EnquiryRow>[] = [
  {
    key: 'number',
    header: 'Enquiry',
    cell: (r) => (
      <div>
        <DocRef>{r.number}</DocRef>
        <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.createdAt)}</p>
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Customer',
    cell: (r) => (
      <div className="min-w-44">
        <p className="font-medium">{r.customerName}</p>
        <p className="text-caption text-fg-muted">{r.cargo.description}</p>
      </div>
    ),
  },
  {
    key: 'route',
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
    key: 'cargo',
    header: 'Cargo',
    hideOnMobile: true,
    cell: (r) => (
      <div className="text-caption text-fg-secondary">
        <p>{r.cargo.equipment}</p>
        {r.cargo.weightKg || r.cargo.volumeCbm ? (
          <p className="text-fg-muted">
            {formatNumber(r.cargo.weightKg)} kg · {r.cargo.volumeCbm} cbm
          </p>
        ) : null}
      </div>
    ),
  },
  {
    key: 'required',
    header: 'Required by',
    hideOnMobile: true,
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.requiredBy)}</span>,
  },
  {
    key: 'owner',
    header: 'Owner',
    hideOnMobile: true,
    cell: (r) => <span className="whitespace-nowrap text-fg-secondary">{r.owner}</span>,
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function EnquiriesListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/enquiries' });
  const { data, isLoading, isFetching, error } = useEnquiries({
    page: search.page,
    status: search.status,
    search: search.q,
    type: search.type,
  });

  return (
    <div>
      <PageHeader
        title="Enquiries"
        description="Customer requests for transport, warehousing or a direct service. Quote them, or confirm a sales order directly."
        actions={
          <ButtonLink to="/enquiries/new" icon={<Plus aria-hidden="true" />}>
            New enquiry
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
          caption="Enquiries"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/enquiries/$id', params: { id: r.id } })}
          emptyTitle="No enquiries match"
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
