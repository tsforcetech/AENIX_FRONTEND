import { getRouteApi, Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { BadgeCheck, Banknote, Lock } from 'lucide-react';
import { jobKindLabel } from '@/domain/workflow';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { useApproveBill, useVendorBill, type VendorBillRow } from './api';
import { MatchPanel } from './MatchPanel';
import { VarianceTag } from './VarianceTag';

const route = getRouteApi('/_app/vendor-bills/$id');

export function VendorBillDetailPage() {
  const { id } = route.useParams();
  const { data: b, isLoading, error } = useVendorBill(id);
  const approve = useApproveBill();
  const toast = useToast();

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Purchase invoice not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !b) return <StatusMessage kind="loading" title="Loading purchase invoice…" />;

  const payable = b.status === 'Approved' || b.status === 'Partially paid' || b.status === 'Overdue';

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Purchase invoices', to: '/vendor-bills' }, { label: b.number }]}
        title={b.number}
        meta={
          <>
            <StatusBadge status={b.status} />
            {b.draftedAtCompletion ? (
              <Badge tone="info" dot={false}>
                Drafted at job completion
              </Badge>
            ) : null}
          </>
        }
        description={`${b.vendorName} · vendor invoice ${b.vendorRef}`}
        actions={
          <>
            {b.status === 'Draft' ? (
              <Button
                icon={<BadgeCheck aria-hidden="true" />}
                busy={approve.isPending}
                onClick={() =>
                  approve.mutate(b.id, {
                    onSuccess: () =>
                      toast({ title: `${b.number} approved`, body: 'Cost and payable recognised' }),
                  })
                }
              >
                Approve invoice
              </Button>
            ) : null}
            {payable ? (
              <ButtonLink
                to="/payments/new"
                search={{ vendorId: b.vendorId, billId: b.id }}
                icon={<Banknote aria-hidden="true" />}
              >
                Record payment
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Purchase invoice details" />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: 'Vendor',
                    value: (
                      <Link to="/vendors" className="font-medium hover:text-brand hover:underline">
                        {b.vendorName}
                      </Link>
                    ),
                  },
                  { label: 'Category', value: b.vendorCategory },
                  { label: 'Vendor invoice', value: <span className="font-mono">{b.vendorRef}</span> },
                  { label: 'Invoice date', value: formatDate(b.billDate) },
                  {
                    label: 'Due date',
                    value: (
                      <span className={clsx(b.daysOverdue > 0 && 'font-medium text-danger')}>
                        {formatDate(b.dueDate)}
                        {b.daysOverdue > 0 ? ` · ${b.daysOverdue} days overdue` : ''}
                      </span>
                    ),
                  },
                  {
                    label: 'Source job',
                    value: b.workOrderId ? (
                      <Link
                        to="/work-orders/$id"
                        params={{ id: b.workOrderId }}
                        className="font-mono text-brand hover:underline"
                      >
                        {b.workOrderNumber}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: 'Job type',
                    value: b.jobCategory ? (
                      <span className="inline-flex items-center gap-1.5">
                        <JobKindIcon
                          category={b.jobCategory}
                          mode={b.jobMode}
                          className="size-4 text-fg-muted"
                        />
                        {jobKindLabel(b.jobCategory, b.jobMode)}
                      </span>
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Job status', value: b.jobStatus ? <StatusBadge status={b.jobStatus} /> : '—' },
                  {
                    label: 'Purchase order',
                    value: b.po ? (
                      <Link
                        to="/purchase-orders/$id"
                        params={{ id: b.po.id }}
                        className="font-mono text-brand hover:underline"
                      >
                        {b.po.number}
                      </Link>
                    ) : (
                      'Not matched to a PO'
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Job cost match"
              description="Invoice amount (before VAT) against the vendor cost agreed on the work order"
            />
            <CardBody>
              {b.agreedCost === undefined ? (
                <p className="text-body-s text-fg-muted">
                  This purchase invoice is not linked to a work order.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-canvas p-4">
                    <p className="text-caption text-fg-muted">Agreed on job</p>
                    <Money amount={b.agreedCost} className="mt-1 block text-[20px] font-semibold" />
                  </div>
                  <div className="rounded-xl bg-canvas p-4">
                    <p className="text-caption text-fg-muted">Invoiced (net)</p>
                    <Money amount={b.amount} className="mt-1 block text-[20px] font-semibold" />
                  </div>
                  <div
                    className={clsx(
                      'rounded-xl p-4',
                      Math.abs(b.variance ?? 0) < 0.01
                        ? 'bg-success-subtle'
                        : (b.variance ?? 0) > 0
                          ? 'bg-danger-subtle'
                          : 'bg-warning-subtle',
                    )}
                  >
                    <p className="text-caption text-fg-muted">Variance</p>
                    <Money amount={b.variance ?? 0} className="mt-1 block text-[20px] font-semibold" />
                    <VarianceTag variance={b.variance ?? 0} />
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {b.match && b.po ? (
            <MatchPanel match={b.match} poNumber={b.po.number} />
          ) : b.evidence && b.jobCategory !== 'Service' ? (
            <EvidenceCard b={b} />
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Amounts" />
            <CardBody>
              <dl className="space-y-2 text-body-s">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Net amount</dt>
                  <dd>
                    <Money amount={b.amount} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">VAT 5%</dt>
                  <dd>
                    <Money amount={b.vat} />
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border-subtle pt-2 font-semibold">
                  <dt>Total</dt>
                  <dd>
                    <Money amount={b.total} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Paid</dt>
                  <dd>
                    <Money amount={b.paid} muted />
                  </dd>
                </div>
                <div className="flex justify-between rounded-lg bg-surface-inverse px-3 py-2 font-semibold text-fg-inverse">
                  <dt>Outstanding</dt>
                  <dd>
                    <Money amount={b.outstanding} />
                  </dd>
                </div>
              </dl>
              {b.status !== 'Draft' ? (
                <p className="mt-4 flex items-start gap-2 text-caption text-fg-muted">
                  <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  Approved purchase invoices are read-only. Disputes are settled with a vendor debit note.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** GRN / POD status on the source job so AP can check delivery evidence before approving. */
function EvidenceCard({ b }: { b: VendorBillRow }) {
  const ev = b.evidence!;
  const hasAny = !!ev.packingList || !!ev.grn || ev.requests.length > 0;
  return (
    <Card>
      <CardHeader
        title="Delivery evidence"
        description="Check the job's GRN and PODs before approving"
        actions={
          b.workOrderId ? (
            <Link
              to="/work-orders/$id"
              params={{ id: b.workOrderId }}
              className="text-body-s font-medium text-brand hover:underline"
            >
              Open {b.workOrderNumber}
            </Link>
          ) : null
        }
      />
      <CardBody>
        {!hasAny ? (
          <p className="text-body-s text-fg-muted">No GRN or customer requests recorded on this job.</p>
        ) : (
          <ul className="divide-y divide-border-subtle text-body-s">
            {ev.packingList ? (
              <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  Product list <span className="font-mono text-[13px]">{ev.packingList.number}</span>
                </span>
                <StatusBadge status={ev.packingList.status} />
              </li>
            ) : null}
            {ev.packingList || ev.grn ? (
              <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  GRN{' '}
                  {ev.grn ? (
                    <span className="font-mono text-[13px]">{ev.grn.number}</span>
                  ) : (
                    <span className="text-fg-muted">not received</span>
                  )}
                </span>
                {ev.grn ? <StatusBadge status={ev.grn.status} /> : <Badge tone="warning">Pending</Badge>}
              </li>
            ) : null}
            {ev.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  Request <span className="font-mono text-[13px]">{r.number}</span> · POD{' '}
                  {r.podNumber ? (
                    <span className="font-mono text-[13px]">{r.podNumber}</span>
                  ) : (
                    <span className="text-fg-muted">pending</span>
                  )}
                </span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
