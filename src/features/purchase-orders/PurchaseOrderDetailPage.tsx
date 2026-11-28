import { getRouteApi, Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock3, FilePlus2, Printer, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField } from '@/shared/ui/Field';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDateTime } from '@/shared/utils/format';
import { usePurchaseOrder, usePurchaseOrderAction, type PurchaseOrderDetail } from './api';

const route = getRouteApi('/_app/purchase-orders/$id');

export function PurchaseOrderDetailPage() {
  const { id } = route.useParams();
  const { data: po, isLoading, error } = usePurchaseOrder(id);
  const action = usePurchaseOrderAction();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();

  if (error) return <StatusMessage kind="error" title="Purchase order not found" />;
  if (isLoading || !po) return <StatusMessage kind="loading" title="Loading purchase order…" />;

  const onError = (e: unknown) =>
    toast({ title: 'Action not allowed', body: e instanceof Error ? e.message : 'Please try again.' });
  const canRecordInvoice = !po.vendorBillId && (po.status === 'Completed' || po.status === 'Accepted');

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Purchase orders', to: '/purchase-orders' }, { label: po.number }]}
        title={po.number}
        meta={<StatusBadge status={po.status} />}
        description={`${po.vendorName} · issued ${formatDateTime(po.issuedAt)}`}
        actions={
          <>
            <ButtonLink
              to="/purchase-orders/$id/print"
              params={{ id: po.id }}
              variant="ghost"
              icon={<Printer aria-hidden="true" />}
            >
              Print PO
            </ButtonLink>
            {po.status !== 'Billed' && po.status !== 'Cancelled' ? (
              <Button
                variant="ghost"
                icon={<XCircle aria-hidden="true" />}
                onClick={() => setCancelOpen(true)}
              >
                Cancel PO
              </Button>
            ) : null}
            {po.status === 'Issued' ? (
              <Button
                variant="secondary"
                busy={action.isPending}
                onClick={() =>
                  action.mutate(
                    { id: po.id, kind: 'accept' },
                    { onSuccess: () => toast({ title: `${po.number} accepted by the vendor` }), onError },
                  )
                }
              >
                Record vendor acceptance
              </Button>
            ) : null}
            {po.status === 'Issued' || po.status === 'Accepted' ? (
              <Button
                variant="secondary"
                icon={<CheckCircle2 aria-hidden="true" />}
                busy={action.isPending}
                onClick={() =>
                  action.mutate(
                    { id: po.id, kind: 'complete' },
                    { onSuccess: () => toast({ title: `${po.number} marked completed` }), onError },
                  )
                }
              >
                Mark completed
              </Button>
            ) : null}
            {canRecordInvoice ? (
              <ButtonLink
                to="/vendor-bills/new"
                search={{ purchaseOrderId: po.id }}
                icon={<FilePlus2 aria-hidden="true" />}
              >
                Record vendor invoice
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Order" />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  { label: 'Vendor', value: po.vendorName },
                  { label: 'Service', value: po.serviceName },
                  {
                    label: 'Job',
                    value: (
                      <Link
                        to="/work-orders/$id"
                        params={{ id: po.workOrderId }}
                        className="inline-flex items-center gap-1.5 font-mono font-medium text-brand hover:underline"
                      >
                        <JobKindIcon category={po.jobCategory} mode={po.jobMode} className="size-4" />
                        {po.jobNumber}
                      </Link>
                    ),
                  },
                  { label: 'Customer', value: po.customerName },
                  {
                    label: 'Sales order',
                    value:
                      po.salesOrderId && po.salesOrderNumber ? (
                        <Link
                          to="/sales-orders/$id"
                          params={{ id: po.salesOrderId }}
                          className="font-mono font-medium text-brand hover:underline"
                        >
                          {po.salesOrderNumber}
                        </Link>
                      ) : (
                        '—'
                      ),
                  },
                  { label: 'Job status', value: <StatusBadge status={po.jobStatus} /> },
                  { label: 'Description', value: po.description },
                ]}
              />
              <dl className="mt-6 space-y-2 border-t border-border-subtle pt-4 text-body-s">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Agreed amount</dt>
                  <dd>
                    <Money amount={po.amount} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">VAT {Math.round(po.vatRate * 100)}%</dt>
                  <dd>
                    <Money amount={po.total - po.amount} />
                  </dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Total</dt>
                  <dd>
                    <Money amount={po.total} />
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <MatchCard po={po} />
        </div>
      </div>

      {cancelOpen ? (
        <Dialog
          open
          onClose={() => setCancelOpen(false)}
          title={`Cancel ${po.number}?`}
          description="The vendor assignment is removed from the job. Billed POs cannot be cancelled."
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelOpen(false)}>
                Keep PO
              </Button>
              <Button
                variant="danger"
                busy={action.isPending}
                onClick={() => {
                  if (reason.trim().length < 5) {
                    setReasonError('Give a reason of at least 5 characters');
                    return;
                  }
                  action.mutate(
                    { id: po.id, kind: 'cancel', reason: reason.trim() },
                    {
                      onSuccess: () => {
                        setCancelOpen(false);
                        toast({ title: `${po.number} cancelled` });
                      },
                      onError,
                    },
                  );
                }}
              >
                Cancel PO
              </Button>
            </>
          }
        >
          <TextareaField
            label="Reason"
            required
            value={reason}
            error={reasonError}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(undefined);
            }}
            placeholder="e.g. Vendor not available on the requested date"
          />
        </Dialog>
      ) : null}
    </div>
  );
}

function MatchRow({
  label,
  ok,
  children,
  notRequired = false,
}: {
  label: string;
  ok: boolean | null;
  children: React.ReactNode;
  notRequired?: boolean;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-body-s font-medium">{label}</p>
        <div className="text-caption text-fg-muted">{children}</div>
      </div>
      {notRequired ? (
        <Badge tone="neutral">Not required</Badge>
      ) : ok === null ? (
        <Badge tone="neutral">Pending</Badge>
      ) : ok ? (
        <Badge tone="success">Match</Badge>
      ) : (
        <Badge tone="danger">Mismatch</Badge>
      )}
    </li>
  );
}

/** 3-way match: PO (agreed) vs proof of work (GRN / POD) vs vendor invoice. */
function MatchCard({ po }: { po: PurchaseOrderDetail }) {
  const { match } = po;
  const Icon =
    match.overall === 'Match' ? CheckCircle2 : match.overall === 'Mismatch' ? AlertTriangle : Clock3;
  return (
    <Card>
      <CardHeader title="3-way match" description="PO vs proof of work vs vendor invoice" />
      <CardBody>
        <p
          role="status"
          className={clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2.5 text-body-s font-medium',
            match.overall === 'Match' && 'bg-success-subtle text-success',
            match.overall === 'Mismatch' && 'bg-danger-subtle text-danger',
            match.overall === 'Awaiting invoice' && 'bg-surface-muted text-fg-secondary',
          )}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {match.overall === 'Awaiting invoice' ? 'Awaiting the vendor invoice' : match.overall}
        </p>
        <ul className="mt-2 divide-y divide-border-subtle">
          <MatchRow label="1. Purchase order" ok>
            <Money amount={po.amount} /> agreed (excl. VAT)
          </MatchRow>
          <MatchRow label="2. Proof of work" ok={match.proofOk} notRequired={po.proof.length === 0}>
            {po.proof.length === 0 ? (
              'No GRN / POD required on this job'
            ) : (
              <ul className="mt-1 space-y-1">
                {po.proof.map((p) => (
                  <li key={p.label} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {p.kind}: {p.label}
                    </span>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </MatchRow>
          <MatchRow label="3. Vendor invoice" ok={match.amountOk}>
            {po.bill ? (
              <span>
                <Link to="/vendor-bills/$id" params={{ id: po.bill.id }} className="hover:underline">
                  <DocRef>{po.bill.number}</DocRef>
                </Link>{' '}
                · <Money amount={po.bill.amount} /> excl. VAT
                {match.amountOk === false ? (
                  <span className="block font-medium text-danger">
                    Differs from PO by <Money amount={po.bill.amount - po.amount} />
                  </span>
                ) : null}
              </span>
            ) : (
              'Not recorded yet'
            )}
          </MatchRow>
        </ul>
      </CardBody>
    </Card>
  );
}
