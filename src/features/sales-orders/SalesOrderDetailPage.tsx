import { getRouteApi, Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Ban, Check, CheckCircle2, Plus, Receipt, Wallet } from 'lucide-react';
import { servicesLabel } from '@/domain/workflow';
import { totals } from '@/features/quotations/api';
import { QuotationTotals } from '@/features/quotations/QuotationTotals';
import { lookupName } from '@/shared/data/lookups';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatMoney } from '@/shared/utils/format';
import { useSalesOrder, useSetSalesOrderStatus, type SalesOrderDetail } from './api';
import {
  locationLabel,
  locationTextMulti,
  ServiceIcons,
  ServiceTypePills,
  siteFromNotes,
  withoutSiteLines,
} from './commercial-ui';

const route = getRouteApi('/_app/sales-orders/$id');

export function SalesOrderDetailPage() {
  const { id } = route.useParams();
  const { data: so, isLoading, error } = useSalesOrder(id);
  const setStatus = useSetSalesOrderStatus();
  const toast = useToast();

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Sales order not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !so) return <StatusMessage kind="loading" title="Loading sales order…" />;

  const t = totals(so.lines);
  const canCreateWo = so.status === 'Confirmed' || so.status === 'In progress';
  const transport = so.serviceCategories.includes('Transport');
  const warehouseSite = transport ? siteFromNotes(so.notes, 'Warehouse') : undefined;
  const serviceLocation = siteFromNotes(so.notes, 'Service');
  const notes = withoutSiteLines(so.notes);
  const change = (status: 'Confirmed' | 'Cancelled' | 'Completed', msg: string) =>
    setStatus.mutate({ id: so.id, status }, { onSuccess: () => toast({ title: `${so.number} ${msg}` }) });

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Sales orders', to: '/sales-orders' }, { label: so.number }]}
        title={so.number}
        meta={<StatusBadge status={so.status} />}
        description={`${so.customerName} · PO ${so.customerPoRef} · ordered ${formatDate(so.orderDate)}`}
        actions={
          <>
            {so.status === 'Draft' ? (
              <>
                <Button
                  variant="ghost"
                  icon={<Ban aria-hidden="true" />}
                  busy={setStatus.isPending}
                  onClick={() => change('Cancelled', 'cancelled')}
                >
                  Cancel order
                </Button>
                <Button
                  icon={<CheckCircle2 aria-hidden="true" />}
                  busy={setStatus.isPending}
                  onClick={() => change('Confirmed', 'confirmed')}
                >
                  Confirm sales order
                </Button>
              </>
            ) : null}
            {so.status === 'In progress' &&
            so.workOrderCount > 0 &&
            so.workOrdersCompleted === so.workOrderCount ? (
              <Button
                variant="secondary"
                icon={<Check aria-hidden="true" />}
                busy={setStatus.isPending}
                onClick={() => change('Completed', 'completed')}
              >
                Mark completed
              </Button>
            ) : null}
            {canCreateWo ? (
              <ButtonLink
                to="/work-orders/new"
                search={{ salesOrderId: so.id }}
                icon={<Plus aria-hidden="true" />}
              >
                Create job
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <FlowTracker so={so} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Order summary" />
            <CardBody>
              <div className="mb-6 flex items-center gap-4 rounded-xl bg-canvas p-4">
                <span className="grid h-11 min-w-11 place-items-center rounded-xl bg-surface px-2 text-fg-secondary shadow-card">
                  <ServiceIcons categories={so.serviceCategories} mode={so.mode} className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-caption text-fg-muted">{servicesLabel(so.serviceCategories, so.mode)}</p>
                  <p className="font-semibold">
                    {locationTextMulti(so.serviceCategories, so.origin, so.destination)}
                  </p>
                </div>
              </div>
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: 'Customer',
                    value: (
                      <Link
                        to="/customers/$id"
                        params={{ id: so.customerId }}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {so.customerName}
                      </Link>
                    ),
                  },
                  {
                    label: 'Customer PO',
                    value: <span className="font-mono text-[13px]">{so.customerPoRef}</span>,
                  },
                  { label: 'Order date', value: formatDate(so.orderDate) },
                  {
                    label: 'Services included',
                    value: <ServiceTypePills categories={so.serviceCategories} mode={so.mode} />,
                  },
                  {
                    label: transport
                      ? 'Route'
                      : locationLabel(so.serviceCategories.includes('Warehouse') ? 'Warehouse' : 'Service'),
                    value: locationTextMulti(so.serviceCategories, so.origin, so.destination),
                  },
                  ...(warehouseSite ? [{ label: 'Warehouse / site', value: warehouseSite }] : []),
                  ...(serviceLocation ? [{ label: 'Service location', value: serviceLocation }] : []),
                  { label: 'Owner', value: so.owner },
                  {
                    label: 'Enquiry',
                    value:
                      so.enquiryId && so.enquiryNumber ? (
                        <Link to="/enquiries/$id" params={{ id: so.enquiryId }} className="hover:underline">
                          <DocRef>{so.enquiryNumber}</DocRef>
                        </Link>
                      ) : (
                        '—'
                      ),
                  },
                  {
                    label: 'Quotation',
                    value:
                      so.quotationId && so.quotationNumber ? (
                        <Link
                          to="/quotations/$id"
                          params={{ id: so.quotationId }}
                          className="hover:underline"
                        >
                          <DocRef>{so.quotationNumber}</DocRef>
                        </Link>
                      ) : (
                        '—'
                      ),
                  },
                  {
                    label: 'Contract',
                    value:
                      so.contractId && so.contractNumber ? (
                        <Link to="/contracts/$id" params={{ id: so.contractId }} className="hover:underline">
                          <DocRef>{so.contractNumber}</DocRef>
                        </Link>
                      ) : so.quotationId ? (
                        '—'
                      ) : (
                        <span className="text-warning">Direct — authorised rates</span>
                      ),
                  },
                ]}
              />
              {notes ? (
                <p className="mt-5 whitespace-pre-wrap rounded-lg bg-canvas p-3 text-body-s text-fg-secondary">
                  {notes}
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Price lines" description="AED, excluding VAT" />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-s">
                  <caption className="sr-only">Sales order lines</caption>
                  <thead>
                    <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
                      <th scope="col" className="pb-2 pr-3 font-medium">
                        Description
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-right font-medium">
                        Qty
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-right font-medium">
                        Unit price
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-right font-medium">
                        Unit cost
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {so.lines.map((l) => (
                      <tr key={l.id} className="border-b border-border-subtle last:border-0">
                        <td className="py-3 pr-3">
                          <p className="font-medium">{l.description}</p>
                          <p className="text-caption text-fg-muted">{lookupName.service(l.serviceId)}</p>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {l.quantity} <span className="text-caption text-fg-muted">{l.unit}</span>
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <Money amount={l.unitPrice} />
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <Money amount={l.unitCost} muted />
                        </td>
                        <td className="py-3 text-right font-medium">
                          <Money amount={l.quantity * l.unitPrice} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 border-t border-border-subtle pt-5">
                <QuotationTotals t={t} />
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Jobs" description="Work orders running this sales order" />
            <CardBody>
              {so.workOrders.length === 0 ? (
                <p className="text-body-s text-fg-muted">
                  {canCreateWo
                    ? 'No job yet. Create one to start the work.'
                    : so.status === 'Draft'
                      ? 'Confirm the sales order to create jobs.'
                      : 'No jobs.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {so.workOrders.map((w) => (
                    <li key={w.id}>
                      <Link
                        to="/work-orders/$id"
                        params={{ id: w.id }}
                        className="block rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <ServiceIcons categories={w.serviceCategories} mode={w.mode} />
                            <DocRef>{w.number}</DocRef>
                          </span>
                          <StatusBadge status={w.status} />
                        </span>
                        <span className="mt-2 flex justify-between gap-2 text-caption text-fg-muted">
                          <span className="truncate">{w.currentMilestone}</span>
                          <span className="shrink-0 tabular-nums">{w.progress}%</span>
                        </span>
                        <span
                          className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-muted"
                          role="progressbar"
                          aria-label={`${w.number} progress`}
                          aria-valuenow={w.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span
                            className="block h-full rounded-full bg-brand"
                            style={{ width: `${Math.max(w.progress, 4)}%` }}
                          />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <BillingCard so={so} margin={t.marginPct} />
        </div>
      </div>
    </div>
  );
}

/** Billing & balance for this order: what is invoiced, received (incl. advances) and still due. */
function BillingCard({ so, margin }: { so: SalesOrderDetail; margin: number }) {
  const b = so.billing;
  const open = so.status !== 'Draft' && so.status !== 'Cancelled';
  const rows: { label: string; value: number; tone?: string; hint?: string }[] = [
    { label: 'Order value', value: b.orderValue, hint: `incl. VAT · margin ${margin}%` },
    { label: 'Invoiced', value: b.invoiced },
    {
      label: 'Not yet invoiced',
      value: b.notInvoiced,
      tone: b.notInvoiced > 0.005 ? 'text-warning' : undefined,
    },
    {
      label: 'Received',
      value: b.received,
      hint: b.advance > 0 ? `incl. ${formatMoney(b.advance)} advance` : undefined,
    },
  ];
  return (
    <Card>
      <CardHeader title="Billing & balance" description="AED incl. VAT · from the customer ledger" />
      <CardBody className="space-y-4">
        <dl className="space-y-2.5 text-body-s">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3">
              <dt className="text-fg-secondary">
                {r.label}
                {r.hint ? <span className="block text-caption text-fg-muted">{r.hint}</span> : null}
              </dt>
              <dd className={clsx('tabular-nums', r.tone)}>
                <Money amount={r.value} />
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-inverse px-3 py-2.5 text-fg-inverse">
            <dt className="font-semibold">{b.balance < -0.005 ? 'Advance held' : 'Balance due'}</dt>
            <dd className="text-[17px] font-semibold tabular-nums">
              <Money amount={Math.abs(b.balance)} />
            </dd>
          </div>
        </dl>
        {open ? (
          <div className="grid gap-2">
            {b.notInvoiced > 0.005 ? (
              <ButtonLink
                to="/invoices/new"
                search={{ customerId: so.customerId, salesOrderId: so.id }}
                icon={<Receipt aria-hidden="true" />}
                className="w-full"
              >
                Create invoice
              </ButtonLink>
            ) : null}
            <ButtonLink
              to="/collections/new"
              search={{ customerId: so.customerId, salesOrderId: so.id }}
              variant="secondary"
              icon={<Wallet aria-hidden="true" />}
              className="w-full"
            >
              {b.invoiced > 0 ? 'Receive payment' : 'Receive advance'}
            </ButtonLink>
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 text-caption font-medium uppercase tracking-wide text-fg-muted">Invoices</h3>
          {so.invoices.length === 0 ? (
            <p className="text-body-s text-fg-muted">Not invoiced yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {so.invoices.map((i) => (
                <li key={i.id}>
                  <Link
                    to="/invoices/$id"
                    params={{ id: i.id }}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2 hover:bg-canvas"
                  >
                    <span className="min-w-0">
                      <DocRef>{i.number}</DocRef>
                      <span className="block text-caption text-fg-muted">
                        {formatDate(i.issueDate)}
                        {i.otherOrders.length ? ` · also ${i.otherOrders.join(', ')}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <StatusBadge status={i.status} />
                      <span className="mt-1 block text-caption tabular-nums text-fg-muted">
                        {i.outstanding > 0.005 ? `${formatMoney(i.outstanding)} open` : 'Settled'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-caption font-medium uppercase tracking-wide text-fg-muted">Receipts</h3>
          {so.receipts.length === 0 ? (
            <p className="text-body-s text-fg-muted">No payment received yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle text-body-s">
              {so.receipts.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <DocRef>{r.number}</DocRef>
                    <span className="block text-caption text-fg-muted">
                      {formatDate(r.date)} · {r.method} · {r.appliedTo}
                    </span>
                  </span>
                  <Money amount={r.amount} className="shrink-0 font-medium" />
                </li>
              ))}
            </ul>
          )}
          {so.invoices.some((i) => i.otherOrders.length) ? (
            <p className="mt-2 text-caption text-fg-muted">
              Receipts on invoices that bill several orders are shared across them in proportion to each
              order’s lines.
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

/** Enquiry → Quotation → Sales order → Job(s) → Completed → Invoiced → Paid. */
function FlowTracker({ so }: { so: SalesOrderDetail }) {
  const anyWo = so.workOrders.length > 0;
  const allDone = anyWo && so.workOrders.every((w) => w.status === 'Completed');
  const b = so.billing;
  const fullyInvoiced = b.invoiced > 0.005 && b.notInvoiced <= 0.005;
  const paid = fullyInvoiced && b.balance <= 0.005;
  const steps = [
    { label: 'Enquiry', state: so.enquiryId ? 'done' : 'skipped' },
    { label: 'Quotation', state: so.quotationId ? 'done' : 'skipped' },
    {
      label: 'Sales order',
      state: so.status === 'Draft' ? 'current' : so.status === 'Cancelled' ? 'skipped' : 'done',
    },
    { label: 'Job(s)', state: anyWo ? 'done' : so.status === 'Draft' ? 'pending' : 'current' },
    { label: 'Completed', state: allDone ? 'done' : anyWo ? 'current' : 'pending' },
    {
      label: 'Invoiced',
      state: fullyInvoiced ? 'done' : b.invoiced > 0.005 || allDone ? 'current' : 'pending',
    },
    { label: 'Paid', state: paid ? 'done' : b.received > 0.005 || fullyInvoiced ? 'current' : 'pending' },
  ] as const;
  return (
    <nav aria-label="Order flow" className="mb-6 overflow-x-auto">
      <ol className="flex min-w-[760px] items-center gap-2 rounded-xl border border-border-subtle bg-surface p-3 shadow-card">
        {steps.map((s, i) => (
          <li key={s.label} className="flex flex-1 items-center gap-2">
            <span
              className={clsx(
                'grid size-7 shrink-0 place-items-center rounded-full text-caption font-semibold',
                s.state === 'done' && 'bg-brand text-brand-fg',
                s.state === 'current' && 'border-2 border-brand bg-surface text-brand',
                s.state === 'pending' && 'border border-border bg-surface text-fg-muted',
                s.state === 'skipped' && 'border border-dashed border-border bg-canvas text-fg-muted',
              )}
            >
              {s.state === 'done' ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={clsx(
                  'block truncate text-body-s',
                  s.state === 'current' ? 'font-semibold text-fg' : 'text-fg-secondary',
                )}
              >
                {s.label}
              </span>
              <span className="block text-[11px] text-fg-muted">
                {s.state === 'done'
                  ? 'Done'
                  : s.state === 'current'
                    ? 'In progress'
                    : s.state === 'skipped'
                      ? 'Not used'
                      : 'Pending'}
              </span>
            </span>
            {i < steps.length - 1 ? <span aria-hidden="true" className="h-px flex-1 bg-border" /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
