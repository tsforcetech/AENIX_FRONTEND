import { getRouteApi, Link } from '@tanstack/react-router';
import { FileText, PencilLine, Plus, Printer, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody } from '@/shared/ui/Card';
import { CreditPanel } from '@/features/sales-orders/CreditPanel';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { Tabs } from '@/shared/ui/Tabs';
import { formatDate, formatMoneyCompact } from '@/shared/utils/format';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { formatInCurrency } from '@/features/sales-orders/commercial-api';
import { BalanceTiles, SalesOrderBalanceTable } from './AccountBalance';
import { EditCustomerDialog } from './EditCustomerDialog';
import { useCustomer, type CustomerDetail } from './api';
import { PrintableStatement } from './PrintableStatement';
import { StatementTable } from './StatementTable';

const route = getRouteApi('/_app/customers/$id');

type Tab = 'balance' | 'profile' | 'rates' | 'activity' | 'statement';

export function CustomerDetailPage() {
  const { id } = route.useParams();
  const { data, isLoading, error } = useCustomer(id);
  const [tab, setTab] = useState<Tab>('balance');
  const [editing, setEditing] = useState(false);

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Customer not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading customer…" />;
  const { customer: c, kpis, balance } = data;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Customers', to: '/customers' }, { label: c.code }]}
        title={c.name}
        meta={<StatusBadge status={c.status} />}
        description={`${c.code} · ledger ${c.ledgerCode} · ${c.industry} · ${c.city}, ${c.country}`}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<PencilLine aria-hidden="true" />}
              onClick={() => setEditing(true)}
            >
              Edit customer
            </Button>
            <Button variant="secondary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
              Print statement
            </Button>
            <ButtonLink to="/enquiries/new" variant="secondary" icon={<Plus aria-hidden="true" />}>
              New enquiry
            </ButtonLink>
            <ButtonLink
              to="/invoices/new"
              search={{ customerId: c.id }}
              variant="secondary"
              icon={<FileText aria-hidden="true" />}
            >
              Create invoice
            </ButtonLink>
            <ButtonLink
              to="/collections/new"
              search={{ customerId: c.id }}
              icon={<Wallet aria-hidden="true" />}
            >
              New receipt
            </ButtonLink>
          </>
        }
      />

      <BalanceTiles balance={balance} />
      <p className="-mt-3 mb-6 text-caption text-fg-muted">
        {kpis.jobsThisYear} jobs this year · invoiced revenue {formatMoneyCompact(kpis.revenue)} excl. VAT ·
        credit used {c.creditUsedPct}% of {formatMoneyCompact(c.creditLimit)}
        {kpis.overdue ? (
          <span className="font-medium text-danger"> · {formatMoneyCompact(kpis.overdue)} overdue</span>
        ) : null}
      </p>

      <Card className="mb-6">
        <CardBody>
          <CreditPanel credit={data.credit} title="Credit position (AED incl. VAT)" />
        </CardBody>
      </Card>

      <PrintableStatement data={data} />

      <Card>
        <div className="px-5 pt-3">
          <Tabs
            label="Customer sections"
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            items={[
              { value: 'balance', label: 'Balance by sales order', count: balance.salesOrders.length },
              { value: 'profile', label: 'Profile' },
              { value: 'rates', label: 'Selling rates', count: data.sellingRates.length },
              {
                value: 'activity',
                label: 'Activity',
                count:
                  data.enquiries.length +
                  data.quotations.length +
                  data.salesOrders.length +
                  data.workOrders.length,
              },
              { value: 'statement', label: 'Statement of account' },
            ]}
          />
        </div>
        {tab === 'balance' ? <SalesOrderBalanceTable balance={balance} /> : null}
        {tab === 'profile' ? (
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Customer code', value: c.code },
                {
                  label: 'Receivable ledger',
                  value: <span className="font-mono">{c.ledgerCode}</span>,
                },
                { label: 'Category', value: c.industry },
                { label: 'Location', value: `${c.city}, ${c.country}` },
                { label: 'TRN', value: <span className="font-mono">{c.trnMasked}</span> },
                { label: 'Credit limit', value: <Money amount={c.creditLimit} /> },
                { label: 'Payment terms', value: `${c.paymentTermsDays} days` },
                { label: 'Contact', value: c.contactName },
                { label: 'Email', value: c.contactEmail },
                { label: 'Phone', value: c.contactPhone },
                { label: 'Postal address', value: c.postalAddress ?? '—' },
                { label: 'Customer since', value: formatDate(c.createdAt) },
              ]}
            />
          </CardBody>
        ) : null}
        {tab === 'rates' ? <SellingRatesList data={data} /> : null}
        {tab === 'activity' ? <ActivityLists data={data} /> : null}
        {tab === 'statement' ? <StatementTable lines={data.statement} /> : null}
      </Card>
      {editing ? <EditCustomerDialog customer={c} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function MiniList({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold leading-6 text-fg">{title}</h3>
      {empty ? (
        <p className="mt-3 text-body-s text-fg-muted">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle">{children}</ul>
      )}
    </div>
  );
}

function ActivityLists({ data }: { data: CustomerDetail }) {
  return (
    <CardBody className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
      <MiniList title="Enquiries" empty={data.enquiries.length === 0}>
        {data.enquiries.map((e) => (
          <li key={e.id}>
            <Link
              to="/enquiries/$id"
              params={{ id: e.id }}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-canvas"
            >
              <span className="min-w-0">
                <DocRef>{e.number}</DocRef>
                <span className="block truncate text-caption text-fg-muted">{e.route}</span>
              </span>
              <StatusBadge status={e.status} />
            </Link>
          </li>
        ))}
      </MiniList>
      <MiniList title="Quotations" empty={data.quotations.length === 0}>
        {data.quotations.map((q) => (
          <li key={q.id}>
            <Link
              to="/quotations/$id"
              params={{ id: q.id }}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-canvas"
            >
              <span className="min-w-0">
                <DocRef>{q.number}</DocRef> <span className="text-caption text-fg-muted">v{q.version}</span>
                <span className="block truncate text-caption text-fg-muted">{q.route}</span>
              </span>
              <StatusBadge status={q.status} />
            </Link>
          </li>
        ))}
      </MiniList>
      <MiniList title="Sales orders" empty={data.salesOrders.length === 0}>
        {data.salesOrders.map((o) => (
          <li key={o.id}>
            <Link
              to="/sales-orders/$id"
              params={{ id: o.id }}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-canvas"
            >
              <span className="min-w-0">
                <DocRef>{o.number}</DocRef>
                <span className="block truncate text-caption text-fg-muted">
                  {o.route} · <Money amount={o.value} />
                </span>
              </span>
              <StatusBadge status={o.status} />
            </Link>
          </li>
        ))}
      </MiniList>
      <MiniList title="Work orders" empty={data.workOrders.length === 0}>
        {data.workOrders.map((w) => (
          <li key={w.id}>
            <Link
              to="/work-orders/$id"
              params={{ id: w.id }}
              className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-canvas"
            >
              <span className="min-w-0">
                <DocRef>{w.number}</DocRef>
                <span className="block truncate text-caption text-fg-muted">
                  {w.route} · <Money amount={w.revenue} />
                </span>
              </span>
              <StatusBadge status={w.status} />
            </Link>
          </li>
        ))}
      </MiniList>
    </CardBody>
  );
}

type SellingRate = CustomerDetail['sellingRates'][number];

const rateTone = { Current: 'success', Future: 'info', Expired: 'neutral' } as const;

const sellingRateColumns: Column<SellingRate>[] = [
  { key: 'service', header: 'Service', cell: (r) => <span className="font-medium">{r.serviceName}</span> },
  {
    key: 'lane',
    header: 'Lane',
    cell: (r) => (
      <span className="whitespace-nowrap">
        {r.origin || r.destination ? `${r.origin || 'Any'} → ${r.destination || 'Any'}` : 'Any lane'}
      </span>
    ),
  },
  { key: 'unit', header: 'Unit', hideOnMobile: true, cell: (r) => r.unit },
  {
    key: 'price',
    header: 'Price',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{formatInCurrency(r.price, r.currency)}</span>,
  },
  {
    key: 'valid',
    header: 'Validity',
    hideOnMobile: true,
    cell: (r) => (
      <span className="whitespace-nowrap text-caption text-fg-muted">{`${formatDate(r.validFrom)} – ${formatDate(r.validTo)}`}</span>
    ),
  },
  { key: 'status', header: 'Status', cell: (r) => <Badge tone={rateTone[r.status]}>{r.status}</Badge> },
];

/** MASTERS M2: the customer's own selling rates (read-only; edited in Services › Selling rates). */
function SellingRatesList({ data }: { data: CustomerDetail }) {
  return (
    <div className="pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3">
        <p className="text-body-s text-fg-muted">
          Used first when pricing this customer’s quotations and orders; otherwise the standard price list
          applies.
        </p>
        <Link
          to="/services"
          search={{ tab: 'selling', customerId: data.customer.id }}
          className="text-body-s font-medium text-brand hover:underline"
        >
          Manage in Services › Selling rates
        </Link>
      </div>
      <DataTable
        caption={`Selling rates for ${data.customer.name}`}
        columns={sellingRateColumns}
        rows={data.sellingRates}
        rowKey={(r) => r.id}
        emptyTitle="No customer rates"
        emptyDescription="The standard price list is used for this customer."
      />
    </div>
  );
}
