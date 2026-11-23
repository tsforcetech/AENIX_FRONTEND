import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { formatDate } from '@/shared/utils/format';
import { useVendor, type VendorDetail } from './api';
import { Rating } from './Rating';

const route = getRouteApi('/_app/vendors/$id');

type RateRow = VendorDetail['rates'][number];
type AssignmentRow = VendorDetail['assignments'][number];
type BillRow = VendorDetail['bills'][number];

const rateColumns: Column<RateRow>[] = [
  { key: 'service', header: 'Service', cell: (r) => <span className="font-medium">{r.serviceName}</span> },
  {
    key: 'lane',
    header: 'Lane',
    cell: (r) => <span className="whitespace-nowrap">{`${r.origin} → ${r.destination}`}</span>,
  },
  { key: 'unit', header: 'Unit', hideOnMobile: true, cell: (r) => r.unit },
  { key: 'rate', header: 'Rate', align: 'right', cell: (r) => <Money amount={r.rate} /> },
  {
    key: 'validity',
    header: 'Valid',
    hideOnMobile: true,
    cell: (r) => (
      <span className="whitespace-nowrap text-caption text-fg-muted">{`${formatDate(r.validFrom)} – ${formatDate(r.validTo)}`}</span>
    ),
  },
];

const assignmentColumns: Column<AssignmentRow>[] = [
  {
    key: 'wo',
    header: 'Work order',
    cell: (a) => (
      <Link
        to="/work-orders/$id"
        params={{ id: a.workOrderId }}
        className="font-mono text-[13px] font-medium text-brand hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {a.workOrderNumber}
      </Link>
    ),
  },
  { key: 'lane', header: 'Lane', cell: (a) => <span className="whitespace-nowrap">{a.lane}</span> },
  { key: 'service', header: 'Service', hideOnMobile: true, cell: (a) => a.service },
  { key: 'cost', header: 'Agreed cost', align: 'right', cell: (a) => <Money amount={a.agreedCost} /> },
  { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
];

const billColumns: Column<BillRow>[] = [
  {
    key: 'number',
    header: 'Bill',
    cell: (b) => (
      <div>
        <DocRef>{b.number}</DocRef>
        <p className="text-caption text-fg-muted">Vendor ref {b.vendorRef}</p>
      </div>
    ),
  },
  {
    key: 'wo',
    header: 'Job',
    hideOnMobile: true,
    cell: (b) => <span className="font-mono text-[13px]">{b.workOrderNumber ?? '—'}</span>,
  },
  {
    key: 'due',
    header: 'Due',
    hideOnMobile: true,
    cell: (b) => <span className="whitespace-nowrap">{formatDate(b.dueDate)}</span>,
  },
  { key: 'total', header: 'Total', align: 'right', cell: (b) => <Money amount={b.total} /> },
  {
    key: 'outstanding',
    header: 'Outstanding',
    align: 'right',
    cell: (b) => <Money amount={b.outstanding} muted={b.outstanding === 0} />,
  },
  { key: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
];

export function VendorDetailPage() {
  const { id } = route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useVendor(id);
  if (error) return <StatusMessage kind="error" title="Vendor not found" />;
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading vendor…" />;
  const v = data.vendor;
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Vendors', to: '/vendors' }, { label: v.code }]}
        title={v.name}
        meta={
          <>
            <Badge tone="neutral" dot={false}>
              {v.category}
            </Badge>
            <StatusBadge status={v.status} />
          </>
        }
        description={`${v.code} · ${v.city}, ${v.country}`}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader title="Profile" />
          <CardBody>
            <DescriptionList
              items={[
                { label: 'Contact', value: v.contactName },
                { label: 'Email', value: v.contactEmail },
                { label: 'Payment terms', value: `${v.paymentTermsDays} days` },
                { label: 'Rating', value: <Rating value={v.rating} /> },
                { label: 'Open bills', value: String(v.openBills) },
                { label: 'Outstanding', value: <Money amount={v.outstanding} /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Contracted rates" description="Buy rates used for job costing" />
          <div className="mt-3">
            <DataTable
              caption="Vendor rates"
              columns={rateColumns}
              rows={data.rates}
              rowKey={(r) => r.id}
              emptyTitle="No rates on file"
            />
          </div>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Work order assignments" />
          <div className="mt-3">
            <DataTable
              caption="Assignments"
              columns={assignmentColumns}
              rows={data.assignments}
              rowKey={(a) => a.id}
              onRowClick={(a) => void navigate({ to: '/work-orders/$id', params: { id: a.workOrderId } })}
              emptyTitle="No assignments yet"
            />
          </div>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Bills" />
          <div className="mt-3">
            <DataTable
              caption="Vendor bills"
              columns={billColumns}
              rows={data.bills}
              rowKey={(b) => b.id}
              emptyTitle="No bills"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
