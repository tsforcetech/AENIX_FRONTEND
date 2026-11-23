import { getRouteApi, Link } from '@tanstack/react-router';
import { AlertTriangle, CircleDollarSign, Plus, Receipt, Truck, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { StatusBadge } from '@/shared/ui/Badge';
import { ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { KpiCard } from '@/shared/ui/KpiCard';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { Tabs } from '@/shared/ui/Tabs';
import { formatDate, formatMoneyCompact } from '@/shared/utils/format';
import { useCustomer, type CustomerDetail } from './api';
import { StatementTable } from './StatementTable';

const route = getRouteApi('/_app/customers/$id');

type Tab = 'profile' | 'activity' | 'statement';

export function CustomerDetailPage() {
  const { id } = route.useParams();
  const { data, isLoading, error } = useCustomer(id);
  const [tab, setTab] = useState<Tab>('profile');

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Customer not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading customer…" />;
  const { customer: c, kpis } = data;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Customers', to: '/customers' }, { label: c.code }]}
        title={c.name}
        meta={<StatusBadge status={c.status} />}
        description={`${c.code} · ${c.industry} · ${c.city}, ${c.country}`}
        actions={
          <>
            <ButtonLink to="/enquiries/new" variant="secondary" icon={<Plus aria-hidden="true" />}>
              New enquiry
            </ButtonLink>
            <ButtonLink
              to="/collections/new"
              search={{ customerId: c.id }}
              icon={<Wallet aria-hidden="true" />}
            >
              Record collection
            </ButtonLink>
          </>
        }
      />

      <section aria-label="Account summary" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Outstanding"
          value={formatMoneyCompact(kpis.outstanding)}
          icon={<Receipt />}
          footnote={
            <span className="text-fg-muted">
              {c.creditUsedPct}% of {formatMoneyCompact(c.creditLimit)} limit
            </span>
          }
        />
        <KpiCard
          label="Overdue"
          value={formatMoneyCompact(kpis.overdue)}
          icon={<AlertTriangle />}
          footnote={
            kpis.overdue ? (
              <span className="font-medium text-danger">Follow up required</span>
            ) : (
              <span className="text-success">Nothing overdue</span>
            )
          }
        />
        <KpiCard label="Jobs this year" value={String(kpis.jobsThisYear)} icon={<Truck />} />
        <KpiCard
          label="Invoiced revenue"
          value={formatMoneyCompact(kpis.revenue)}
          icon={<CircleDollarSign />}
          footnote={<span className="text-fg-muted">Excl. VAT · 2026</span>}
        />
      </section>

      <Card>
        <div className="px-5 pt-3">
          <Tabs
            label="Customer sections"
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            items={[
              { value: 'profile', label: 'Profile' },
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
        {tab === 'profile' ? (
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Customer code', value: c.code },
                { label: 'Industry', value: c.industry },
                { label: 'Location', value: `${c.city}, ${c.country}` },
                { label: 'TRN', value: <span className="font-mono">{c.trnMasked}</span> },
                { label: 'Credit limit', value: <Money amount={c.creditLimit} /> },
                { label: 'Payment terms', value: `${c.paymentTermsDays} days` },
                { label: 'Contact', value: c.contactName },
                { label: 'Email', value: c.contactEmail },
                { label: 'Phone', value: c.contactPhone },
                { label: 'Customer since', value: formatDate(c.createdAt) },
              ]}
            />
          </CardBody>
        ) : null}
        {tab === 'activity' ? <ActivityLists data={data} /> : null}
        {tab === 'statement' ? <StatementTable lines={data.statement} /> : null}
      </Card>
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
