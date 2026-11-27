import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { StatusBadge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { formatDate } from '@/shared/utils/format';
import { PO_STATUSES, usePurchaseOrders, type PurchaseOrderRow } from './api';

const route = getRouteApi('/_app/purchase-orders');

const columns: Column<PurchaseOrderRow>[] = [
  {
    key: 'number',
    header: 'PO',
    cell: (r) => (
      <div>
        <DocRef>{r.number}</DocRef>
        <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.issuedAt)}</p>
      </div>
    ),
  },
  {
    key: 'vendor',
    header: 'Vendor / service',
    cell: (r) => (
      <div className="min-w-44">
        <p className="font-medium">{r.vendorName}</p>
        <p className="text-caption text-fg-muted">{r.serviceName}</p>
      </div>
    ),
  },
  {
    key: 'job',
    header: 'Job',
    cell: (r) => (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <JobKindIcon category={r.jobCategory} mode={r.jobMode} className="size-4 text-fg-muted" />
        <span className="font-mono text-[13px] font-medium">{r.jobNumber}</span>
      </span>
    ),
  },
  {
    key: 'amount',
    header: 'Amount incl. VAT',
    align: 'right',
    cell: (r) => <Money amount={r.total} className="font-medium" />,
  },
  {
    key: 'bill',
    header: 'Vendor invoice',
    hideOnMobile: true,
    cell: (r) =>
      r.vendorBillId ? (
        <span className="text-caption text-success">Recorded</span>
      ) : r.status === 'Completed' ? (
        <span className="text-caption font-medium text-warning">Awaiting invoice</span>
      ) : (
        <span className="text-caption text-fg-muted">—</span>
      ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function PurchaseOrdersListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/purchase-orders' });
  const { data, isLoading, isFetching, error } = usePurchaseOrders({
    page: search.page,
    status: search.status,
    search: search.q,
  });
  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Issued to vendors when they are assigned to a job — before the work. Vendor invoices are matched against the PO and the job’s GRN / POD."
      />
      <Card>
        <ListToolbar
          tabs={statusTabs(PO_STATUSES, data?.counts)}
          status={search.status}
          onStatus={(s) =>
            void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
          }
          search={search.q ?? ''}
          onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
          searchPlaceholder="Search PO, vendor, job…"
        />
        <DataTable
          caption="Purchase orders"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/purchase-orders/$id', params: { id: r.id } })}
          emptyTitle="No purchase orders match"
          emptyDescription="Assign a vendor on a job to issue a purchase order."
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
