import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  MapPin,
  PackageCheck,
  SearchCheck,
  SlidersHorizontal,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge, type Tone } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField } from '@/shared/ui/Field';
import { DataTable, Pagination, type Column } from '@/shared/ui/DataTable';
import { KpiCard } from '@/shared/ui/KpiCard';
import { ListToolbar, statusTabs } from '@/shared/ui/ListToolbar';
import { DocRef } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Tabs } from '@/shared/ui/Tabs';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatNumber } from '@/shared/utils/format';
import {
  STOCK_FILTERS,
  useFloorAction,
  useLocations,
  usePostMovement,
  useMovements,
  useStock,
  useWarehouseFloorEnabled,
  useWarehouseKpis,
  type MovementRow,
  type StockRow,
} from './api';
import { CustomerStockView, InboundView, OutboundView } from './DocViews';
import { useArrivals, useInbound, useOutbound } from './docs';
import { MovementDialog, type MovementKind } from './MovementDialog';

const route = getRouteApi('/_app/warehouse');
const TYPES = ['Receipt', 'Dispatch', 'Transfer', 'Adjustment'] as const;

const statusTone: Record<StockRow['status'], Tone> = {
  Available: 'success',
  Quarantine: 'warning',
  Damaged: 'danger',
};

function stockColumns(onInspect: (r: StockRow) => void): Column<StockRow>[] {
  return [
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
      cell: (r) => (
        <div>
          <span className="whitespace-nowrap">{r.customerName}</span>
          {r.jobNumber ? <p className="font-mono text-caption text-fg-muted">{r.jobNumber}</p> : null}
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      hideOnMobile: true,
      cell: (r) => <span className="font-mono text-[13px]">{r.location}</span>,
    },
    {
      key: 'lot',
      header: 'Batch / expiry',
      hideOnMobile: true,
      cell: (r) =>
        r.batch || r.expiryDate ? (
          <div className="whitespace-nowrap">
            <p className="font-mono text-[13px]">{r.batch ?? '—'}</p>
            {r.expiryDate ? (
              <p className="text-caption text-fg-muted">Exp. {formatDate(r.expiryDate)}</p>
            ) : null}
          </div>
        ) : (
          <span className="text-caption text-fg-muted">—</span>
        ),
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
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone[r.status]}>{r.status}</Badge>
          {r.expiry === 'Expired' ? <Badge tone="danger">Expired</Badge> : null}
          {r.expiry === 'Expiring' ? <Badge tone="warning">Expires soon</Badge> : null}
          {r.status === 'Quarantine' && r.qtyOnHand > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<SearchCheck aria-hidden="true" />}
              onClick={() => onInspect(r)}
            >
              Inspect
            </Button>
          ) : null}
        </div>
      ),
    },
    {
      key: 'received',
      header: 'Received',
      hideOnMobile: true,
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.receivedAt)}</span>,
    },
  ];
}

export function WarehousePage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/warehouse' });
  const view = search.view ?? 'stock';
  const inbound = useInbound();
  const outbound = useOutbound();
  const inboundOpen = inbound.data?.filter((r) => r.stage !== 'Verified').length ?? 0;
  const outboundOpen = outbound.data?.filter((r) => r.request.status !== 'Closed').length ?? 0;
  const kpis = useWarehouseKpis();
  const [dialog, setDialog] = useState<MovementKind | null>(null);
  const floor = useWarehouseFloorEnabled();
  const k = kpis.data;

  return (
    <div>
      <PageHeader
        title="Warehouse"
        description="JAFZA WH-1 · 3PL stock held for customers. Runs with or without a transport job."
        actions={
          <>
            {floor ? (
              <>
                <ButtonLink to="/warehouse/locations" variant="ghost" icon={<MapPin aria-hidden="true" />}>
                  Locations
                </ButtonLink>
                <ButtonLink
                  to="/warehouse/cycle-counts"
                  variant="ghost"
                  icon={<ClipboardList aria-hidden="true" />}
                >
                  Cycle counts
                </ButtonLink>
              </>
            ) : null}
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

      <ArrivalsCard />

      <Card>
        <div className="px-5 pt-3">
          <Tabs
            label="Warehouse view"
            value={view}
            onChange={(v) =>
              void navigate({
                search: {
                  view:
                    v === 'movements' || v === 'inbound' || v === 'outbound' || v === 'customers'
                      ? v
                      : undefined,
                },
              })
            }
            items={[
              { value: 'stock', label: 'Stock on hand' },
              { value: 'customers', label: 'Stock by customer' },
              { value: 'movements', label: 'Movements', count: k?.draftMovements || undefined },
              { value: 'inbound', label: 'Inbound receipts (PL → GRN)', count: inboundOpen || undefined },
              {
                value: 'outbound',
                label: 'Outbound releases (request → POD)',
                count: outboundOpen || undefined,
              },
            ]}
          />
        </div>
        {view === 'movements' ? (
          <MovementsView />
        ) : view === 'inbound' ? (
          <div className="pt-2">
            <InboundView />
          </div>
        ) : view === 'outbound' ? (
          <div className="pt-2">
            <OutboundView />
          </div>
        ) : view === 'customers' ? (
          <div className="pt-2">
            <CustomerStockView />
          </div>
        ) : (
          <StockView />
        )}
      </Card>

      <MovementDialog kind={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function StockView() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/warehouse' });
  const [inspecting, setInspecting] = useState<StockRow>();
  const { data, isLoading, isFetching, error } = useStock({
    page: search.page,
    search: search.q,
    status: search.status,
  });
  const expiring = (data?.counts?.Expiring ?? 0) + (data?.counts?.Expired ?? 0);
  return (
    <>
      {expiring > 0 && !search.status ? (
        <p
          role="status"
          className="mx-5 mt-4 flex items-center gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-body-s text-warning"
        >
          <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
          {data?.counts?.Expired ?? 0} lot(s) expired and {data?.counts?.Expiring ?? 0} expiring within 30
          days. Use the Expired / Expiring filters to see them.
        </p>
      ) : null}
      <ListToolbar
        tabs={statusTabs(STOCK_FILTERS, data?.counts)}
        status={search.status}
        onStatus={(s) =>
          void navigate({ search: (p) => ({ ...p, status: s === 'All' ? undefined : s, page: undefined }) })
        }
        search={search.q ?? ''}
        onSearch={(q) => void navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) })}
        searchPlaceholder="Search SKU, batch, owner, location…"
      />
      <DataTable
        caption="Stock on hand"
        columns={stockColumns(setInspecting)}
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
      {inspecting ? <InspectDialog lot={inspecting} onClose={() => setInspecting(undefined)} /> : null}
    </>
  );
}

/** W12: inspect a quarantined lot (customer return / suspect goods): release to a bin or mark damaged. */
function InspectDialog({ lot, onClose }: { lot: StockRow; onClose: () => void }) {
  const locations = useLocations();
  const action = useFloorAction();
  const toast = useToast();
  const [result, setResult] = useState<'Available' | 'Damaged'>('Available');
  const [locationId, setLocationId] = useState('');
  const options = (locations.data ?? [])
    .filter((l) => l.location.active && l.location.zone !== 'Quarantine' && l.location.zone !== 'Dispatch')
    .map((l) => ({ value: l.id, label: `${l.location.code} · ${l.location.zone} · ${l.free} free` }));
  const submit = () =>
    action.mutate(
      { kind: 'inspect', lotId: lot.id, result, locationId: result === 'Available' ? locationId : undefined },
      {
        onSuccess: () => {
          toast({
            title: result === 'Available' ? `${lot.sku} released to stock` : `${lot.sku} marked damaged`,
          });
          onClose();
        },
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Inspect ${lot.sku}`}
      description={`${formatNumber(lot.qtyOnHand)} ${lot.uom.toLowerCase()} in quarantine at ${lot.location}${lot.batch ? ` · batch ${lot.batch}` : ''}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={action.isPending} onClick={submit}>
            Save inspection
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Inspection result"
          options={[
            { value: 'Available', label: 'Good — release to stock' },
            { value: 'Damaged', label: 'Damaged — keep in quarantine' },
          ]}
          value={result}
          onChange={(e) => setResult(e.target.value as 'Available' | 'Damaged')}
        />
        {result === 'Available' ? (
          <SelectField
            label="Move to bin"
            required
            placeholder={locations.isLoading ? 'Loading…' : 'Choose a bin'}
            options={options}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          />
        ) : null}
        {action.error ? (
          <p role="alert" className="text-caption font-medium text-danger">
            {action.error instanceof Error ? action.error.message : 'Not saved.'}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** W1: consignments expected in the next 7 days, by date and time (dock planning). */
function ArrivalsCard() {
  const { data } = useArrivals();
  if (!data?.length) return null;
  return (
    <Card className="mb-6">
      <CardHeader
        title="Arrivals — next 7 days"
        description="Inbound consignments with no GRN yet, by expected date and time."
      />
      <CardBody>
        <ul className="divide-y divide-border-subtle">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap font-medium tabular-nums">
                    {formatDate(r.expectedAt)}
                    {r.expectedTime ? ` · ${r.expectedTime}` : ' · time not set'}
                  </span>
                  <DocRef>{r.inboundNumber}</DocRef>
                  {r.kind === 'Return' ? <Badge tone="warning">Customer return</Badge> : null}
                </p>
                <p className="truncate text-caption text-fg-muted">
                  {r.customerName} · {r.reference || 'No reference'} · {r.expected} units on {r.pl.number}
                </p>
              </div>
              <Link
                to="/work-orders/$id"
                params={{ id: r.workOrderId }}
                className="font-mono text-[13px] font-medium text-brand hover:underline"
              >
                {r.jobNumber}
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
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
