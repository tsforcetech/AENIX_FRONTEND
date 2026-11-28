import { useNavigate } from '@tanstack/react-router';
import { useWarehouseScope } from './sites';
import { StatusBadge } from '@/shared/ui/Badge';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { DocRef } from '@/shared/ui/Money';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import {
  useCustomerStock,
  useInbound,
  useOutbound,
  type CustomerStockRow,
  type InboundRow,
  type OutboundRow,
} from './docs';

const stageStatus: Record<InboundRow['stage'], string> = {
  'PL draft': 'Draft',
  'Awaiting GRN': 'Sent to warehouse',
  'GRN to check': 'Uploaded',
  'Variance raised': 'Variance raised',
  Verified: 'Verified',
};

const inboundColumns: Column<InboundRow>[] = [
  {
    key: 'job',
    header: 'Job / customer',
    cell: (r) => (
      <div className="min-w-40">
        <DocRef>{r.jobNumber}</DocRef>
        <p className="text-caption text-fg-muted">{r.customerName}</p>
      </div>
    ),
  },
  {
    key: 'inbound',
    header: 'Inbound',
    cell: (r) => (
      <div className="min-w-36">
        <DocRef>{r.inboundNumber}</DocRef>
        <p className="max-w-52 truncate text-caption text-fg-muted">{r.reference || '—'}</p>
        <p className="whitespace-nowrap text-caption text-fg-muted">
          Expected {formatDate(r.expectedAt)}
          {r.expectedTime ? ` · ${r.expectedTime}` : ''}
        </p>
        {r.kind === 'Return' ? (
          <p className="text-caption font-medium text-warning">Customer return</p>
        ) : null}
        {r.putawayDone ? <p className="text-caption text-fg-muted">Put away</p> : null}
      </div>
    ),
  },
  {
    key: 'pl',
    header: 'Product list',
    cell: (r) => (
      <div>
        <p className="font-mono text-[13px]">{r.pl.number}</p>
        <p className="whitespace-nowrap text-caption text-fg-muted">
          {r.pl.lines.length} SKU{r.pl.lines.length === 1 ? '' : 's'} ·{' '}
          {r.pl.sentAt ? `sent ${formatDateTime(r.pl.sentAt)}` : 'not sent yet'}
        </p>
        {r.pl.source ? <p className="text-caption text-fg-muted">via {r.pl.source}</p> : null}
      </div>
    ),
  },
  {
    key: 'grn',
    header: 'GRN',
    cell: (r) =>
      r.grn ? (
        <div>
          <p className="font-mono text-[13px]">{r.grn.number}</p>
          <p className="whitespace-nowrap text-caption text-fg-muted">
            Received {formatDateTime(r.grn.receivedAt)}
          </p>
        </div>
      ) : (
        <span className="text-caption text-fg-muted">—</span>
      ),
  },
  {
    key: 'qty',
    header: 'PL / GRN qty',
    align: 'right',
    cell: (r) => (
      <span className="whitespace-nowrap">
        {r.expected} / {r.grn ? r.received : '—'}
      </span>
    ),
  },
  {
    key: 'stage',
    header: 'Status',
    cell: (r) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={stageStatus[r.stage]} />
        {r.grn && r.mismatches ? (
          <span className="text-caption font-medium text-danger">
            {r.mismatches} line{r.mismatches === 1 ? '' : 's'} differ
          </span>
        ) : null}
      </div>
    ),
  },
];

const outboundColumns: Column<OutboundRow>[] = [
  {
    key: 'req',
    header: 'Request',
    cell: (r) => (
      <div>
        <DocRef>{r.request.number}</DocRef>
        <p className="whitespace-nowrap text-caption text-fg-muted">
          Needed by {formatDate(r.request.requiredBy)}
        </p>
      </div>
    ),
  },
  {
    key: 'job',
    header: 'Job / customer',
    cell: (r) => (
      <div className="min-w-40">
        <p className="font-mono text-[13px]">{r.jobNumber}</p>
        <p className="text-caption text-fg-muted">{r.customerName}</p>
      </div>
    ),
  },
  {
    key: 'to',
    header: 'Deliver to',
    hideOnMobile: true,
    cell: (r) => <span className="text-body-s">{r.request.deliverTo}</span>,
  },
  {
    key: 'pod',
    header: 'POD',
    cell: (r) =>
      r.request.pod ? (
        <div>
          <p className="font-mono text-[13px]">{r.request.pod.number}</p>
          <p className="whitespace-nowrap text-caption text-fg-muted">
            {formatDateTime(r.request.pod.deliveredAt)}
          </p>
        </div>
      ) : (
        <span className="text-caption text-fg-muted">Awaiting POD</span>
      ),
  },
  {
    key: 'qty',
    header: 'Requested / delivered',
    align: 'right',
    cell: (r) => (
      <span className="whitespace-nowrap">
        {r.requested} / {r.delivered ?? '—'}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={r.request.status} />
        {r.request.pod && r.mismatches ? (
          <span className="text-caption font-medium text-danger">
            {r.mismatches} line{r.mismatches === 1 ? '' : 's'} differ
          </span>
        ) : null}
      </div>
    ),
  },
];

export function InboundView() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useInbound(useWarehouseScope());
  return (
    <DataTable
      caption="Inbound receipts: product lists and GRNs"
      columns={inboundColumns}
      rows={data}
      rowKey={(r) => r.id}
      loading={isLoading}
      error={error}
      onRowClick={(r) => void navigate({ to: '/work-orders/$id', params: { id: r.workOrderId } })}
      emptyTitle="No inbound receipts yet"
      emptyDescription="Inbounds are added on warehouse jobs — import the customer’s product list from Excel."
    />
  );
}

export function OutboundView() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useOutbound(useWarehouseScope());
  return (
    <DataTable
      caption="Customer requests and PODs"
      columns={outboundColumns}
      rows={data}
      rowKey={(r) => r.id}
      loading={isLoading}
      error={error}
      onRowClick={(r) => void navigate({ to: '/work-orders/$id', params: { id: r.workOrderId } })}
      emptyTitle="No customer requests yet"
      emptyDescription="Customer out / delivery requests are logged on the job and closed with the vendor’s POD."
    />
  );
}

const n = (v: number) => <span className="tabular-nums">{v.toLocaleString('en-AE')}</span>;

const stockColumns: Column<CustomerStockRow>[] = [
  {
    key: 'job',
    header: 'Customer / job',
    cell: (r) => (
      <div className="min-w-44">
        <p className="font-medium">{r.customerName}</p>
        <DocRef>{r.jobNumber}</DocRef>
      </div>
    ),
  },
  {
    key: 'moves',
    header: 'Inbounds / releases',
    hideOnMobile: true,
    cell: (r) => (
      <span className="whitespace-nowrap text-fg-secondary">
        {r.inbounds} in · {r.releases} out
      </span>
    ),
  },
  { key: 'skus', header: 'SKUs in stock', align: 'right', hideOnMobile: true, cell: (r) => n(r.skus) },
  { key: 'received', header: 'Received', align: 'right', hideOnMobile: true, cell: (r) => n(r.received) },
  { key: 'delivered', header: 'Delivered', align: 'right', hideOnMobile: true, cell: (r) => n(r.delivered) },
  {
    key: 'damaged',
    header: 'Damaged',
    align: 'right',
    hideOnMobile: true,
    cell: (r) => (r.damaged ? <span className="font-medium text-danger">{n(r.damaged)}</span> : '—'),
  },
  {
    key: 'onHand',
    header: 'On hand',
    align: 'right',
    cell: (r) => <span className="font-semibold">{n(r.onHand)}</span>,
  },
  { key: 'reserved', header: 'Reserved', align: 'right', cell: (r) => (r.reserved ? n(r.reserved) : '—') },
  {
    key: 'available',
    header: 'Available',
    align: 'right',
    cell: (r) => <span className="font-semibold">{n(r.available)}</span>,
  },
];

export function CustomerStockView() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useCustomerStock(useWarehouseScope());
  return (
    <DataTable
      caption="Stock by customer job"
      columns={stockColumns}
      rows={data}
      rowKey={(r) => r.id}
      loading={isLoading}
      error={error}
      onRowClick={(r) => void navigate({ to: '/work-orders/$id', params: { id: r.workOrderId } })}
      emptyTitle="No stored goods yet"
      emptyDescription="Stock appears once a GRN is uploaded on a warehouse job."
    />
  );
}
