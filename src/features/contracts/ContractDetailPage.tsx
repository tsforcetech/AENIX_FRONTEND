import { getRouteApi, Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { useState } from 'react';
import { PencilLine, ShoppingCart } from 'lucide-react';
import { lookupName } from '@/shared/data/lookups';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { TextField } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Toast';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { formatDate, formatMoney } from '@/shared/utils/format';
import { locationTextMulti } from '@/features/sales-orders/commercial-ui';
import {
  useContract,
  useUpdateContractTerms,
  validateContractTerms,
  type ContractDetail,
  type ContractTermsInput,
} from './api';
import { remainingLabel } from './ContractsListPage';

const route = getRouteApi('/_app/contracts/$id');

/** C6: edit fuel surcharge % and storage terms (validated). */
function TermsDialog({ c, onClose }: { c: ContractDetail; onClose: () => void }) {
  const update = useUpdateContractTerms();
  const toast = useToast();
  const [form, setForm] = useState({
    fuelSurchargePct: String(c.fuelSurchargePct ?? 0),
    minimumMonthlyStorage: String(c.minimumMonthlyStorage ?? 0),
    storageFreeDays: String(c.storageFreeDays ?? 0),
  });
  const [touched, setTouched] = useState(false);
  const parsed: ContractTermsInput = {
    fuelSurchargePct: form.fuelSurchargePct.trim() === '' ? 0 : Number(form.fuelSurchargePct),
    minimumMonthlyStorage: form.minimumMonthlyStorage.trim() === '' ? 0 : Number(form.minimumMonthlyStorage),
    storageFreeDays: form.storageFreeDays.trim() === '' ? 0 : Number(form.storageFreeDays),
  };
  const errors = touched ? validateContractTerms(parsed) : {};
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = () => {
    setTouched(true);
    if (Object.keys(validateContractTerms(parsed)).length) return;
    update.mutate(
      { id: c.id, ...parsed },
      {
        onSuccess: () => {
          toast({ title: `${c.number} terms updated` });
          onClose();
        },
        onError: (e) => toast({ title: 'Could not save the terms', body: e.message }),
      },
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit terms — ${c.number}`}
      description="Changes apply to new sales orders and storage billing runs."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={update.isPending} onClick={submit}>
            Save terms
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Fuel surcharge %"
          inputMode="decimal"
          hint="0 = none"
          value={form.fuelSurchargePct}
          error={errors.fuelSurchargePct}
          onChange={set('fuelSurchargePct')}
        />
        <TextField
          label="Min. monthly storage (AED)"
          inputMode="decimal"
          value={form.minimumMonthlyStorage}
          error={errors.minimumMonthlyStorage}
          onChange={set('minimumMonthlyStorage')}
        />
        <TextField
          label="Storage free days"
          inputMode="numeric"
          value={form.storageFreeDays}
          error={errors.storageFreeDays}
          onChange={set('storageFreeDays')}
        />
      </div>
    </Dialog>
  );
}

export function ContractDetailPage() {
  const { id } = route.useParams();
  const { data: c, isLoading, error } = useContract(id);
  const [editing, setEditing] = useState(false);

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
              to="/sales-orders/new"
              search={{ contractId: c.id, customerId: c.customerId }}
              icon={<ShoppingCart aria-hidden="true" />}
            >
              New sales order under contract
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
                  {usable ? ' Use “New sales order under contract” to order at the agreed rates.' : ''}
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
                          {locationTextMulti(w.serviceCategories, w.origin, w.destination)}
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
            <CardHeader
              title="Commercial terms"
              description="Surcharge and storage clauses"
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<PencilLine aria-hidden="true" />}
                  onClick={() => setEditing(true)}
                >
                  Edit terms
                </Button>
              }
            />
            <CardBody>
              <DescriptionList
                items={[
                  {
                    label: 'Fuel surcharge',
                    value: c.fuelSurchargePct
                      ? `${c.fuelSurchargePct}% on transport lines`
                      : 'None',
                  },
                  {
                    label: 'Minimum monthly storage',
                    value: c.minimumMonthlyStorage ? formatMoney(c.minimumMonthlyStorage) : 'None',
                  },
                  {
                    label: 'Storage free days',
                    value: c.storageFreeDays ? `${c.storageFreeDays} days` : 'None',
                  },
                ]}
              />
              <p className="mt-3 text-caption text-fg-muted">
                New sales orders under this contract add the fuel surcharge as a line on the transport subtotal.
              </p>
            </CardBody>
          </Card>
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
          {editing ? <TermsDialog c={c} onClose={() => setEditing(false)} /> : null}
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
