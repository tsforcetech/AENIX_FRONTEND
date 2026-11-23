import { useNavigate } from '@tanstack/react-router';
import { StatusBadge } from '@/shared/ui/Badge';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { DocRef } from '@/shared/ui/Money';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import { useInbound, useOutbound, type InboundRow, type OutboundRow } from './docs';

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
    key: 'pl',
    header: 'Product list',
    cell: (r) => (
      <div>
        <p className="font-mono text-[13px]">{r.pl?.number}</p>
        <p className="whitespace-nowrap text-caption text-fg-muted">
          {r.pl?.sentAt ? `Sent ${formatDateTime(r.pl.sentAt)}` : 'Not sent yet'}
        </p>
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
  const { data, isLoading, error } = useInbound();
  return (
    <DataTable
      caption="Inbound product lists and GRNs"
      columns={inboundColumns}
      rows={data}
      rowKey={(r) => r.id}
      loading={isLoading}
      error={error}
      onRowClick={(r) => void navigate({ to: '/work-orders/$id', params: { id: r.workOrderId } })}
      emptyTitle="No product lists yet"
      emptyDescription="Product lists are created on warehouse jobs and sent to the warehouse team from the job page."
    />
  );
}

export function OutboundView() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useOutbound();
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
