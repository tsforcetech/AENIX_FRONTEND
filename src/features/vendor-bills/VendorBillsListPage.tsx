import { getRouteApi, useNavigate } from '@tanstack/react-router';
import type { BillStatus } from '@/domain/types';
import { jobKindLabel } from '@/domain/workflow';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ButtonLink } from '@/shared/ui/Button';
import { formatDate } from '@/shared/utils/format';
import { useVendorBills, type VendorBillRow } from './api';
import { VarianceTag } from './VarianceTag';

const route = getRouteApi('/_app/vendor-bills');
const STATUSES: BillStatus[] = ['Draft', 'Approved', 'Partially paid', 'Paid', 'Overdue'];

const columns: Column<VendorBillRow>[] = [
  {
    key: 'number',
    header: 'Purchase invoice',
    cell: (r) => (
      <div>
        <DocRef>{r.number}</DocRef>
        <p className="whitespace-nowrap font-mono text-caption text-fg-muted">{r.vendorRef}</p>
      </div>
    ),
  },
  {
    key: 'vendor',
    header: 'Vendor',
    cell: (r) => (
      <div className="min-w-40">
        <p className="font-medium">{r.vendorName}</p>
        <p className="text-caption text-fg-muted">{r.vendorCategory}</p>
      </div>
    ),
  },
  {
    key: 'job',
    header: 'Job / PO',
    hideOnMobile: true,
    cell: (r) => (
      <div className="space-y-1 whitespace-nowrap">
        {r.po ? <p className="font-mono text-caption text-fg-muted">{r.po.number}</p> : null}
        {r.workOrderNumber && r.jobCategory ? (
          <p className="flex items-center gap-1.5">
            <JobKindIcon category={r.jobCategory} mode={r.jobMode} className="size-4 text-fg-muted" />
            <span className="font-mono text-[13px]">{r.workOrderNumber}</span>
            <span className="sr-only">{jobKindLabel(r.jobCategory, r.jobMode)}</span>
          </p>
        ) : (
          <p className="text-fg-muted">—</p>
        )}
        {r.draftedAtCompletion ? (
          <Badge tone="info" dot={false}>
            Drafted at job completion
          </Badge>
        ) : null}
        {r.match ? (
          <Badge tone={r.match.ok ? 'success' : 'danger'} dot={false}>
            {r.match.ok ? '3-way matched' : '3-way: review'}
          </Badge>
        ) : r.variance !== undefined ? (
          <VarianceTag variance={r.variance} />
        ) : null}
      </div>
    ),
  },
  {
    key: 'dates',
    header: 'Due',
    hideOnMobile: true,
    cell: (r) => (
      <div className="whitespace-nowrap">
        <p>{formatDate(r.dueDate)}</p>
        {r.daysOverdue > 0 ? (
          <p className="text-caption font-medium text-danger">{r.daysOverdue} days overdue</p>
        ) : (
          <p className="text-caption text-fg-muted">Billed {formatDate(r.billDate)}</p>
        )}
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
    cell: (r) => (
      <Money amount={r.outstanding} muted={r.outstanding === 0} className="whitespace-nowrap font-medium" />
    ),
  },
  { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
];

export function VendorBillsListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/vendor-bills' });
  const { data, isLoading, isFetching, error } = useVendorBills({
    page: search.page,
    status: search.status,
    search: search.q,
  });

  return (
    <div>
      <PageHeader
        title="Purchase invoices"
        description="Vendor invoices recorded against purchase orders and checked with a 3-way match (PO vs GRN / POD vs invoice). Approve, then pay."
        actions={
          <ButtonLink to="/purchase-orders" variant="secondary">
            Record from a purchase order
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
          searchPlaceholder="Search invoice, vendor ref, vendor, job…"
        />
        <DataTable
          caption="Purchase invoices"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/vendor-bills/$id', params: { id: r.id } })}
          emptyTitle="No purchase invoices match"
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
