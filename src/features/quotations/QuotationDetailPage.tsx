import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  Check,
  CopyPlus,
  FileSignature,
  RotateCcw,
  Send,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { lookupName } from '@/shared/data/lookups';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { Logo } from '@/shared/ui/Logo';
import { servicesLabel } from '@/domain/workflow';
import { locationTextMulti, ServiceTypePills } from '@/features/sales-orders/commercial-ui';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import {
  totals,
  useCreateContractFromQuotation,
  useQuotation,
  useQuotationAction,
  useReviseQuotation,
  type QuotationAction,
  type QuotationDetail,
} from './api';
import { QuotationTotals } from './QuotationTotals';

const route = getRouteApi('/_app/quotations/$id');

const STEPS = ['Draft', 'Pending approval', 'Sent', 'Accepted'] as const;

const actionToast: Record<QuotationAction, string> = {
  submit: 'submitted for approval',
  approve: 'approved and sent',
  sendBack: 'returned to draft',
  accept: 'marked accepted',
  reject: 'marked rejected',
};

export function QuotationDetailPage() {
  const { id } = route.useParams();
  const { data: q, isLoading, error } = useQuotation(id);
  const act = useQuotationAction();
  const revise = useReviseQuotation();
  const toContract = useCreateContractFromQuotation();
  const toast = useToast();
  const navigate = useNavigate();

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Quotation not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !q) return <StatusMessage kind="loading" title="Loading quotation…" />;

  const run = (action: QuotationAction) =>
    act.mutate(
      { id: q.id, action },
      { onSuccess: () => toast({ title: `${q.number} ${actionToast[action]}` }) },
    );
  const pending = act.isPending || revise.isPending || toContract.isPending;
  const t = totals(q.lines);

  const actions = (() => {
    switch (q.status) {
      case 'Draft':
        return (
          <Button icon={<Send aria-hidden="true" />} busy={pending} onClick={() => run('submit')}>
            Submit for approval
          </Button>
        );
      case 'Pending approval':
        return (
          <>
            <Button
              variant="secondary"
              icon={<RotateCcw aria-hidden="true" />}
              disabled={pending}
              onClick={() => run('sendBack')}
            >
              Return to draft
            </Button>
            <Button icon={<Check aria-hidden="true" />} busy={pending} onClick={() => run('approve')}>
              Approve & send
            </Button>
          </>
        );
      case 'Sent':
        return (
          <>
            <Button
              variant="ghost"
              icon={<CopyPlus aria-hidden="true" />}
              disabled={pending}
              onClick={() =>
                revise.mutate(q.id, {
                  onSuccess: (copy) => {
                    toast({
                      title: `${copy.number} v${copy.version} created`,
                      body: 'The previous version is superseded.',
                    });
                    void navigate({ to: '/quotations/$id', params: { id: copy.id } });
                  },
                })
              }
            >
              Revise
            </Button>
            <Button
              variant="danger"
              icon={<ThumbsDown aria-hidden="true" />}
              disabled={pending}
              onClick={() => run('reject')}
            >
              Mark rejected
            </Button>
            <Button icon={<ThumbsUp aria-hidden="true" />} busy={pending} onClick={() => run('accept')}>
              Mark accepted
            </Button>
          </>
        );
      case 'Accepted':
        return (
          <>
            {q.agreement === 'Long-term' && q.contracts.length === 0 ? (
              <Button
                variant="secondary"
                icon={<FileSignature aria-hidden="true" />}
                busy={toContract.isPending}
                disabled={pending}
                onClick={() =>
                  toContract.mutate(q.id, {
                    onSuccess: (c) => {
                      toast({
                        title: `${c.number} created`,
                        body: 'Agreed rates are now available for future jobs.',
                      });
                      void navigate({ to: '/contracts/$id', params: { id: c.id } });
                    },
                  })
                }
              >
                Create contract
              </Button>
            ) : null}
            <ButtonLink
              to="/sales-orders/new"
              search={{ quotationId: q.id }}
              icon={<ShoppingCart aria-hidden="true" />}
            >
              Convert to sales order
            </ButtonLink>
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Quotations', to: '/quotations' }, { label: `${q.number} v${q.version}` }]}
        title={
          <>
            {q.number} <span className="text-fg-muted">v{q.version}</span>
          </>
        }
        meta={<StatusBadge status={q.status} />}
        description={`${q.customerName} · prepared ${formatDateTime(q.createdAt)} by ${q.owner}`}
        actions={actions}
      />

      <StatusTrack status={q.status} />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: 'Customer',
                    value: (
                      <Link
                        to="/customers/$id"
                        params={{ id: q.customerId }}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {q.customerName}
                      </Link>
                    ),
                  },
                  {
                    label: 'Service',
                    value: (
                      <span className="flex flex-col gap-1.5">
                        <ServiceTypePills categories={q.serviceCategories} mode={q.mode} />
                        <span>{locationTextMulti(q.serviceCategories, q.origin, q.destination)}</span>
                      </span>
                    ),
                  },
                  { label: 'Agreement', value: q.agreement },
                  { label: 'Valid until', value: formatDate(q.validUntil) },
                  {
                    label: 'Enquiry',
                    value:
                      q.enquiryId && q.enquiryNumber ? (
                        <Link to="/enquiries/$id" params={{ id: q.enquiryId }} className="hover:underline">
                          <DocRef>{q.enquiryNumber}</DocRef>
                        </Link>
                      ) : (
                        'Direct quotation'
                      ),
                  },
                  {
                    label: 'Margin',
                    value: (
                      <span
                        className={clsx('font-semibold', t.marginPct < 15 ? 'text-warning' : 'text-success')}
                      >
                        {t.marginPct}%
                      </span>
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Price lines" description="Cost and margin are internal" />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-s">
                <caption className="sr-only">Price lines</caption>
                <thead>
                  <tr className="border-y border-border-subtle bg-canvas/60 text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Description
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Qty
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Unit price
                    </th>
                    <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">
                      Unit cost
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium">{l.description}</p>
                        <p className="text-caption text-fg-muted">{lookupName.service(l.serviceId)}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        {l.quantity} <span className="text-fg-muted">{l.unit}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Money amount={l.unitPrice} />
                      </td>
                      <td className="hidden px-3 py-3 text-right md:table-cell">
                        <Money amount={l.unitCost} muted />
                      </td>
                      <td className="px-5 py-3 text-right font-medium">
                        <Money amount={l.quantity * l.unitPrice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CardBody className="border-t border-border-subtle">
              <QuotationTotals t={t} />
            </CardBody>
          </Card>

          <CustomerPreview q={q} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Sales orders" description="Customer orders confirmed from this quotation" />
            <CardBody>
              {q.salesOrders.length === 0 ? (
                <p className="text-body-s text-fg-muted">
                  {q.status === 'Accepted'
                    ? 'No sales order yet. Create one with the customer’s PO reference.'
                    : 'Available once the customer accepts.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {q.salesOrders.map((so) => (
                    <li key={so.id}>
                      <Link
                        to="/sales-orders/$id"
                        params={{ id: so.id }}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                      >
                        <span className="min-w-0">
                          <DocRef>{so.number}</DocRef>
                          <span className="block truncate text-caption text-fg-muted">
                            PO {so.customerPoRef}
                          </span>
                        </span>
                        <StatusBadge status={so.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Jobs" description="Work orders running under its sales orders" />
            <CardBody>
              {q.workOrders.length === 0 ? (
                <p className="text-body-s text-fg-muted">
                  {q.salesOrders.length
                    ? 'No work order yet. Open the sales order to create one.'
                    : 'Created from a sales order.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {q.workOrders.map((w) => (
                    <li key={w.id}>
                      <Link
                        to="/work-orders/$id"
                        params={{ id: w.id }}
                        className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                      >
                        <DocRef>{w.number}</DocRef>
                        <StatusBadge status={w.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {q.contracts.length ? (
            <Card>
              <CardHeader title="Contract" />
              <CardBody>
                <ul className="space-y-2">
                  {q.contracts.map((c) => (
                    <li key={c.id}>
                      <Link
                        to="/contracts/$id"
                        params={{ id: c.id }}
                        className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                      >
                        <DocRef>{c.number}</DocRef>
                        <StatusBadge status={c.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Version history" />
            <CardBody>
              <ol className="space-y-3">
                {q.versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-3">
                    <span
                      className={clsx(
                        'grid size-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-medium',
                        v.id === q.id
                          ? 'bg-surface-inverse text-fg-inverse'
                          : 'bg-surface-muted text-fg-muted',
                      )}
                    >
                      v{v.version}
                    </span>
                    <div className="min-w-0 flex-1">
                      {v.id === q.id ? (
                        <p className="text-body-s font-medium">Current version</p>
                      ) : (
                        <Link
                          to="/quotations/$id"
                          params={{ id: v.id }}
                          className="text-body-s font-medium hover:text-brand hover:underline"
                        >
                          Version {v.version}
                        </Link>
                      )}
                      <p className="text-caption text-fg-muted">{formatDateTime(v.createdAt)}</p>
                    </div>
                    <StatusBadge status={v.status} />
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusTrack({ status }: { status: QuotationDetail['status'] }) {
  const terminal = status === 'Rejected' || status === 'Expired';
  const idx = STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <ol aria-label="Quotation progress" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map((s, i) => {
        const done = !terminal && (i < idx || status === 'Accepted');
        const current = !terminal && !done && i === idx;
        return (
          <li
            key={s}
            aria-current={current ? 'step' : undefined}
            className={clsx(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-body-s',
              done && 'border-transparent bg-brand-subtle text-brand',
              current && 'border-brand bg-surface font-medium text-fg',
              !done && !current && 'border-border-subtle bg-surface text-fg-muted',
            )}
          >
            <span
              className={clsx(
                'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                done
                  ? 'bg-brand text-brand-fg'
                  : current
                    ? 'bg-surface-inverse text-fg-inverse'
                    : 'bg-surface-muted',
              )}
            >
              {done ? <Check aria-hidden="true" className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            {s}
          </li>
        );
      })}
      {terminal ? (
        <li className="col-span-full text-caption text-fg-muted">
          This quotation is <strong className="font-medium text-fg">{status.toLowerCase()}</strong> and can no
          longer be accepted.
        </li>
      ) : null}
    </ol>
  );
}

/** Document-style preview of what the customer receives (no cost/margin). */
function CustomerPreview({ q }: { q: QuotationDetail }) {
  const t = totals(q.lines);
  return (
    <Card>
      <CardHeader
        title="Customer preview"
        description="What the customer sees — internal cost and margin are excluded"
      />
      <CardBody>
        <article
          className="rounded-xl border border-border bg-surface p-6 shadow-card sm:p-8"
          aria-label="Quotation document preview"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-5">
            <Logo height={36} />
            <div className="text-right">
              <p className="font-mono text-caption uppercase tracking-[0.14em] text-brand">Quotation</p>
              <p className="mt-1 text-[18px] font-semibold">
                {q.number} <span className="text-fg-muted">v{q.version}</span>
              </p>
              <p className="text-caption text-fg-muted">Valid until {formatDate(q.validUntil)}</p>
            </div>
          </header>
          <div className="grid gap-4 py-5 text-body-s sm:grid-cols-2">
            <div>
              <p className="text-caption uppercase tracking-wide text-fg-muted">Prepared for</p>
              <p className="mt-1 font-semibold">{q.customerName}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-caption uppercase tracking-wide text-fg-muted">Service</p>
              <p className="mt-1 font-semibold">
                {servicesLabel(q.serviceCategories, q.mode)} ·{' '}
                {locationTextMulti(q.serviceCategories, q.origin, q.destination)}
              </p>
            </div>
          </div>
          <table className="w-full text-left text-body-s">
            <caption className="sr-only">Quoted services</caption>
            <thead>
              <tr className="border-b border-fg text-caption uppercase tracking-wide">
                <th scope="col" className="py-2 font-medium">
                  Item
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Rate
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l) => (
                <tr key={l.id} className="border-b border-border-subtle">
                  <td className="py-2.5 pr-3">{l.description}</td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums">
                    {l.quantity} {l.unit}
                  </td>
                  <td className="py-2.5 text-right">
                    <Money amount={l.unitPrice} />
                  </td>
                  <td className="py-2.5 text-right">
                    <Money amount={l.quantity * l.unitPrice} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-5">
            <QuotationTotals t={t} showMargin={false} />
          </div>
          <p className="mt-6 border-t border-border-subtle pt-4 text-caption leading-5 text-fg-muted">
            {q.terms}
          </p>
        </article>
      </CardBody>
    </Card>
  );
}
