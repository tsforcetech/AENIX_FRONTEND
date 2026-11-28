import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Banknote, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { formatDate } from '@/shared/utils/format';
import { useVendor, type VendorDetail } from './api';
import { EditVendorDialog } from './EditVendorDialog';
import { Rating } from './Rating';

const route = getRouteApi('/_app/vendors/$id');

type RateRow = VendorDetail['rates'][number];
type AssignmentRow = VendorDetail['assignments'][number];
type BillRow = VendorDetail['bills'][number];
type PoRow = VendorDetail['purchaseOrders'][number];
type PaymentRow = VendorDetail['payments'][number];

const poColumns: Column<PoRow>[] = [
  {
    key: 'number',
    header: 'Purchase order',
    cell: (p) => (
      <div>
        <Link
          to="/purchase-orders/$id"
          params={{ id: p.id }}
          className="font-mono text-[13px] font-medium text-brand hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {p.number}
        </Link>
        <p className="text-caption text-fg-muted">{p.description}</p>
      </div>
    ),
  },
  {
    key: 'job',
    header: 'Job',
    hideOnMobile: true,
    cell: (p) => <span className="font-mono text-[13px]">{p.workOrderNumber}</span>,
  },
  {
    key: 'issued',
    header: 'Issued',
    hideOnMobile: true,
    cell: (p) => <span className="whitespace-nowrap">{formatDate(p.issuedAt)}</span>,
  },
  { key: 'total', header: 'Total incl. VAT', align: 'right', cell: (p) => <Money amount={p.total} /> },
  {
    key: 'bill',
    header: 'Vendor invoice',
    hideOnMobile: true,
    cell: (p) =>
      p.billNumber ? (
        <span className="font-mono text-[13px]">{p.billNumber}</span>
      ) : (
        <span className="text-caption text-fg-muted">Not yet invoiced</span>
      ),
  },
  { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
];

const paymentColumns: Column<PaymentRow>[] = [
  { key: 'number', header: 'Payment', cell: (p) => <DocRef>{p.number}</DocRef> },
  {
    key: 'date',
    header: 'Date',
    cell: (p) => <span className="whitespace-nowrap">{formatDate(p.date)}</span>,
  },
  {
    key: 'method',
    header: 'Method',
    hideOnMobile: true,
    cell: (p) => (
      <span>
        {p.method}
        <span className="block text-caption text-fg-muted">{p.reference}</span>
      </span>
    ),
  },
  {
    key: 'bills',
    header: 'Against',
    hideOnMobile: true,
    cell: (p) => <span className="font-mono text-[13px]">{p.bills.join(', ') || '—'}</span>,
  },
  { key: 'amount', header: 'Amount', align: 'right', cell: (p) => <Money amount={p.amount} /> },
  { key: 'status', header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
];

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
  {
    key: 'status',
    header: 'Status',
    cell: (r) => (
      <Badge tone={r.status === 'Current' ? 'success' : r.status === 'Future' ? 'info' : 'neutral'}>
        {r.status}
      </Badge>
    ),
  },
];

const assignmentColumns: Column<AssignmentRow>[] = [
  {
    key: 'wo',
    header: 'Job',
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
    header: 'Purchase invoice',
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
  const [editing, setEditing] = useState(false);
  if (error) return <StatusMessage kind="error" title="Vendor not found" />;
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading vendor…" />;
  const v = data.vendor;
  const bal = data.balance;
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
        description={`${v.code} · ledger ${v.ledgerCode} · ${v.city}, ${v.country}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<PencilLine aria-hidden="true" />}
              onClick={() => setEditing(true)}
            >
              Edit vendor
            </Button>
            <ButtonLink to="/payments/new" search={{ vendorId: v.id }} icon={<Banknote aria-hidden="true" />}>
              New payment
            </ButtonLink>
          </>
        }
      />
      <section aria-label="Vendor balance" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Invoiced to us', value: bal.billed, hint: 'Approved purchase invoices incl. VAT' },
          { label: 'Paid', value: bal.paid, hint: `${data.payments.length} payment voucher(s)` },
          { label: 'Payable now', value: bal.payable, hint: 'Invoiced − paid', strong: true },
          {
            label: 'Open POs not invoiced',
            value: bal.openPoValue,
            hint: `${bal.openPoCount} purchase order(s) committed`,
          },
        ].map((t) => (
          <div
            key={t.label}
            className={
              t.strong
                ? 'rounded-xl bg-surface-inverse p-4 text-fg-inverse shadow-card'
                : 'rounded-xl border border-border-subtle bg-surface p-4 shadow-card'
            }
          >
            <p
              className={
                t.strong ? 'text-caption font-medium text-white/70' : 'text-caption font-medium text-fg-muted'
              }
            >
              {t.label}
            </p>
            <p className="mt-1.5 text-[17px] font-semibold tabular-nums">
              <Money amount={t.value} />
            </p>
            <p className={t.strong ? 'mt-1 text-caption text-white/70' : 'mt-1 text-caption text-fg-muted'}>
              {t.hint}
            </p>
          </div>
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader title="Profile" />
          <CardBody>
            <DescriptionList
              items={[
                { label: 'Payable ledger', value: <span className="font-mono">{v.ledgerCode}</span> },
                { label: 'Contact', value: v.contactName },
                { label: 'Email', value: v.contactEmail },
                { label: 'Payment terms', value: `${v.paymentTermsDays} days` },
                { label: 'Rating', value: <Rating value={v.rating} /> },
                { label: 'Open purchase invoices', value: String(v.openBills) },
                { label: 'Payable (approved)', value: <Money amount={bal.payable} /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title="Buying rates"
            description="What this vendor charges us — used for job costing"
            actions={
              <Link
                to="/services"
                search={{ tab: 'buying', vendorId: v.id }}
                className="text-body-s font-medium text-brand hover:underline"
              >
                Manage in Services › Buying rates
              </Link>
            }
          />
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
          <CardHeader title="Job assignments" />
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
          <CardHeader title="Purchase orders" description="Issued when the vendor is assigned to a job" />
          <div className="mt-3">
            <DataTable
              caption="Purchase orders"
              columns={poColumns}
              rows={data.purchaseOrders}
              rowKey={(p) => p.id}
              onRowClick={(p) => void navigate({ to: '/purchase-orders/$id', params: { id: p.id } })}
              emptyTitle="No purchase orders"
            />
          </div>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Purchase invoices" />
          <div className="mt-3">
            <DataTable
              caption="Vendor bills"
              columns={billColumns}
              rows={data.bills}
              rowKey={(b) => b.id}
              onRowClick={(b) => void navigate({ to: '/vendor-bills/$id', params: { id: b.id } })}
              emptyTitle="No purchase invoices"
            />
          </div>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Payments" description="Payment vouchers to this vendor" />
          <div className="mt-3">
            <DataTable
              caption="Vendor payments"
              columns={paymentColumns}
              rows={data.payments}
              rowKey={(p) => p.id}
              emptyTitle="No payments yet"
            />
          </div>
        </Card>
      </div>
      {editing ? <EditVendorDialog vendor={v} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}
