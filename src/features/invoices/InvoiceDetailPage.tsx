import { useProtoDb } from '@/prototype/store';
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

/** Tax invoice in the owner's AEN078 layout (logo + company block, customer block, per-line VAT, bank details). */
function TaxInvoiceDocument({ inv }: { inv: InvoiceDetail }) {
  const company = useProtoDb((db) => db.company);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = inv.lines.map((l) => {
    const sub = r2(l.quantity * l.unitPrice);
    const vat = r2(sub * l.vatRate);
    return { ...l, sub, vat, total: r2(sub + vat) };
  });
  const sum = (k: 'sub' | 'vat' | 'total') => r2(rows.reduce((s, x) => s + x[k], 0));
  const money = (n: number) => formatNumber(n, 2);
  const th = 'border border-fg/70 px-2 py-1.5 text-left font-semibold';
  const td = 'border border-fg/70 px-2 py-1.5';
  return (
    <Card className="overflow-hidden">
      <article
        aria-label={`Tax invoice ${inv.number}`}
        className="bg-white px-6 pb-8 pt-4 text-[13px] text-[#1a1a1a] sm:px-10"
      >
        <p className="text-right text-caption">{company.website}</p>
        <div aria-hidden="true" className="mt-2 h-2 bg-[#9a2119]" />
        <header className="flex flex-wrap items-start justify-between gap-6 pt-6">
          <div>
            <Logo height={44} />
            <p className="mt-1 text-[10px] font-semibold">{company.tagline}</p>
          </div>
          <div className="max-w-xs text-[11px] leading-[1.35]">
            <p className="text-[13px] font-semibold text-[#9a2119]">{company.legalName}</p>
            {company.officeAddress.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>
              Tel: {company.phone} &nbsp; Email: {company.email}
            </p>
            <p className="mt-1 text-[#9a2119]">TRN: {company.trn}</p>
          </div>
        </header>
        <h2 className="mt-8 border-b border-fg/60 pb-2 text-center text-[14px] font-semibold text-[#9a2119]">
          Tax Invoice
        </h2>

        <section
          aria-label="Customer and invoice details"
          className="flex flex-wrap justify-between gap-6 border-b border-fg/20 py-6"
        >
          <div className="text-[12px] leading-[1.45]">
            <Link
              to="/customers/$id"
              params={{ id: inv.customer.id }}
              className="font-semibold hover:underline"
            >
              {inv.customer.name}
            </Link>
            <p>Attn: {inv.customer.contactName}</p>
            <p className="mt-1">
              M: {inv.customer.contactPhone} &nbsp; E: {inv.customer.contactEmail}
            </p>
            <p>{inv.customer.postalAddress ?? `${inv.customer.city}, ${inv.customer.country}`}</p>
            <p>TRN: {inv.customer.trnMasked}</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 self-start text-[12px]">
            <dt>Invoice:</dt>
            <dd className="font-medium">{inv.number}</dd>
            <dt>Invoice Date:</dt>
            <dd>{formatDate(inv.issueDate)}</dd>
            <dt>Due Date:</dt>
            <dd>{formatDate(inv.dueDate)}</dd>
            {inv.salesOrders.length ? (
              <>
                <dt>Sales order:</dt>
                <dd className="flex flex-wrap gap-x-2">
                  {inv.salesOrders.map((so) => (
                    <Link
                      key={so.id}
                      to="/sales-orders/$id"
                      params={{ id: so.id }}
                      className="text-[#9a2119] underline"
                    >
                      {so.number}
                    </Link>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <div className="mt-6 overflow-x-auto" role="region" aria-label="Invoice lines" tabIndex={0}>
          <table className="w-full min-w-[680px] border-collapse text-[12px]">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Description
                </th>
                <th scope="col" className={th}>
                  Cur
                </th>
                <th scope="col" className={th}>
                  UOM
                </th>
                <th scope="col" className={`${th} text-center`}>
                  Quantity
                </th>
                <th scope="col" className={`${th} text-center`}>
                  Unit Price
                </th>
                <th scope="col" className={`${th} text-center`}>
                  Sub Total
                </th>
                <th scope="col" className={`${th} text-center`}>
                  VAT
                </th>
                <th scope="col" className={`${th} text-center`}>
                  Total Amount (Including VAT)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className={td}>{l.description}</td>
                  <td className={td}>AED</td>
                  <td className={td}>{l.uom ?? '—'}</td>
                  <td className={`${td} text-center tabular-nums`}>{formatNumber(l.quantity)}</td>
                  <td className={`${td} text-center tabular-nums`}>{money(l.unitPrice)}</td>
                  <td className={`${td} text-center tabular-nums`}>{money(l.sub)}</td>
                  <td className={`${td} text-center tabular-nums`}>{money(l.vat)}</td>
                  <td className={`${td} text-center tabular-nums`}>{money(l.total)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${td} text-right`} colSpan={5}>
                  Total Amount Payable AED
                </td>
                <td className={`${td} text-center font-medium tabular-nums`}>{money(sum('sub'))}</td>
                <td className={`${td} text-center font-medium tabular-nums`}>{money(sum('vat'))}</td>
                <td className={`${td} text-center font-semibold tabular-nums`}>{money(sum('total'))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {inv.paid > 0 ? (
          <p className="mt-2 text-right text-[12px]">
            Amount received: <span className="tabular-nums">AED {money(inv.paid)}</span> · Balance due:{' '}
            <strong className="tabular-nums">AED {money(r2(sum('total') - inv.paid))}</strong>
          </p>
        ) : null}

        <section aria-label="Bank details" className="mt-10 max-w-md border-t border-fg/20 pt-6">
          <p className="mb-1 text-center text-[12px] font-semibold">Bank Details:</p>
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {[
                ['Bank Name:', company.bank.bankName],
                ['Account Name:', company.bank.accountName],
                ['Account Number:', company.bank.accountNumber],
                ['IBAN Number:', company.bank.iban],
                ['Swift Code:', company.bank.swift],
              ].map(([k, v]) => (
                <tr key={k}>
                  <th scope="row" className="w-36 border border-fg/70 px-2 py-1 text-left font-normal">
                    {k}
                  </th>
                  <td className="border border-fg/70 px-2 py-1 text-center">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="mt-12 flex flex-wrap justify-between gap-2 text-[11px] text-fg-secondary">
          <span>© 2026 {company.legalName}. All rights reserved.</span>
          <span>This is a system-generated document and does not require a signature.</span>
        </footer>
        <p className="mt-4 rounded bg-surface-muted px-3 py-2 text-caption text-fg-muted">
          Prototype — sample data. The official PDF, company stamp and numbering are produced by the AENIX
          backend.
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
