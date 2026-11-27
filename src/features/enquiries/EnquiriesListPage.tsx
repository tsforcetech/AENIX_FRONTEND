import { getRouteApi, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Columns3, List, Plus } from 'lucide-react';
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
import { EnquiryBoard } from './EnquiryBoard';

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
  const board = search.view !== 'list';
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
          <>
            <ViewSwitch
              board={board}
              onChange={(toBoard) =>
                void navigate({
                  search: (p) => ({ ...p, view: toBoard ? undefined : 'list', page: undefined }),
                })
              }
            />
            <ButtonLink to="/enquiries/new" icon={<Plus aria-hidden="true" />}>
              New enquiry
            </ButtonLink>
          </>
        }
      />
      {board ? (
        <div className="space-y-4">
          <Card>
            <ListToolbar
              search={search.q ?? ''}
              onSearch={(q) =>
                void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })
              }
              searchPlaceholder="Search number, customer, location…"
              extra={
                <ServiceTypeFilter
                  value={search.type}
                  onChange={(type) => void navigate({ search: (p) => ({ ...p, type, page: undefined }) })}
                />
              }
            />
            <div className="h-4" />
          </Card>
          <EnquiryBoard params={{ search: search.q, type: search.type }} />
        </div>
      ) : (
        <Card>
          <ListToolbar
            tabs={statusTabs(STATUSES, data?.counts)}
            status={search.status}
            onStatus={(s) =>
              void navigate({
                search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }),
              })
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
      )}
    </div>
  );
}

function ViewSwitch({ board, onChange }: { board: boolean; onChange: (board: boolean) => void }) {
  const opts = [
    { board: true, label: 'Board', icon: Columns3 },
    { board: false, label: 'List', icon: List },
  ];
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-lg bg-surface-muted p-1">
      {opts.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={board === o.board}
          onClick={() => onChange(o.board)}
          className={clsx(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-body-s font-medium transition-colors',
            board === o.board ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          <o.icon aria-hidden="true" className="size-4" />
          {o.label}
        </button>
      ))}
    </div>
  );
}
