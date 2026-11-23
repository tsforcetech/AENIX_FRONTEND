import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { WorkOrderStatus } from '@/domain/types';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { ButtonLink } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef, Money } from '@/shared/ui/Money';
import { modeIcons } from '@/shared/ui/ModeIcon';
import { PageHeader } from '@/shared/ui/PageHeader';
import { formatDate } from '@/shared/utils/format';
import { useWorkOrders, type WorkOrderRow } from './api';
import { SourceBadge } from './SourceBadge';

const route = getRouteApi('/_app/work-orders');
const STATUSES: WorkOrderStatus[] = [
  'Draft',
  'Confirmed',
  'In progress',
  'In transit',
  'Delivered',
  'Completed',
];

const columns: Column<WorkOrderRow>[] = [
  {
    key: 'number',
    header: 'Job',
    cell: (r) => (
      <div>
        <DocRef>{r.number}</DocRef>
        <div className="mt-1">
          <SourceBadge type={r.source.type} />
        </div>
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Customer / lane',
    cell: (r) => {
      const Icon = modeIcons[r.mode];
      return (
        <div className="min-w-48">
          <p className="font-medium">{r.customerName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-caption text-fg-muted">
            <Icon aria-label={`${r.mode} freight`} className="size-3.5 shrink-0" />
            {r.origin} → {r.destination}
          </p>
        </div>
      );
    },
  },
  {
    key: 'progress',
    header: 'Milestone',
    hideOnMobile: true,
    cell: (r) => (
      <div className="w-44">
        <p className="truncate text-caption text-fg-secondary">{r.currentMilestone}</p>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={r.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${r.number} progress`}
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(r.progress, 3)}%` }} />
        </div>
      </div>
    ),
  },
  {
    key: 'eta',
    header: 'ETA',
    hideOnMobile: true,
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.eta)}</span>,
  },
  {
    key: 'revenue',
    header: 'Revenue',
    align: 'right',
    cell: (r) => (
      <div>
        <Money amount={r.revenue} className="whitespace-nowrap font-medium" />
        <p className={`text-caption ${r.marginPct < 15 ? 'text-warning' : 'text-fg-muted'}`}>
          {r.marginPct}% margin
        </p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={r.status} />
        {r.priority !== 'Normal' ? (
          <Badge tone={r.priority === 'Urgent' ? 'danger' : 'warning'}>{r.priority}</Badge>
        ) : null}
      </div>
    ),
  },
];

export function WorkOrdersListPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/work-orders' });
  const { data, isLoading, isFetching, error } = useWorkOrders({
    page: search.page,
    status: search.status,
    search: search.q,
  });

  return (
    <div>
      <PageHeader
        title="Work orders"
        description="Every job from booking to proof of delivery. A work order is the job — created from a quotation, a contract, or directly."
        actions={
          <ButtonLink to="/work-orders/new" icon={<Plus aria-hidden="true" />}>
            New work order
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
          searchPlaceholder="Search job, customer, lane, quotation…"
        />
        <DataTable
          caption="Work orders"
          columns={columns}
          rows={data?.items}
          rowKey={(r) => r.id}
          loading={isLoading || isFetching}
          error={error}
          onRowClick={(r) => void navigate({ to: '/work-orders/$id', params: { id: r.id } })}
          emptyTitle="No work orders match"
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
