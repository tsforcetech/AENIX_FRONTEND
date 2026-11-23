import { getRouteApi, Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { Truck } from 'lucide-react';
import { lookupName } from '@/shared/data/lookups';
import { StatusBadge } from '@/shared/ui/Badge';
import { ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { formatDate } from '@/shared/utils/format';
import { useContract } from './api';
import { remainingLabel } from './ContractsListPage';

const route = getRouteApi('/_app/contracts/$id');

export function ContractDetailPage() {
  const { id } = route.useParams();
  const { data: c, isLoading, error } = useContract(id);

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Contract not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !c) return <StatusMessage kind="loading" title="Loading contract…" />;

  const usable = c.status === 'Active' || c.status === 'Expiring';

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Contracts', to: '/contracts' }, { label: c.number }]}
        title={c.title}
        meta={<StatusBadge status={c.status} />}
        description={
          <>
            <DocRef>{c.number}</DocRef> · {c.customerName}
          </>
        }
        actions={
          usable ? (
            <ButtonLink
              to="/work-orders/new"
              search={{ contractId: c.id, customerId: c.customerId }}
              icon={<Truck aria-hidden="true" />}
            >
              New work order under contract
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Contract period" />
            <CardBody>
              <div className="flex flex-wrap items-end justify-between gap-2 text-body-s">
                <div>
                  <p className="text-caption text-fg-muted">Start</p>
                  <p className="font-semibold">{formatDate(c.startDate)}</p>
                </div>
                <p
                  className={clsx(
                    'font-semibold',
                    c.daysRemaining < 0
                      ? 'text-fg-muted'
                      : c.daysRemaining <= 30
                        ? 'text-warning'
                        : 'text-fg',
                  )}
                >
                  {remainingLabel(c.daysRemaining)}
                </p>
                <div className="text-right">
                  <p className="text-caption text-fg-muted">End</p>
                  <p className="font-semibold">{formatDate(c.endDate)}</p>
                </div>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-valuenow={c.elapsedPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Contract period elapsed"
              >
                <div
                  className={clsx('h-full rounded-full', c.daysRemaining <= 30 ? 'bg-warning' : 'bg-brand')}
                  style={{ width: `${c.elapsedPct}%` }}
                />
              </div>
              <p className="mt-2 text-caption text-fg-muted">
                {c.elapsedPct}% of the contract period has elapsed.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Agreed rates" description="Applied to every job run under this contract" />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-s">
                <caption className="sr-only">Agreed rates</caption>
                <thead>
                  <tr className="border-y border-border-subtle bg-canvas/60 text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Service
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Unit
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Rate
                    </th>
                    <th scope="col" className="hidden px-5 py-2.5 text-right font-medium md:table-cell">
                      Cost basis
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium">{l.description}</p>
                        <p className="text-caption text-fg-muted">{lookupName.service(l.serviceId)}</p>
                      </td>
                      <td className="px-3 py-3 text-fg-secondary">{l.unit}</td>
                      <td className="px-3 py-3 text-right font-medium">
                        <Money amount={l.unitPrice} />
                      </td>
                      <td className="hidden px-5 py-3 text-right md:table-cell">
                        <Money amount={l.unitCost} muted />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Jobs under this contract" description={`${c.workOrders.length} work orders`} />
            <CardBody>
              {c.workOrders.length === 0 ? (
                <p className="text-body-s text-fg-muted">
                  No jobs have been run under this contract yet.
                  {usable ? ' Use “New work order under contract” to start one at the agreed rates.' : ''}
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {c.workOrders.map((w) => (
                    <li key={w.id}>
                      <Link
                        to="/work-orders/$id"
                        params={{ id: w.id }}
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-canvas"
                      >
                        <DocRef>{w.number}</DocRef>
                        <span className="flex-1 truncate text-body-s">
                          {w.origin} → {w.destination}
                        </span>
                        <Money amount={w.revenue} className="text-body-s" />
                        <StatusBadge status={w.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                items={[
                  {
                    label: 'Customer',
                    value: (
                      <Link
                        to="/customers/$id"
                        params={{ id: c.customerId }}
                        className="font-medium hover:text-brand hover:underline"
                      >
                        {c.customerName}
                      </Link>
                    ),
                  },
                  { label: 'Billing cycle', value: c.billingCycle },
                  {
                    label: 'From quotation',
                    value:
                      c.quotationId && c.quotationNumber ? (
                        <Link to="/quotations/$id" params={{ id: c.quotationId }} className="hover:underline">
                          <DocRef>{c.quotationNumber}</DocRef>
                        </Link>
                      ) : (
                        'Negotiated directly'
                      ),
                  },
                  { label: 'Rate lines', value: String(c.lines.length) },
                ]}
              />
            </CardBody>
          </Card>
          {c.status === 'Expiring' ? (
            <StatusMessage
              kind="denied"
              title="Renewal due"
              description="This contract ends within 30 days. Prepare a long-term quotation to renew the rates."
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
