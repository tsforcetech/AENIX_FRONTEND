import { Link } from '@tanstack/react-router';
import { CheckCircle2, FileText, MessageSquareWarning, Receipt, Scale, Wallet } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField } from '@/shared/ui/Field';
import { KpiCard } from '@/shared/ui/KpiCard';
import { JobKindIcon } from '@/shared/ui/ModeIcon';
import { servicesLabel } from '@/domain/workflow';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatMoneyCompact } from '@/shared/utils/format';
import { StatementTable } from '@/features/customers/StatementTable';
import {
  useCustomerApprovals,
  useCustomerInvoices,
  useCustomerPortalOverview,
  usePortalParty,
  useQuotationDecision,
  type CustomerApproval,
} from './api';
import { CustomerStockCard } from './CustomerStock';
import { PackingListsCard } from './PackingListUpload';
import { PortalDenied } from './PortalDenied';

interface PortalInvoice {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  status: string;
  total: number;
  outstanding: number;
}

const invoiceColumns: Column<PortalInvoice>[] = [
  { key: 'number', header: 'Invoice', cell: (i) => <DocRef>{i.number}</DocRef> },
  {
    key: 'issued',
    header: 'Issued',
    hideOnMobile: true,
    cell: (i) => <span className="whitespace-nowrap">{formatDate(i.issueDate)}</span>,
  },
  {
    key: 'due',
    header: 'Due',
    cell: (i) => <span className="whitespace-nowrap">{formatDate(i.dueDate)}</span>,
  },
  { key: 'total', header: 'Total', align: 'right', cell: (i) => <Money amount={i.total} /> },
  {
    key: 'outstanding',
    header: 'Outstanding',
    align: 'right',
    cell: (i) => <Money amount={i.outstanding} muted={i.outstanding === 0} />,
  },
  { key: 'status', header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
];

export function CustomerPortalHome() {
  const partyId = usePortalParty('customer');
  const { data, isLoading } = useCustomerPortalOverview(partyId);
  if (!partyId) return <PortalDenied kind="customer" />;
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading your account…" />;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${data.customerName}`}
        description="Your shipments, approvals and account at a glance."
      />
      <section aria-label="Account summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Invoices outstanding"
          value={formatMoneyCompact(data.balance.outstanding)}
          icon={<Receipt />}
          footnote={
            data.overdue ? (
              <span className="font-medium text-danger">
                {formatMoneyCompact(data.overdue)} overdue — please arrange payment
              </span>
            ) : (
              <span className="text-success">Nothing overdue</span>
            )
          }
        />
        <KpiCard
          label="Advances held"
          value={formatMoneyCompact(data.balance.advances + data.balance.unallocated)}
          icon={<Wallet />}
          footnote={<span className="text-fg-muted">Paid in advance, applied to future invoices</span>}
        />
        <KpiCard
          label="Net balance"
          value={formatMoneyCompact(data.balance.balance)}
          icon={<Scale />}
          footnote={
            <span className="text-fg-muted">
              {data.balance.balance > 0
                ? 'Amount due to AENIX'
                : data.balance.balance < 0
                  ? 'In your favour'
                  : 'Settled'}
            </span>
          }
        />
        <KpiCard
          label="Awaiting your approval"
          value={String(data.pendingApprovals)}
          icon={<FileText />}
          footnote={
            data.pendingApprovals ? (
              <Link to="/portal/approvals" className="font-medium text-brand hover:underline">
                Review quotations
              </Link>
            ) : (
              <span className="text-fg-muted">All caught up</span>
            )
          }
        />
      </section>
      <PackingListsCard partyId={partyId} jobs={data.warehouseJobs} />
      <CustomerStockCard partyId={partyId} />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Active jobs"
            description="Transport, warehouse and service jobs with live progress"
          />
          <CardBody className="pt-3">
            {data.shipments.length === 0 ? (
              <p className="py-6 text-center text-body-s text-fg-muted">No active jobs.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {data.shipments.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-fg-secondary">
                      <JobKindIcon category={s.serviceCategory} mode={s.mode} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <DocRef>{s.number}</DocRef>
                        <StatusBadge status={s.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-body-s font-medium">{s.lane}</span>
                      <span className="block text-caption text-fg-muted">
                        {servicesLabel(s.serviceCategories, s.mode)}
                      </span>
                    </span>
                    <span className="w-full sm:w-56">
                      <span className="flex justify-between gap-2 whitespace-nowrap text-caption text-fg-muted">
                        <span className="truncate">{s.milestone}</span>
                        <span className="tabular-nums">ETA {formatDate(s.eta)}</span>
                      </span>
                      <span
                        role="progressbar"
                        aria-label={`${s.number} progress`}
                        aria-valuenow={s.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-muted"
                      >
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${Math.max(s.progress, 4)}%` }}
                        />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent invoices"
            actions={
              <Link to="/portal/invoices" className="text-body-s font-medium text-brand hover:underline">
                Statement
              </Link>
            }
          />
          <CardBody className="pt-3">
            <ul className="divide-y divide-border-subtle">
              {data.recentInvoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                  <span>
                    <DocRef>{i.number}</DocRef>
                    <span className="block text-caption text-fg-muted">Due {formatDate(i.dueDate)}</span>
                  </span>
                  <span className="text-right">
                    <Money amount={i.outstanding || i.total} className="block text-body-s font-medium" />
                    <StatusBadge status={i.status} />
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Delivery requests"
          description="Your out / delivery requests and the proof of delivery (POD) recorded against each"
        />
        <CardBody className="pt-3">
          {data.requests.length === 0 ? (
            <p className="py-6 text-center text-body-s text-fg-muted">No delivery requests yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <DocRef>{r.number}</DocRef>
                      <span className="text-caption text-fg-muted">job {r.jobRef}</span>
                      <StatusBadge status={r.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-body-s font-medium">{r.deliverTo}</span>
                    <span className="block text-caption text-fg-muted">
                      Required by {formatDate(r.requiredBy)}
                    </span>
                  </span>
                  <span className="text-right text-body-s">
                    {r.podNumber ? (
                      <>
                        <span className="block">
                          POD <span className="font-mono text-[13px]">{r.podNumber}</span>
                        </span>
                        <span className="block text-caption text-fg-muted">
                          Delivered {r.deliveredQty} of {r.requestedQty}
                        </span>
                        {r.mismatches > 0 ? (
                          <span className="block text-caption font-medium text-danger">
                            {r.mismatches} line{r.mismatches === 1 ? '' : 's'} differ — AENIX is reviewing
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="block text-caption text-fg-muted">
                        POD pending · {r.requestedQty} requested
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export function CustomerApprovalsPage() {
  const partyId = usePortalParty('customer');
  const { data, isLoading } = useCustomerApprovals(partyId);
  const decide = useQuotationDecision(partyId);
  const toast = useToast();
  const [changesFor, setChangesFor] = useState<CustomerApproval | null>(null);
  const [note, setNote] = useState('');
  if (!partyId) return <PortalDenied kind="customer" />;
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading quotations…" />;
  const pending = data.filter((q) => q.status === 'Sent');
  const others = data.filter((q) => q.status !== 'Sent');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Quotations sent to you for a decision. Accepted quotations are confirmed with our operations team."
      />
      {pending.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 aria-hidden="true" className="size-8 text-success" />
            <p className="font-medium">Nothing awaiting your approval</p>
          </CardBody>
        </Card>
      ) : (
        pending.map((q) => (
          <Card key={q.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <DocRef>{q.number}</DocRef>
                  <span className="text-caption font-normal text-fg-muted">v{q.version}</span>
                  <StatusBadge status="Sent" />
                </span>
              }
              description={`${q.lane} · ${servicesLabel(q.serviceCategories, q.mode)} · ${q.agreement} · valid until ${formatDate(q.validUntil)}`}
              actions={
                <>
                  <Button
                    variant="secondary"
                    icon={<MessageSquareWarning aria-hidden="true" />}
                    onClick={() => setChangesFor(q)}
                  >
                    Request changes
                  </Button>
                  <Button
                    busy={
                      decide.isPending &&
                      decide.variables?.id === q.id &&
                      decide.variables.decision === 'accept'
                    }
                    icon={<CheckCircle2 aria-hidden="true" />}
                    onClick={() =>
                      decide.mutate(
                        { id: q.id, decision: 'accept' },
                        {
                          onSuccess: () =>
                            toast({
                              title: `${q.number} accepted`,
                              body: 'Our team will confirm the work order shortly.',
                            }),
                        },
                      )
                    }
                  >
                    Accept
                  </Button>
                </>
              }
            />
            <CardBody>
              <table className="w-full text-left text-body-s">
                <caption className="sr-only">{q.number} price lines</caption>
                <thead>
                  <tr className="border-b border-border-subtle text-caption uppercase tracking-wide text-fg-muted">
                    <th className="py-2 font-medium">Description</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="hidden py-2 text-right font-medium sm:table-cell">Unit price</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {q.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border-subtle">
                      <td className="py-2.5">{l.description}</td>
                      <td className="py-2.5 text-right tabular-nums">{`${l.quantity} ${l.unit}`}</td>
                      <td className="hidden py-2.5 text-right sm:table-cell">
                        <Money amount={l.unitPrice} />
                      </td>
                      <td className="py-2.5 text-right">
                        <Money amount={l.quantity * l.unitPrice} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} className="pt-3 text-caption text-fg-muted sm:hidden">
                      Total incl. 5% VAT
                    </td>
                    <td
                      colSpan={3}
                      className="hidden pt-3 text-right text-caption text-fg-muted sm:table-cell"
                    >
                      Total incl. 5% VAT
                    </td>
                    <td className="pt-3 text-right text-[17px] font-semibold">
                      <Money amount={q.total} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>
        ))
      )}
      <Card>
        <CardHeader title="Quotation history" />
        <div className="mt-3">
          <DataTable
            caption="Quotation history"
            rows={others}
            rowKey={(q) => q.id}
            emptyTitle="No other quotations"
            columns={[
              { key: 'n', header: 'Quotation', cell: (q) => <DocRef>{q.number}</DocRef> },
              {
                key: 'lane',
                header: 'Lane',
                cell: (q) => <span className="whitespace-nowrap">{q.lane}</span>,
              },
              {
                key: 'valid',
                header: 'Valid until',
                hideOnMobile: true,
                cell: (q) => formatDate(q.validUntil),
              },
              { key: 'total', header: 'Total', align: 'right', cell: (q) => <Money amount={q.total} /> },
              { key: 'status', header: 'Status', cell: (q) => <StatusBadge status={q.status} /> },
            ]}
          />
        </div>
      </Card>
      <Dialog
        open={!!changesFor}
        onClose={() => {
          setChangesFor(null);
          setNote('');
        }}
        title={`Request changes to ${changesFor?.number ?? ''}`}
        description="Tell us what should change. The quotation returns to our sales team."
        footer={
          <>
            <Button variant="secondary" onClick={() => setChangesFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={note.trim().length < 5}
              busy={decide.isPending}
              onClick={() =>
                changesFor &&
                decide.mutate(
                  { id: changesFor.id, decision: 'changes', note: note.trim() },
                  {
                    onSuccess: () => {
                      toast({ title: 'Change request sent', body: changesFor.number });
                      setChangesFor(null);
                      setNote('');
                    },
                  },
                )
              }
            >
              Send request
            </Button>
          </>
        }
      >
        <TextareaField
          label="What should change?"
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          hint="At least 5 characters"
        />
      </Dialog>
    </div>
  );
}

export function CustomerInvoicesPage() {
  const partyId = usePortalParty('customer');
  const { data, isLoading } = useCustomerInvoices(partyId);
  if (!partyId) return <PortalDenied kind="customer" />;
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading invoices…" />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices & statement"
        description="Read-only view of your invoices and account statement. Contact us to query an invoice."
      />
      <section aria-label="Account balance" className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Outstanding balance"
          value={formatMoneyCompact(data.balance.outstanding)}
          icon={<Receipt />}
          footnote={
            data.overdue ? (
              <span className="font-medium text-danger">{formatMoneyCompact(data.overdue)} overdue</span>
            ) : (
              <span className="text-success">Nothing overdue</span>
            )
          }
        />
        <KpiCard
          label="Advances held"
          value={formatMoneyCompact(data.balance.advances + data.balance.unallocated)}
          icon={<Wallet />}
          footnote={<span className="text-fg-muted">Applied to future invoices</span>}
        />
        <KpiCard
          label="Net balance"
          value={formatMoneyCompact(data.balance.balance)}
          icon={<Scale />}
          footnote={
            <span className="text-fg-muted">
              {data.balance.balance > 0
                ? 'Amount due to AENIX'
                : data.balance.balance < 0
                  ? 'In your favour'
                  : 'Settled'}
            </span>
          }
        />
      </section>
      <Card>
        <CardHeader title="Invoices" />
        <div className="mt-3">
          <DataTable
            caption="Your invoices"
            columns={invoiceColumns}
            rows={data.invoices}
            rowKey={(i) => i.id}
            emptyTitle="No invoices yet"
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Statement of account" description="Invoices and receipts with running balance" />
        <div className="mt-3">
          <StatementTable lines={data.statement} linkInvoices={false} />
        </div>
      </Card>
    </div>
  );
}
