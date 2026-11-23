import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardCheck,
  PackageCheck,
  SlidersHorizontal,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { KpiCard } from '@/shared/ui/KpiCard';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Tabs } from '@/shared/ui/Tabs';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatNumber } from '@/shared/utils/format';
import {
  usePostMovement,
  useMovements,
  useStock,
  useWarehouseKpis,
  type MovementRow,
  type StockRow,
} from './api';
import { MovementDialog, type MovementKind } from './MovementDialog';

const route = getRouteApi('/_app/warehouse');
const TYPES = ['Receipt', 'Dispatch', 'Transfer', 'Adjustment'] as const;

const stockColumns: Column<StockRow>[] = [
  {
    key: 'sku',
    header: 'SKU',
    cell: (r) => (
      <div>
        <span className="font-mono text-[13px] font-medium">{r.sku}</span>
        <p className="text-caption text-fg-muted">{r.description}</p>
      </div>
    ),
  },
  {
    key: 'customer',
    header: 'Owner',
    cell: (r) => <span className="whitespace-nowrap">{r.customerName}</span>,
  },
  {
    key: 'location',
    header: 'Location',
    hideOnMobile: true,
    cell: (r) => <span className="font-mono text-[13px]">{r.location}</span>,
  },
  {
    key: 'qty',
    header: 'On hand',
    align: 'right',
    cell: (r) => (
      <span className={r.qtyOnHand === 0 ? 'text-fg-muted' : 'font-medium'}>
        {formatNumber(r.qtyOnHand)}{' '}
        <span className="text-caption font-normal text-fg-muted">{r.uom.toLowerCase()}</span>
      </span>
    ),
  },
  { key: 'pallets', header: 'Pallets', align: 'right', cell: (r) => formatNumber(r.pallets) },
  {
    key: 'received',
    header: 'Received',
    hideOnMobile: true,
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.receivedAt)}</span>,
  },
];

export function WarehousePage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/warehouse' });
  const view = search.view ?? 'stock';
  const kpis = useWarehouseKpis();
  const [dialog, setDialog] = useState<MovementKind | null>(null);
  const k = kpis.data;

  return (
    <div>
      <PageHeader
        title="Warehouse"
        description="JAFZA WH-1 · 3PL stock held for customers. Runs with or without a transport job."
        actions={
          <>
            <Button
              variant="ghost"
              icon={<SlidersHorizontal aria-hidden="true" />}
              onClick={() => setDialog('Adjustment')}
            >
              Adjust stock
            </Button>
            <Button
              variant="secondary"
              icon={<ArrowUpFromLine aria-hidden="true" />}
              onClick={() => setDialog('Dispatch')}
            >
              New dispatch
            </Button>
            <Button icon={<ArrowDownToLine aria-hidden="true" />} onClick={() => setDialog('Receipt')}>
              New receipt
            </Button>
          </>
        }
      />

      <section aria-label="Warehouse figures" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pallet positions used"
          value={k ? `${k.palletsUsed} / ${k.palletsCapacity}` : '—'}
          icon={<Boxes />}
          footnote={
            k ? (
              <span className="text-fg-muted">
                {Math.round((k.palletsUsed / k.palletsCapacity) * 100)}% utilisation
              </span>
            ) : null
          }
        />
        <KpiCard
          label="Active SKUs"
          value={k ? formatNumber(k.skus) : '—'}
          icon={<PackageCheck />}
          footnote={<span className="text-fg-muted">with stock on hand</span>}
        />
        <KpiCard
          label="Receipts this week"
          value={k ? formatNumber(k.receiptsThisWeek) : '—'}
          icon={<ArrowDownToLine />}
          footnote={<span className="text-fg-muted">since 16 Nov</span>}
        />
        <KpiCard
          label="Dispatches this week"
          value={k ? formatNumber(k.dispatchesThisWeek) : '—'}
          icon={<Truck />}
          footnote={
            k?.draftMovements ? (
              <span className="font-medium text-warning">
                {k.draftMovements} draft movement{k.draftMovements > 1 ? 's' : ''} to post
              </span>
            ) : (
              <span className="text-fg-muted">all movements posted</span>
            )
          }
        />
      </section>

      <Card>
        <div className="px-5 pt-3">
          <Tabs
            label="Warehouse view"
            value={view}
            onChange={(v) => void navigate({ search: { view: v === 'movements' ? 'movements' : undefined } })}
            items={[
              { value: 'stock', label: 'Stock on hand' },
              { value: 'movements', label: 'Movements', count: k?.draftMovements || undefined },
            ]}
          />
        </div>
        {view === 'movements' ? <MovementsView /> : <StockView />}
      </Card>

      <MovementDialog kind={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function StockView() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/warehouse' });
  const { data, isLoading, isFetching, error } = useStock({ page: search.page, search: search.q });
  return (
    <>
      <ListToolbar
        search={search.q ?? ''}
        onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
        searchPlaceholder="Search SKU, description, owner, location…"
      />
      <DataTable
        caption="Stock on hand"
        columns={stockColumns}
        rows={data?.items}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        error={error}
        emptyTitle="No stock matches"
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
    </>
  );
}

function MovementsView() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/warehouse' });
  const toast = useToast();
  const post = usePostMovement();
  const [postingId, setPostingId] = useState<string>();
  const { data, isLoading, isFetching, error } = useMovements({
    page: search.page,
    status: search.status,
    search: search.q,
  });

  const columns: Column<MovementRow>[] = [
    {
      key: 'number',
      header: 'Movement',
      cell: (r) => (
        <div>
          <DocRef>{r.number}</DocRef>
          <p className="whitespace-nowrap text-caption text-fg-muted">{formatDate(r.date)}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', cell: (r) => <StatusBadge status={r.type} /> },
    {
      key: 'customer',
      header: 'Customer / reference',
      cell: (r) => (
        <div className="min-w-44">
          <p className="font-medium">{r.customerName}</p>
          <p className="text-caption text-fg-muted">{r.reference}</p>
        </div>
      ),
    },
    {
      key: 'job',
      header: 'Job',
      hideOnMobile: true,
      cell: (r) =>
        r.workOrderId && r.workOrderNumber ? (
          <Link
            to="/work-orders/$id"
            params={{ id: r.workOrderId }}
            className="font-mono text-[13px] font-medium text-brand hover:underline"
          >
            {r.workOrderNumber}
          </Link>
        ) : (
          <span className="text-caption text-fg-muted">Warehouse only</span>
        ),
    },
    {
      key: 'lines',
      header: 'Lines',
      hideOnMobile: true,
      cell: (r) => <span className="font-mono text-caption text-fg-secondary">{r.lineSummary}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) =>
        r.status === 'Draft' ? (
          <div className="flex items-center gap-2">
            <StatusBadge status="Draft" />
            <Button
              size="sm"
              variant="secondary"
              icon={<ClipboardCheck aria-hidden="true" />}
              busy={post.isPending && postingId === r.id}
              onClick={() => {
                setPostingId(r.id);
                post.mutate(r.id, {
                  onSuccess: () => toast({ title: `${r.number} posted`, body: 'Stock on hand updated.' }),
                  onError: (e) =>
                    toast({
                      title: `${r.number} not posted`,
                      body: e instanceof Error ? e.message : 'Please try again.',
                    }),
                });
              }}
            >
              Post
            </Button>
          </div>
        ) : (
          <StatusBadge status={r.status} />
        ),
    },
  ];

  return (
    <>
      <ListToolbar
        tabs={statusTabs(TYPES, data?.counts)}
        status={search.status}
        onStatus={(s) =>
          void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
        }
        search={search.q ?? ''}
        onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
        searchPlaceholder="Search movement, customer, reference, job…"
      />
      <DataTable
        caption="Stock movements"
        columns={columns}
        rows={data?.items}
        rowKey={(r) => r.id}
        loading={isLoading || isFetching}
        error={error}
        emptyTitle="No movements match"
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
    </>
  );
}
