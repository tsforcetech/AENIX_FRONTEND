import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  Plus,
  Receipt,
  Warehouse,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField } from '@/shared/ui/Field';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { jobKindLabel } from '@/domain/workflow';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { MilestoneTimeline } from '@/shared/ui/Timeline';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import {
  canComplete,
  docFlags,
  useCompleteWorkOrder,
  useCreateJobInvoice,
  useWorkOrder,
  useWorkOrderAction,
  type WorkOrderDetail,
} from './api';
import { CustomerRequestsCard, InboundCard, PurchaseInvoicesCard } from './JobDocuments';
import { AssignVendorDialog } from './AssignVendorDialog';
import { SourceBadge } from './SourceBadge';

const route = getRouteApi('/_app/work-orders/$id');

export function WorkOrderDetailPage() {
  const { id } = route.useParams();
  const { data: wo, isLoading, error } = useWorkOrder(id);
  const action = useWorkOrderAction();
  const createInvoice = useCreateJobInvoice();
  const toast = useToast();
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [assignOpen, setAssignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const complete = useCompleteWorkOrder();

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Work order not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !wo) return <StatusMessage kind="loading" title="Loading work order…" />;

  const running = ['Confirmed', 'In progress', 'In transit'].includes(wo.status);
  const canInvoice = (wo.status === 'Delivered' || wo.status === 'Completed') && !wo.invoiceId;
  const onError = (e: unknown) =>
    toast({ title: 'Action not allowed', body: e instanceof Error ? e.message : 'Please try again.' });

  const doCancel = () => {
    if (reason.trim().length < 5) {
      setReasonError('Give a reason of at least 5 characters');
      return;
    }
    action.mutate(
      { id: wo.id, kind: 'cancel', reason: reason.trim() },
      {
        onSuccess: () => {
          setCancelOpen(false);
          toast({ title: `${wo.number} cancelled` });
        },
        onError,
      },
    );
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Work orders', to: '/work-orders' }, { label: wo.number }]}
        title={wo.number}
        meta={
          <div className="flex items-center gap-2">
            <StatusBadge status={wo.status} />
            {wo.priority !== 'Normal' ? (
              <Badge tone={wo.priority === 'Urgent' ? 'danger' : 'warning'}>{wo.priority}</Badge>
            ) : null}
          </div>
        }
        description={`${wo.customerName} · created ${formatDateTime(wo.createdAt)} by ${wo.owner}`}
        actions={
          <>
            {wo.status === 'Draft' || wo.status === 'Confirmed' ? (
              <Button
                variant="ghost"
                icon={<XCircle aria-hidden="true" />}
                onClick={() => setCancelOpen(true)}
              >
                Cancel job
              </Button>
            ) : null}
            {wo.status === 'Draft' ? (
              <Button
                icon={<CheckCircle2 aria-hidden="true" />}
                busy={action.isPending}
                onClick={() =>
                  action.mutate(
                    { id: wo.id, kind: 'confirm' },
                    { onSuccess: () => toast({ title: `${wo.number} confirmed` }), onError },
                  )
                }
              >
                Confirm job
              </Button>
            ) : null}
            {canComplete(wo) ? (
              <Button
                variant="secondary"
                icon={<CheckCircle2 aria-hidden="true" />}
                busy={complete.isPending}
                onClick={() => setCompleteOpen(true)}
              >
                Mark completed
              </Button>
            ) : null}
            {canInvoice ? (
              <Button
                variant="brand"
                icon={<Receipt aria-hidden="true" />}
                busy={createInvoice.isPending}
                onClick={() =>
                  createInvoice.mutate(wo.id, {
                    onSuccess: (inv) => {
                      toast({ title: `${inv.number} drafted`, body: 'Review and post the invoice.' });
                      void navigate({ to: '/invoices/$id', params: { id: inv.id } });
                    },
                    onError,
                  })
                }
              >
                Create invoice
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <JobHero wo={wo} />

          <Card>
            <CardHeader
              title="Vendor assignments"
              description="Subcontracted services and agreed costs"
              actions={
                wo.status !== 'Cancelled' && wo.status !== 'Completed' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus aria-hidden="true" />}
                    onClick={() => setAssignOpen(true)}
                  >
                    Assign vendor
                  </Button>
                ) : null
              }
            />
            <CardBody>
              {wo.assignments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-body-s text-fg-muted">
                  No vendor assigned yet. Assign a transporter, line or broker for each subcontracted service.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {wo.assignments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{a.vendorName}</p>
                        <p className="text-caption text-fg-muted">{a.serviceName}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Money amount={a.agreedCost} className="font-medium" />
                        <StatusBadge status={a.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {wo.serviceCategory === 'Warehouse' || wo.hasWarehouse || wo.packingList ? (
            <InboundCard wo={wo} />
          ) : null}

          <CustomerRequestsCard wo={wo} />

          <Card>
            <CardHeader title="Price lines" description="Customer charges for this job (AED, excl. VAT)" />
            <CardBody className="overflow-x-auto pt-3">
              <table className="w-full min-w-[560px] text-left text-body-s">
                <caption className="sr-only">Price lines</caption>
                <thead>
                  <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="py-2 font-medium">
                      Description
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Qty
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Unit price
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {wo.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2.5">{l.description}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatNumber(l.quantity)}{' '}
                        <span className="text-caption text-fg-muted">{l.unit}</span>
                      </td>
                      <td className="py-2.5 text-right">
                        <Money amount={l.unitPrice} />
                      </td>
                      <td className="py-2.5 text-right font-medium">
                        <Money amount={l.quantity * l.unitPrice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                wo.serviceCategory === 'Transport'
                  ? 'Cargo'
                  : wo.serviceCategory === 'Warehouse'
                    ? 'Goods'
                    : 'Scope'
              }
            />
            <CardBody>
              <DescriptionList
                columns={3}
                items={
                  wo.serviceCategory === 'Service'
                    ? [
                        { label: 'Scope of service', value: wo.cargo.description },
                        { label: 'Location', value: wo.origin },
                        { label: 'Type', value: 'Direct service — no transport leg' },
                      ]
                    : [
                        { label: 'Description', value: wo.cargo.description },
                        {
                          label: 'Packages',
                          value: wo.cargo.packages ? formatNumber(wo.cargo.packages) : '—',
                        },
                        { label: 'Equipment', value: wo.cargo.equipment },
                        {
                          label: 'Weight',
                          value: wo.cargo.weightKg ? `${formatNumber(wo.cargo.weightKg)} kg` : '—',
                        },
                        { label: 'Volume', value: wo.cargo.volumeCbm ? `${wo.cargo.volumeCbm} cbm` : '—' },
                        {
                          label: 'Warehouse handling',
                          value: wo.hasWarehouse ? 'Yes — JAFZA WH-1' : 'No warehouse activity',
                        },
                      ]
                }
              />
            </CardBody>
          </Card>

          {wo.hasWarehouse || wo.movements.length ? <MovementsCard wo={wo} /> : null}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Milestones"
              description={`${wo.progress}% complete`}
              actions={
                running ? (
                  <Button
                    size="sm"
                    busy={action.isPending}
                    onClick={() =>
                      action.mutate(
                        { id: wo.id, kind: 'advance' },
                        {
                          onSuccess: (w) =>
                            toast({
                              title: 'Milestone completed',
                              body: `${w.number} is now ${w.status.toLowerCase()}.`,
                            }),
                          onError,
                        },
                      )
                    }
                  >
                    Mark next done
                  </Button>
                ) : null
              }
            />
            <CardBody>
              {wo.status === 'Draft' ? (
                <p className="mb-4 rounded-lg bg-warning-subtle px-3 py-2 text-caption text-warning">
                  Confirm the job to start tracking milestones.
                </p>
              ) : null}
              {wo.status === 'Cancelled' ? (
                <p className="mb-4 rounded-lg bg-surface-muted px-3 py-2 text-caption text-fg-muted">
                  This job was cancelled.
                </p>
              ) : null}
              <MilestoneTimeline milestones={wo.milestones} />
            </CardBody>
          </Card>

          <FinancialsCard wo={wo} />

          <PurchaseInvoicesCard wo={wo} />

          <Card>
            <CardHeader title="Billing" />
            <CardBody>
              {wo.invoiceId ? (
                <Link
                  to="/invoices/$id"
                  params={{ id: wo.invoiceId }}
                  className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5 hover:bg-canvas"
                >
                  <span className="flex items-center gap-2">
                    <FileText aria-hidden="true" className="size-4 text-fg-muted" />
                    <DocRef>{wo.invoiceNumber ?? 'Invoice'}</DocRef>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 text-fg-muted" />
                </Link>
              ) : (
                <p className="text-body-s text-fg-muted">
                  {canInvoice
                    ? 'Ready to invoice.'
                    : 'The customer invoice is created once the job is delivered or completed.'}
                </p>
              )}
              <Link
                to="/vendor-bills"
                className="mt-3 inline-block text-caption font-medium text-brand hover:underline"
              >
                View all purchase invoices
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Dialogs mount only while open so their shared title id is unique on the page. */}
      {cancelOpen ? (
        <Dialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title={`Cancel ${wo.number}?`}
          description="Cancelled jobs stay on record for audit. This cannot be undone in the prototype."
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelOpen(false)}>
                Keep job
              </Button>
              <Button variant="danger" busy={action.isPending} onClick={doCancel}>
                Cancel job
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
            placeholder="e.g. Customer postponed the shipment"
          />
        </Dialog>
      ) : null}

      {assignOpen ? <AssignVendorDialog open onClose={() => setAssignOpen(false)} wo={wo} /> : null}

      {completeOpen ? (
        <CompleteDialog
          wo={wo}
          busy={complete.isPending}
          onClose={() => setCompleteOpen(false)}
          onConfirm={() =>
            complete.mutate(wo.id, {
              onSuccess: ({ drafted }) => {
                setCompleteOpen(false);
                toast({
                  title: `${wo.number} completed`,
                  body: drafted.length
                    ? `${drafted.length} purchase invoice${drafted.length === 1 ? '' : 's'} drafted: ${drafted.map((d) => d.number).join(', ')}`
                    : 'No new purchase invoice was needed.',
                });
              },
              onError,
            })
          }
        />
      ) : null}
    </div>
  );
}

function CompleteDialog({
  wo,
  busy,
  onClose,
  onConfirm,
}: {
  wo: WorkOrderDetail;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const flags = docFlags(wo);
  const billed = new Set(wo.purchaseInvoices.map((b) => b.vendorName));
  const toBill = [...new Set(wo.assignments.map((a) => a.vendorName))].filter((v) => !billed.has(v));
  const warnings = [
    flags.grnVariance ? 'The GRN does not match the product list (variance unresolved).' : null,
    flags.awaitingGrn ? 'The PL was sent but no GRN has been uploaded.' : null,
    flags.awaitingPod ? `${flags.awaitingPod} customer request(s) have no POD yet.` : null,
    flags.podVariance ? `${flags.podVariance} POD(s) do not match the request.` : null,
  ].filter((w): w is string => !!w);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Complete ${wo.number}?`}
      description="Completing the job drafts a purchase invoice for each vendor that has not been billed yet."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not yet
          </Button>
          <Button busy={busy} icon={<CheckCircle2 aria-hidden="true" />} onClick={onConfirm}>
            {warnings.length ? 'Complete anyway' : 'Complete job'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-body-s">
        {warnings.length ? (
          <div role="alert" className="rounded-lg bg-warning-subtle p-3 text-warning">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle aria-hidden="true" className="size-4" /> Open document issues
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-lg bg-success-subtle p-3 text-success">
            <CheckCircle2 aria-hidden="true" className="size-4" /> All documents are reconciled.
          </p>
        )}
        <div>
          <p className="font-medium">Purchase invoices to draft</p>
          {toBill.length ? (
            <ul className="mt-1 list-disc pl-6 text-fg-secondary">
              {toBill.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-fg-muted">
              None — every assigned vendor is already billed or none is assigned.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function JobHero({ wo }: { wo: WorkOrderDetail }) {
  const isTransport = wo.serviceCategory === 'Transport';
  return (
    <Card className="overflow-hidden">
      <div className="bg-surface-inverse p-5 text-fg-inverse">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-caption text-white/70">
            <JobKindIcon category={wo.serviceCategory} mode={wo.mode} className="size-4" />
            {jobKindLabel(wo.serviceCategory, wo.mode)}
            <span aria-hidden="true">·</span>
            <SourceBadge type={wo.source.type} refLabel={wo.sourceRef} />
          </div>
          <p className="text-caption text-white/70">
            {isTransport ? 'ETA' : 'Target'}{' '}
            <span className="font-semibold text-white">{formatDate(wo.eta)}</span>
          </p>
        </div>
        {isTransport ? (
          <div className="mt-5 flex items-center gap-4">
            <div className="min-w-0">
              <p className="text-caption text-white/60">From</p>
              <p className="truncate text-[22px] font-semibold tracking-tight">{wo.origin}</p>
            </div>
            <div aria-hidden="true" className="relative h-px flex-1 border-t-2 border-dashed border-white/25">
              <span
                className="absolute -top-[5px] h-2 rounded-full bg-[#ef5a4f]"
                style={{ width: 8, left: `calc(${Math.min(wo.progress, 97)}% - 4px)` }}
              />
            </div>
            <div className="min-w-0 text-right">
              <p className="text-caption text-white/60">To</p>
              <p className="truncate text-[22px] font-semibold tracking-tight">{wo.destination}</p>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
              <MapPin aria-hidden="true" className="size-5 text-[#ef5a4f]" />
            </span>
            <div className="min-w-0">
              <p className="text-caption text-white/60">
                {wo.serviceCategory === 'Warehouse' ? 'Warehouse / site' : 'Service location'}
              </p>
              <p className="truncate text-[22px] font-semibold tracking-tight">{wo.origin}</p>
              {wo.destination ? (
                <p className="truncate text-caption text-white/70">Deliveries to {wo.destination}</p>
              ) : null}
            </div>
          </div>
        )}
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#ef5a4f]" style={{ width: `${wo.progress}%` }} />
        </div>
        <p className="mt-2 text-caption text-white/70">
          Now: <span className="font-medium text-white">{wo.currentMilestone}</span>
        </p>
      </div>
      <CardBody>
        <DescriptionList
          columns={3}
          items={[
            {
              label: 'Customer',
              value: (
                <Link
                  to="/customers/$id"
                  params={{ id: wo.customerId }}
                  className="font-medium hover:text-brand hover:underline"
                >
                  {wo.customerName}
                </Link>
              ),
            },
            {
              label: 'Source',
              value:
                wo.source.type === 'Sales order' && wo.source.refId ? (
                  <Link
                    to="/sales-orders/$id"
                    params={{ id: wo.source.refId }}
                    className="font-mono font-medium text-brand hover:underline"
                  >
                    {wo.sourceRef ?? 'Sales order'}
                  </Link>
                ) : wo.source.type === 'Quotation' && wo.source.refId ? (
                  <Link
                    to="/quotations/$id"
                    params={{ id: wo.source.refId }}
                    className="font-mono font-medium text-brand hover:underline"
                  >
                    {wo.sourceRef}
                  </Link>
                ) : wo.source.type === 'Contract' && wo.source.refId ? (
                  <Link
                    to="/contracts/$id"
                    params={{ id: wo.source.refId }}
                    className="font-mono font-medium text-brand hover:underline"
                  >
                    {wo.sourceRef}
                  </Link>
                ) : (
                  'Direct — authorised rate rules'
                ),
            },
            { label: 'Owner', value: wo.owner },
          ]}
        />
      </CardBody>
    </Card>
  );
}

function FinancialsCard({ wo }: { wo: WorkOrderDetail }) {
  const margin = wo.revenue - wo.cost;
  return (
    <Card>
      <CardHeader title="Job financials" description="AED, excluding VAT" />
      <CardBody>
        <dl className="space-y-2.5 text-body-s">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Revenue</dt>
            <dd className="font-medium">
              <Money amount={wo.revenue} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">
              {wo.vendorAssignments.length ? 'Vendor cost (agreed)' : 'Cost (estimated)'}
            </dt>
            <dd>
              <Money amount={wo.cost} />
            </dd>
          </div>
          <div className="flex justify-between border-t border-border-subtle pt-2.5">
            <dt className="font-semibold">Margin</dt>
            <dd className={clsx('font-semibold', wo.marginPct < 15 ? 'text-warning' : 'text-success')}>
              <Money amount={margin} />
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <div className="flex justify-between text-caption text-fg-muted">
            <span>Margin</span>
            <span className="font-medium tabular-nums text-fg">{wo.marginPct}%</span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
            role="meter"
            aria-valuenow={wo.marginPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Margin percentage"
          >
            <div
              className={clsx('h-full rounded-full', wo.marginPct < 15 ? 'bg-warning' : 'bg-success')}
              style={{ width: `${Math.max(0, Math.min(100, wo.marginPct))}%` }}
            />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function MovementsCard({ wo }: { wo: WorkOrderDetail }) {
  return (
    <Card>
      <CardHeader
        title="Warehouse movements"
        description="Receipts and dispatches linked to this job"
        actions={
          <Link to="/warehouse" className="text-body-s font-medium text-brand hover:underline">
            Open warehouse
          </Link>
        }
      />
      <CardBody>
        {wo.movements.length === 0 ? (
          <p className="flex items-center gap-2 text-body-s text-fg-muted">
            <Warehouse aria-hidden="true" className="size-4" /> No warehouse movement recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {wo.movements.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div>
                  <DocRef>{m.number}</DocRef>
                  <p className="text-caption text-fg-muted">
                    {formatDate(m.date)} · {m.reference}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={m.type} />
                  <StatusBadge status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
