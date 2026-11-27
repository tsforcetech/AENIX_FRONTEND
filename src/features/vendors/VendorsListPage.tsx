import { getRouteApi, useNavigate } from '@tanstack/react-router';
import type { VendorCategory } from '@/domain/types';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ButtonLink } from '@/shared/ui/Button';
import { Plus } from 'lucide-react';
import { useVendors, type VendorRow } from './api';
import { Rating } from './Rating';

const route = getRouteApi('/_app/vendors');
const CATEGORIES: VendorCategory[] = [
  'Transporter',
  'Shipping line',
  'Airline',
  'Customs broker',
  'Warehouse',
];

const columns: Column<VendorRow>[] = [
  { key: 'code', header: 'Code', cell: (r) => <DocRef>{r.code}</DocRef> },
  {
    key: 'name',
    header: 'Vendor',
    cell: (r) => (
      <div className="min-w-44">
        <p className="font-medium">{r.name}</p>
        <p className="text-caption text-fg-muted">{r.contactName}</p>
      </div>
    ),
  },
  {
    key: 'category',
    header: 'Category',
    cell: (r) => (
      <Badge tone="neutral" dot={false}>
        {r.category}
      </Badge>
    ),
  },
  {
    key: 'city',
    header: 'Location',
    hideOnMobile: true,
    cell: (r) => (
      <div>
        <p className="whitespace-nowrap">{r.city}</p>
        <p className="text-caption text-fg-muted">{r.country}</p>
      </div>
    ),
  },
  { key: 'rating', header: 'Rating', hideOnMobile: true, cell: (r) => <Rating value={r.rating} /> },
  {
    key: 'terms',
    header: 'Terms',
    hideOnMobile: true,
    cell: (r) => <span className="whitespace-nowrap">{r.paymentTermsDays} days</span>,
  },
  {
    key: 'outstanding',
    header: 'Open bills',
    align: 'right',
    cell: (r) => (
      <div>
        <Money amount={r.outstanding} muted={r.outstanding === 0} />
        <p className="text-caption text-fg-muted">{r.openBills} open</p>
      </div>
    ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function VendorsListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/vendors' });
  const { data, isLoading, isFetching, error } = useVendors({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Carriers, shipping lines, airlines, brokers and warehouses you buy services from."
        actions={
          <ButtonLink to="/vendors/new" icon={<Plus aria-hidden="true" />}>
            New vendor
          </ButtonLink>
        }
      />
      <Card>
        <ListToolbar
          tabs={statusTabs(CATEGORIES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search code, name, city…"
        />
        <DataTable
          caption="Vendors"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/vendors/$id', params: { id: r.id } })}
          emptyTitle="No vendors match"
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
