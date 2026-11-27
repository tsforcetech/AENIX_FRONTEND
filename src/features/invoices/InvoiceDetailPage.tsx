import { protoDb } from '@/prototype/store';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Download, FileMinus2, Lock, Send, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField } from '@/shared/ui/Field';
import { Logo } from '@/shared/ui/Logo';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatNumber } from '@/shared/utils/format';
import {
  OPEN_STATUSES,
  useCreditNote,
  useDeleteDraftInvoice,
  useInvoice,
  usePostInvoice,
  type InvoiceDetail,
} from './api';

const route = getRouteApi('/_app/invoices/$id');

export function InvoiceDetailPage() {
  const { id } = route.useParams();
  const { data: inv, isLoading, error } = useInvoice(id);

  if (error)
    return (
      <StatusMessage
        kind="error"
        title="Invoice not found"
        description="It may have been removed or you may not have access."
      />
    );
  if (isLoading || !inv) return <StatusMessage kind="loading" title="Loading invoice…" />;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Invoices', to: '/invoices' }, { label: inv.number }]}
        title={inv.number}
        meta={<StatusBadge status={inv.status} />}
        description={`${inv.customerName} · ${inv.salesOrders.length ? `sales order${inv.salesOrders.length > 1 ? 's' : ''} ${inv.salesOrders.map((x) => x.number).join(', ')}` : inv.sourceType === 'Storage' ? `storage run ${inv.sourceLabel}` : inv.sourceType === 'Job' ? `job ${inv.sourceLabel}` : 'manual invoice'}`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <TaxInvoiceDocument inv={inv} />
        <InvoiceSidePanel inv={inv} />
      </div>
    </div>
  );
}

function TaxInvoiceDocument({ inv }: { inv: InvoiceDetail }) {
  return (
    <Card className="overflow-hidden">
      <article aria-label={`Tax invoice ${inv.number}`} className="p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border-subtle pb-6">
          <div>
            <Logo height={40} />
            <p className="mt-3 text-caption leading-5 text-fg-muted">
              AENIX Logistics LLC (prototype)
              <br />
              Dubai, United Arab Emirates
              <br />
              TRN 1000•••••••001
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-caption font-medium uppercase tracking-[0.18em] text-brand">
              Tax invoice
            </p>
            <p className="mt-1 text-[24px] font-semibold tracking-tight">{inv.number}</p>
            <dl className="mt-3 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-1 text-caption">
              <dt className="text-fg-muted">Issue date</dt>
              <dd className="tabular-nums">
                {inv.status === 'Draft' ? 'On posting' : formatDate(inv.issueDate)}
              </dd>
              <dt className="text-fg-muted">Due date</dt>
              <dd className="tabular-nums">{formatDate(inv.dueDate)}</dd>
              <dt className="text-fg-muted">Reference</dt>
              <dd className="font-mono">{inv.sourceLabel}</dd>
            </dl>
          </div>
        </header>

        <section aria-label="Bill to" className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="text-caption font-medium uppercase tracking-wide text-fg-muted">Bill to</p>
            <Link
              to="/customers/$id"
              params={{ id: inv.customer.id }}
              className="mt-1 block font-semibold hover:text-brand hover:underline"
            >
              {inv.customer.name}
            </Link>
            <p className="text-body-s text-fg-secondary">
              {inv.customer.city}, {inv.customer.country}
            </p>
            <p className="text-body-s text-fg-secondary">Attn: {inv.customer.contactName}</p>
            <p className="mt-1 text-caption text-fg-muted">
              TRN <span className="font-mono">{inv.customer.trnMasked}</span> · {inv.customer.code}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-caption font-medium uppercase tracking-wide text-fg-muted">Payment terms</p>
            <p className="mt-1 text-body-s">{inv.customer.paymentTermsDays} days net</p>
            {inv.salesOrders.length ? (
              <div className="mt-1 flex flex-wrap gap-x-3 sm:justify-end">
                <span className="sr-only">Billed sales orders:</span>
                {inv.salesOrders.map((so) => (
                  <Link
                    key={so.id}
                    to="/sales-orders/$id"
                    params={{ id: so.id }}
                    className="text-body-s font-medium text-brand hover:underline"
                  >
                    Sales order {so.number}
                  </Link>
                ))}
              </div>
            ) : null}
            {inv.workOrderId ? (
              <Link
                to="/work-orders/$id"
                params={{ id: inv.workOrderId }}
                className="mt-1 inline-block text-body-s font-medium text-brand hover:underline"
              >
                View job {protoJobNumber(inv.workOrderId)}
              </Link>
            ) : null}
            {inv.sourceType === 'Storage' ? (
              <Link
                to="/storage-billing"
                className="mt-1 inline-block text-body-s font-medium text-brand hover:underline"
              >
                View storage billing
              </Link>
            ) : null}
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="w-full text-body-s">
            <caption className="sr-only">Invoice lines</caption>
            <thead>
              <tr className="border-y border-border-subtle bg-canvas/60 text-caption uppercase tracking-wide text-fg-muted">
                {inv.salesOrders.length > 1 ? (
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Sales order
                  </th>
                ) : null}
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Description
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Unit price
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  VAT
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="border-b border-border-subtle">
                  {inv.salesOrders.length > 1 ? (
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-[13px]">
                      {inv.salesOrders.find((x) => x.id === l.salesOrderId)?.number ?? '—'}
                    </td>
                  ) : null}
                  <td className="px-3 py-3">{l.description}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatNumber(l.quantity)}</td>
                  <td className="px-3 py-3 text-right">
                    <Money amount={l.unitPrice} className="whitespace-nowrap" />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-fg-muted">
                    {Math.round(l.vatRate * 100)}%
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Money amount={l.quantity * l.unitPrice} className="whitespace-nowrap" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-6 w-full max-w-xs space-y-2 text-body-s">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Subtotal</dt>
            <dd>
              <Money amount={inv.subtotal} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">VAT 5%</dt>
            <dd>
              <Money amount={inv.vat} />
            </dd>
          </div>
          <div className="flex justify-between border-t border-border-subtle pt-2 text-[15px] font-semibold">
            <dt>Total (AED)</dt>
            <dd>
              <Money amount={inv.total} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">Amount paid</dt>
            <dd>
              <Money amount={inv.paid ? -inv.paid : 0} muted />
            </dd>
          </div>
          <div className="flex justify-between rounded-lg bg-surface-inverse px-3 py-2 font-semibold text-fg-inverse">
            <dt>Balance due</dt>
            <dd>
              <Money amount={inv.status === 'Cancelled' ? 0 : inv.outstanding} />
            </dd>
          </div>
        </dl>

        <p className="mt-8 border-t border-border-subtle pt-4 text-caption text-fg-muted">
          Prototype document — sample data. Final tax-invoice layout, numbering and PDF are produced by the
          AENIX backend.
        </p>
      </article>
    </Card>
  );
}

function InvoiceSidePanel({ inv }: { inv: InvoiceDetail }) {
  const toast = useToast();
  const navigate = useNavigate();
  const post = usePostInvoice();
  const del = useDeleteDraftInvoice();
  const credit = useCreditNote();
  const [creditOpen, setCreditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const isOpen = OPEN_STATUSES.includes(inv.status);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Actions" />
        <CardBody className="space-y-3">
          {inv.status === 'Draft' ? (
            <>
              <p className="text-body-s text-fg-muted">
                Posting issues the invoice, records AR, revenue and VAT, and locks it for editing.
              </p>
              <Button
                className="w-full"
                icon={<Send aria-hidden="true" />}
                busy={post.isPending}
                onClick={() =>
                  post.mutate(inv.id, {
                    onSuccess: () =>
                      toast({
                        title: `${inv.number} posted`,
                        body: 'Journal created · invoice is now read-only',
                      }),
                  })
                }
              >
                Post invoice
              </Button>
              <Button
                variant="danger"
                className="w-full"
                icon={<Trash2 aria-hidden="true" />}
                onClick={() => setDeleteOpen(true)}
              >
                Delete draft
              </Button>
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-lg bg-canvas p-3 text-caption text-fg-secondary">
              <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Posted invoices are read-only. Corrections are made with a credit note.
            </p>
          )}
          {isOpen ? (
            <>
              <ButtonLink
                to="/collections/new"
                search={{ invoiceId: inv.id }}
                className="w-full"
                icon={<Wallet aria-hidden="true" />}
              >
                Record collection
              </ButtonLink>
              <Button
                variant="secondary"
                className="w-full"
                icon={<FileMinus2 aria-hidden="true" />}
                onClick={() => setCreditOpen(true)}
              >
                Issue credit note
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            className="w-full"
            icon={<Download aria-hidden="true" />}
            onClick={() =>
              toast({ title: 'PDF is generated server-side', body: 'Not available in the prototype.' })
            }
          >
            Download PDF
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Payment history"
          description={inv.payments.length ? `${inv.payments.length} allocation(s)` : undefined}
        />
        <CardBody>
          {inv.payments.length === 0 ? (
            <p className="text-body-s text-fg-muted">No payments allocated yet.</p>
          ) : (
            <ul className="space-y-3">
              {inv.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 text-body-s">
                  <div>
                    <DocRef>{p.number}</DocRef>
                    <p className="text-caption text-fg-muted">
                      {formatDate(p.date)} · {p.method}
                    </p>
                  </div>
                  <Money amount={p.amount} className="font-medium" />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={creditOpen}
        onClose={() => setCreditOpen(false)}
        title={`Credit note for ${inv.number}`}
        description="Credits the open balance. The original invoice stays unchanged; a reversing journal is posted."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreditOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={credit.isPending}
              onClick={() => {
                if (reason.trim().length < 5) {
                  setReasonError('Give a reason of at least 5 characters');
                  return;
                }
                credit.mutate(
                  { id: inv.id, reason: reason.trim() },
                  {
                    onSuccess: (cn) => {
                      setCreditOpen(false);
                      setReason('');
                      toast({ title: `${cn} issued`, body: `Balance of ${inv.number} credited` });
                    },
                  },
                );
              }}
            >
              Issue credit note
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex justify-between rounded-lg bg-canvas p-3 text-body-s">
            <span className="text-fg-muted">Amount to credit (incl. VAT)</span>
            <Money amount={inv.outstanding} className="font-semibold" />
          </div>
          <TextareaField
            label="Reason"
            required
            value={reason}
            error={reasonError}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(undefined);
            }}
            placeholder="e.g. Rate dispute agreed with customer"
          />
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete draft ${inv.number}?`}
        description="Drafts were never issued, so they can be removed. This cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Keep draft
            </Button>
            <Button
              variant="danger"
              busy={del.isPending}
              onClick={() =>
                del.mutate(inv.id, {
                  onSuccess: () => {
                    toast({ title: `${inv.number} deleted` });
                    void navigate({ to: '/invoices' });
                  },
                })
              }
            >
              Delete draft
            </Button>
          </>
        }
      >
        <p className="text-body-s text-fg-secondary">
          Total <Money amount={inv.total} className="font-medium" /> for {inv.customerName}.
        </p>
      </Dialog>
    </div>
  );
}

function protoJobNumber(id: string): string {
  return protoDb.get().workOrders.find((w) => w.id === id)?.number ?? id;
}
