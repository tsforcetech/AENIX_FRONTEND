import { getRouteApi, Link } from '@tanstack/react-router';
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
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DescriptionList } from '@/shared/ui/DescriptionList';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField } from '@/shared/ui/Field';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { servicesLabel } from '@/domain/workflow';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import {
  canComplete,
  docFlags,
  useCompleteWorkOrder,
  useWorkOrder,
  useWorkOrderAction,
  type WorkOrderDetail,
} from './api';
import { CustomerRequestsCard, InboundCard, JobStockCard, PurchasingCard } from './JobDocuments';
import { AssignVendorDialog } from './AssignVendorDialog';
import { SourceBadge } from './SourceBadge';
import { ChargesCard } from './ChargesCard';
import { CompletionNotesCard, InternalCostsCard, ProfitCard } from './CostsCards';
import { DocumentChecklistCard } from './DocumentChecklistCard';
import { MilestonesCard } from './MilestonesCard';
import { OwnVehicleCard } from './OwnVehicleCard';
import { StopsCard } from './StopsCard';
import { useJobExtras } from './transport-api';

const route = getRouteApi('/_app/work-orders/$id');

export function WorkOrderDetailPage() {
  const { id } = route.useParams();
  const { data: wo, isLoading, error } = useWorkOrder(id);
  const action = useWorkOrderAction();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [assignOpen, setAssignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const complete = useCompleteWorkOrder();
  const { data: extras } = useJobExtras(id);

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Job not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !wo) return <StatusMessage kind="loading" title="Loading job…" />;

  const isTransport = wo.serviceCategories.includes('Transport');
  const missingDocs = extras?.missingDocuments ?? [];
  // FLOW-003 C9: any open job can be cancelled with a reason until it is invoiced or completed.
  const canCancel = wo.status !== 'Cancelled' && wo.status !== 'Completed' && !wo.invoiceId;
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
        crumbs={[{ label: 'Jobs', to: '/work-orders' }, { label: wo.number }]}
        title={wo.number}
        meta={
          <div className="flex items-center gap-2">
            <StatusBadge status={wo.status} />
            {wo.priority !== 'Normal' ? (
              <Badge tone={wo.priority === 'Urgent' ? 'danger' : 'warning'}>{wo.priority}</Badge>
            ) : null}
            {missingDocs.length && wo.status !== 'Cancelled' ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-warning-subtle px-2 py-0.5 text-caption font-medium text-warning"
                title={missingDocs.join(', ')}
              >
                <AlertTriangle aria-hidden="true" className="size-3.5" />
                {missingDocs.length} document{missingDocs.length === 1 ? '' : 's'} missing
                <span className="sr-only">: {missingDocs.join(', ')}</span>
              </span>
            ) : null}
          </div>
        }
        description={`${wo.customerName} · created ${formatDateTime(wo.createdAt)} by ${wo.owner}`}
        actions={
          <>
            {canCancel ? (
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
              <ButtonLink
                to="/invoices/new"
                search={{ customerId: wo.customerId, salesOrderId: wo.salesOrderId }}
                variant="brand"
                icon={<Receipt aria-hidden="true" />}
              >
                Invoice customer
              </ButtonLink>
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
              description="Assigning a vendor issues a purchase order before the work starts"
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
                        <p className="text-caption text-fg-muted">
                          {a.serviceName}
                          {a.purchaseOrderId && a.poNumber ? (
                            <>
                              {' · '}
                              <Link
                                to="/purchase-orders/$id"
                                params={{ id: a.purchaseOrderId }}
                                className="font-mono font-medium text-brand hover:underline"
                              >
                                {a.poNumber}
                              </Link>{' '}
                              {a.poStatus ? <span className="text-fg-muted">({a.poStatus})</span> : null}
                            </>
                          ) : null}
                        </p>
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

          {wo.serviceCategories.includes('Warehouse') || wo.hasWarehouse || wo.inbounds.length ? (
            <>
              <JobStockCard wo={wo} />
              <InboundCard wo={wo} />
            </>
          ) : null}

          <CustomerRequestsCard wo={wo} />

          {/* FLOW-003 WP-C: stops, documents, charges with surcharges, completion notes, internal costs */}
          {isTransport ? <StopsCard wo={wo} /> : null}
          {extras ? <DocumentChecklistCard wo={wo} extras={extras} /> : null}
          {extras ? <ChargesCard wo={wo} extras={extras} /> : null}
          {extras ? <CompletionNotesCard wo={wo} extras={extras} /> : null}
          {extras ? <InternalCostsCard wo={wo} extras={extras} /> : null}

          <Card>
            <CardHeader
              title={
                wo.serviceCategories.includes('Transport')
                  ? 'Cargo'
                  : wo.serviceCategories.includes('Warehouse')
                    ? 'Goods'
                    : 'Scope'
              }
            />
            <CardBody>
              <DescriptionList
                columns={3}
                items={
                  wo.serviceCategories.length === 1 && wo.serviceCategory === 'Service'
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
                          label: 'Services',
                          value: servicesLabel(wo.serviceCategories, wo.mode),
                        },
                      ]
                }
              />
            </CardBody>
          </Card>

          {wo.hasWarehouse || wo.movements.length ? <MovementsCard wo={wo} /> : null}
        </div>

        <div className="min-w-0 space-y-6">
          <MilestonesCard wo={wo} />

          {extras ? <ProfitCard extras={extras} /> : null}

          {isTransport && extras ? <OwnVehicleCard wo={wo} extras={extras} /> : null}

          {wo.status === 'Completed' ? <NextStepsCard wo={wo} /> : null}

          <PurchasingCard wo={wo} />

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
                    ? 'Ready to invoice — one invoice can cover several sales orders of this customer.'
                    : 'The customer is invoiced from the sales order once the job is delivered or completed.'}
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
          description="Open vendor purchase orders and planned own-vehicle trips are cancelled too. Cancelled jobs stay on record for audit; this cannot be undone in the prototype."
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
              onSuccess: ({ awaitingInvoice }) => {
                setCompleteOpen(false);
                toast({
                  title: `${wo.number} completed`,
                  body: awaitingInvoice.length
                    ? `${awaitingInvoice.length} PO${awaitingInvoice.length === 1 ? '' : 's'} now awaiting the vendor invoice: ${awaitingInvoice.map((p) => p.number).join(', ')}`
                    : 'All vendor purchase orders are already invoiced.',
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
  const toBill = wo.purchaseOrders.filter((p) => !p.vendorBillId && p.status !== 'Cancelled');
  const warnings = [
    flags.grnVariance
      ? `${flags.grnVariance} inbound GRN${flags.grnVariance === 1 ? '' : 's'} do not match the product list (variance unresolved).`
      : null,
    flags.awaitingGrn
      ? `${flags.awaitingGrn} inbound${flags.awaitingGrn === 1 ? '' : 's'} sent to the warehouse with no GRN uploaded yet.`
      : null,
    flags.awaitingPod ? `${flags.awaitingPod} customer request(s) have no POD yet.` : null,
    flags.podVariance ? `${flags.podVariance} POD(s) do not match the request.` : null,
  ].filter((w): w is string => !!w);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Complete ${wo.number}?`}
      description="Completing the job closes the vendor purchase orders for invoicing. Vendor invoices are then recorded against each PO, and the customer is invoiced."
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
          <p className="font-medium">Purchase orders that will await the vendor invoice</p>
          {toBill.length ? (
            <ul className="mt-1 list-disc pl-6 text-fg-secondary">
              {toBill.map((p) => (
                <li key={p.id}>
                  <span className="font-mono">{p.number}</span> · {p.vendorName} · <Money amount={p.amount} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-fg-muted">
              None — every PO is already invoiced or no vendor is assigned.
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
            {servicesLabel(wo.serviceCategories, wo.mode)}
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
                {wo.serviceCategories.includes('Warehouse') ? 'Warehouse / site' : 'Service location'}
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

/** After completion: record vendor invoices against POs, then invoice the customer. */
function NextStepsCard({ wo }: { wo: WorkOrderDetail }) {
  const awaiting = wo.purchaseOrders.filter((p) => !p.vendorBillId && p.status !== 'Cancelled');
  return (
    <Card className="border-brand/30">
      <CardHeader title="Next steps" description="Job completed — close the money side." />
      <CardBody className="space-y-4 text-body-s">
        <div>
          <p className="font-medium">1. Record vendor invoices</p>
          {awaiting.length ? (
            <ul className="mt-1.5 space-y-1.5">
              {awaiting.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-fg-secondary">
                    <span className="font-mono">{p.number}</span> · {p.vendorName}
                  </span>
                  <Link
                    to="/vendor-bills/new"
                    search={{ purchaseOrderId: p.id }}
                    className="shrink-0 text-caption font-medium text-brand hover:underline"
                  >
                    Record invoice
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-fg-muted">All purchase orders are invoiced.</p>
          )}
        </div>
        <div>
          <p className="font-medium">2. Invoice the customer</p>
          {wo.invoiceId ? (
            <p className="mt-1 text-fg-muted">Invoiced — {wo.invoiceNumber}.</p>
          ) : (
            <ButtonLink
              to="/invoices/new"
              search={{ customerId: wo.customerId, salesOrderId: wo.salesOrderId }}
              size="sm"
              variant="brand"
              className="mt-1.5"
              icon={<Receipt aria-hidden="true" />}
            >
              Invoice customer
            </ButtonLink>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
