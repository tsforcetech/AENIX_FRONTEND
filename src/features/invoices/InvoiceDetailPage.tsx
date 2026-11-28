import { useProtoDb } from '@/prototype/store';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Ban, Clock3, Download, FileMinus2, Lock, Printer, Send, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField, TextField } from '@/shared/ui/Field';
import { Logo } from '@/shared/ui/Logo';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime, formatNumber } from '@/shared/utils/format';
import {
  OPEN_STATUSES,
  useCreditNote,
  useDeleteDraftInvoice,
  useInvoice,
  usePostInvoice,
  useWriteOff,
  type InvoiceDetail,
} from './api';

const route = getRouteApi('/_app/invoices/$id');
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Please try again.');

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
        meta={
          <>
            <StatusBadge status={inv.status} />
            {inv.currencyCode !== 'AED' ? <Badge tone="info">{inv.currencyCode}</Badge> : null}
          </>
        }
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
  const services = rows.filter((l) => !l.isDisbursement);
  const disbursements = rows.filter((l) => l.isDisbursement);
  const sum = (list: typeof rows, k: 'sub' | 'vat' | 'total') => r2(list.reduce((s, x) => s + x[k], 0));
  const money = (n: number) => formatNumber(n, 2);
  const cur = inv.currencyCode;
  const th = 'border border-fg/70 px-2 py-1.5 text-left font-semibold';
  const td = 'border border-fg/70 px-2 py-1.5';
  const lineRow = (l: (typeof rows)[number]) => (
    <tr key={l.id}>
      <td className={td}>
        {l.description}
        {l.isDisbursement ? (
          <span className="block text-[11px] italic">
            Disbursement — at cost · VAT treatment per accountant
          </span>
        ) : null}
      </td>
      <td className={td}>{cur}</td>
      <td className={td}>{l.uom ?? '—'}</td>
      <td className={`${td} text-center tabular-nums`}>{formatNumber(l.quantity)}</td>
      <td className={`${td} text-center tabular-nums`}>{money(l.unitPrice)}</td>
      <td className={`${td} text-center tabular-nums`}>{money(l.sub)}</td>
      <td className={`${td} text-center tabular-nums`}>{money(l.vat)}</td>
      <td className={`${td} text-center tabular-nums`}>{money(l.total)}</td>
    </tr>
  );
  const subtotalRow = (label: string, list: typeof rows, strong = false) => (
    <tr>
      <td className={`${td} text-right`} colSpan={5}>
        {label}
      </td>
      <td className={`${td} text-center font-medium tabular-nums`}>{money(sum(list, 'sub'))}</td>
      <td className={`${td} text-center font-medium tabular-nums`}>{money(sum(list, 'vat'))}</td>
      <td className={`${td} text-center tabular-nums ${strong ? 'font-semibold' : 'font-medium'}`}>
        {money(sum(list, 'total'))}
      </td>
    </tr>
  );
  return (
    <Card className="overflow-hidden" data-print-root="">
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
            {cur !== 'AED' ? (
              <>
                <dt>Currency:</dt>
                <dd>
                  {cur} · 1 {cur} = AED {formatNumber(inv.rate, 4)}
                </dd>
              </>
            ) : null}
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
              {services.map(lineRow)}
              {disbursements.length ? (
                <>
                  {services.length ? subtotalRow(`Services subtotal ${cur}`, services) : null}
                  <tr>
                    <th scope="rowgroup" colSpan={8} className={`${th} bg-[#f4f4f4]`}>
                      Disbursements — paid on your behalf, rebilled at cost
                    </th>
                  </tr>
                  {disbursements.map(lineRow)}
                  {subtotalRow(`Disbursements subtotal ${cur}`, disbursements)}
                </>
              ) : null}
              {subtotalRow(`Total Amount Payable ${cur}`, rows, true)}
            </tbody>
          </table>
        </div>
        {cur !== 'AED' ? (
          <p className="mt-2 text-right text-[12px]">
            AED equivalent at {formatNumber(inv.rate, 4)}:{' '}
            <span className="tabular-nums">AED {money(inv.totalAed)}</span>
          </p>
        ) : null}
        {inv.paid > 0 ? (
          <p className="mt-2 text-right text-[12px]">
            {inv.cashReceived > 0 ? (
              <>
                Amount received:{' '}
                <span className="tabular-nums">
                  {cur} {money(inv.cashReceived)}
                </span>{' '}
                ·{' '}
              </>
            ) : null}
            {inv.credited ? (
              <>
                Credited:{' '}
                <span className="tabular-nums">
                  {cur} {money(inv.credited)}
                </span>{' '}
                ·{' '}
              </>
            ) : null}
            {inv.writtenOff ? (
              <>
                Written off:{' '}
                <span className="tabular-nums">
                  {cur} {money(inv.writtenOff)}
                </span>{' '}
                ·{' '}
              </>
            ) : null}
            Balance due:{' '}
            <strong className="tabular-nums">
              {cur} {money(inv.outstanding)}
            </strong>
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
  const writeOff = useWriteOff();
  const [creditOpen, setCreditOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string>();
  const isOpen = OPEN_STATUSES.includes(inv.status);
  const cur = inv.currencyCode;
  const onError = (e: unknown) => toast({ title: 'Not done', body: errText(e) });

  const openDialog = (kind: 'credit' | 'writeoff') => {
    setReason('');
    setAmount(String(inv.outstanding));
    setFormError(undefined);
    if (kind === 'credit') setCreditOpen(true);
    else setWriteOffOpen(true);
  };

  const validate = (): number | undefined => {
    const n = Number(amount);
    if (!(n > 0) || n > inv.outstanding + 0.005) {
      setFormError(`Enter an amount between 0 and ${formatNumber(inv.outstanding, 2)}`);
      return undefined;
    }
    if (reason.trim().length < 5) {
      setFormError('Give a reason of at least 5 characters');
      return undefined;
    }
    return n;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Actions" />
        <CardBody className="space-y-3">
          {inv.status === 'Draft' ? (
            <>
              <p className="text-body-s text-fg-muted">
                Posting issues the invoice, records AR, revenue, disbursements and VAT, and locks it for
                editing.
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
                    onError,
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
          {inv.pendingCredit ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-caption text-warning">
              <Clock3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Credit note of <Money amount={inv.pendingCredit.amount ?? 0} /> waiting for approval (
              {inv.pendingCredit.record.approverRole}).
            </p>
          ) : null}
          {inv.pendingWriteOff ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-caption text-warning">
              <Clock3 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Write-off of <Money amount={inv.pendingWriteOff.amount ?? 0} /> waiting for approval (
              {inv.pendingWriteOff.record.approverRole}).
            </p>
          ) : null}
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
                onClick={() => openDialog('credit')}
              >
                Issue credit note
              </Button>
              {inv.status === 'Overdue' && !inv.pendingWriteOff ? (
                <Button
                  variant="danger"
                  className="w-full"
                  icon={<Ban aria-hidden="true" />}
                  onClick={() => openDialog('writeoff')}
                >
                  Write off as bad debt
                </Button>
              ) : null}
            </>
          ) : null}
          <Button
            variant="ghost"
            className="w-full"
            icon={<Printer aria-hidden="true" />}
            onClick={() => window.print()}
          >
            Print
          </Button>
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
        <CardHeader title="Credit notes" description="Illustrative postings — pending accountant sign-off." />
        <CardBody className="space-y-3">
          {inv.creditNotes.length === 0 ? (
            <p className="text-body-s text-fg-muted">No credit notes on this invoice.</p>
          ) : (
            <ul className="space-y-3">
              {inv.creditNotes.map((cn) => (
                <li key={cn.id} className="flex items-start justify-between gap-3 text-body-s">
                  <div className="min-w-0">
                    <DocRef>{cn.number}</DocRef>
                    <p className="text-caption text-fg-muted">
                      {formatDate(cn.date)} · {cn.reason}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-medium tabular-nums">
                    {cur} {formatNumber(cn.total, 2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border-subtle pt-3 text-caption text-fg-muted">
            Customer balance now (all invoices, AED):{' '}
            <Money amount={inv.customerBalance} className="font-medium text-fg" />
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Payment history"
          description={inv.payments.length ? `${inv.payments.length} allocation(s), AED` : undefined}
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
                      {p.status === 'Bounced' ? ' · bounced' : ''}
                    </p>
                  </div>
                  <Money amount={p.amount} className="font-medium" />
                </li>
              ))}
            </ul>
          )}
          {inv.reminders?.length ? (
            <div className="mt-4 border-t border-border-subtle pt-3">
              <p className="text-caption font-medium uppercase tracking-wide text-fg-muted">Reminders sent</p>
              <ul className="mt-2 space-y-1 text-caption text-fg-secondary">
                {inv.reminders.map((r) => (
                  <li key={r.at}>
                    Level {r.level} · {r.channel} · {formatDateTime(r.at)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Dialog
        open={creditOpen}
        onClose={() => setCreditOpen(false)}
        title={`Credit note for ${inv.number}`}
        description="Credits part or all of the open balance. The original invoice stays unchanged; a reversing journal is posted. Large credits need approval."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreditOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={credit.isPending}
              onClick={() => {
                const n = validate();
                if (n === undefined) return;
                credit.mutate(
                  { id: inv.id, amount: n, reason: reason.trim() },
                  {
                    onSuccess: (r) => {
                      setCreditOpen(false);
                      toast(
                        r.pending
                          ? { title: 'Sent for approval', body: 'The credit note posts once it is approved.' }
                          : { title: `${r.number} issued`, body: `Balance of ${inv.number} reduced` },
                      );
                    },
                    onError: (e) => setFormError(errText(e)),
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
            <span className="text-fg-muted">Open balance (incl. VAT)</span>
            <span className="font-semibold tabular-nums">
              {cur} {formatNumber(inv.outstanding, 2)}
            </span>
          </div>
          <TextField
            label={`Amount to credit, incl. VAT (${cur})`}
            type="number"
            inputMode="decimal"
            step="0.01"
            required
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setFormError(undefined);
            }}
          />
          <TextareaField
            label="Reason"
            required
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setFormError(undefined);
            }}
            placeholder="e.g. Rate dispute agreed with customer"
          />
          {formError ? (
            <p role="alert" className="text-caption font-medium text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={writeOffOpen}
        onClose={() => setWriteOffOpen(false)}
        title={`Write off ${inv.number}?`}
        description="Bad-debt write-off needs approval. When approved: Dr 6500 Bad debts / Cr customer receivable. Illustrative — pending accountant sign-off."
        footer={
          <>
            <Button variant="secondary" onClick={() => setWriteOffOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={writeOff.isPending}
              onClick={() => {
                const n = validate();
                if (n === undefined) return;
                writeOff.mutate(
                  { id: inv.id, amount: n, reason: reason.trim() },
                  {
                    onSuccess: (r) => {
                      setWriteOffOpen(false);
                      toast(
                        r.pending
                          ? { title: 'Write-off sent for approval', body: 'Posted only when approved.' }
                          : { title: 'Written off', body: `${inv.number} balance updated` },
                      );
                    },
                    onError: (e) => setFormError(errText(e)),
                  },
                );
              }}
            >
              Request write-off
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-body-s text-fg-secondary">
            {inv.customerName} · {inv.daysOverdue} days overdue · open {cur}{' '}
            {formatNumber(inv.outstanding, 2)}
          </p>
          <TextField
            label={`Amount to write off (${cur})`}
            type="number"
            inputMode="decimal"
            step="0.01"
            required
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setFormError(undefined);
            }}
          />
          <TextareaField
            label="Reason"
            required
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setFormError(undefined);
            }}
            placeholder="e.g. Customer insolvent, legal advice not to pursue"
          />
          {formError ? (
            <p role="alert" className="text-caption font-medium text-danger">
              {formError}
            </p>
          ) : null}
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
                  onError,
                })
              }
            >
              Delete draft
            </Button>
          </>
        }
      >
        <p className="text-body-s text-fg-secondary">
          Total {cur} {formatNumber(inv.total, 2)} for {inv.customerName}.
        </p>
      </Dialog>
    </div>
  );
}
