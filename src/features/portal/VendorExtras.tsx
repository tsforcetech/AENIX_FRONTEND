import { getRouteApi, Link } from '@tanstack/react-router';
import { CheckCircle2, Printer } from 'lucide-react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime, formatMoney } from '@/shared/utils/format';
import {
  useAdvanceMilestone,
  usePortalParty,
  useVendorDebitNotes,
  useVendorMilestoneJobs,
  useVendorPurchaseOrderDoc,
  type VendorDebitNoteRow,
} from './api';
import { PortalDenied } from './PortalDenied';

// ---------------- T2: milestones on the vendor's jobs ----------------
export function VendorMilestonesCard({ partyId }: { partyId: string }) {
  const { data, isLoading } = useVendorMilestoneJobs(partyId);
  const advance = useAdvanceMilestone(partyId);
  const toast = useToast();
  return (
    <Card>
      <CardHeader
        title="Job milestones"
        description="Update progress on jobs you have accepted. AENIX and the customer see each update."
      />
      <CardBody className="pt-3">
        {isLoading ? (
          <StatusMessage kind="loading" title="Loading jobs…" />
        ) : !data?.length ? (
          <p className="py-4 text-center text-body-s text-fg-muted">No open jobs.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {data.map((j) => {
              const current =
                j.milestones.find((m) => m.status === 'Current') ??
                j.milestones.find((m) => m.status === 'Pending');
              return (
                <li key={j.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <DocRef>{j.jobRef}</DocRef>
                      <p className="text-body-s font-medium">{j.lane}</p>
                      <p className="text-caption text-fg-muted">ETA {formatDate(j.eta)}</p>
                    </div>
                    {current ? (
                      j.canUpdate ? (
                        <Button
                          size="sm"
                          icon={<CheckCircle2 aria-hidden="true" />}
                          busy={advance.isPending && advance.variables === j.id}
                          onClick={() =>
                            advance.mutate(j.id, {
                              onSuccess: (done) => toast({ title: `${j.jobRef}: “${done}” done` }),
                              onError: (e) => toast({ title: 'Could not update', body: e.message }),
                            })
                          }
                        >
                          Mark “{current.label}” done
                        </Button>
                      ) : (
                        <span className="text-caption text-fg-muted">Accept the assignment to update</span>
                      )
                    ) : (
                      <Badge tone="success">All milestones done</Badge>
                    )}
                  </div>
                  <ol className="flex flex-wrap gap-2" aria-label={`${j.jobRef} milestones`}>
                    {j.milestones.map((m) => (
                      <li key={m.id}>
                        <Badge
                          tone={
                            m.status === 'Done' ? 'success' : m.status === 'Current' ? 'brand' : 'neutral'
                          }
                        >
                          {m.label}
                          <span className="sr-only"> — {m.status}</span>
                          {m.at ? <span> · {formatDateTime(m.at)}</span> : null}
                        </Badge>
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------- A10: debit notes raised against the vendor ----------------
const debitColumns: Column<VendorDebitNoteRow>[] = [
  {
    key: 'no',
    header: 'Debit note',
    cell: (d) => (
      <div>
        <DocRef>{d.number}</DocRef>
        <p className="text-caption text-fg-muted">{formatDate(d.date)}</p>
      </div>
    ),
  },
  {
    key: 'against',
    header: 'Against',
    hideOnMobile: true,
    cell: (d) => (
      <span className="font-mono text-[13px]">
        {[d.billNumber, d.poNumber].filter(Boolean).join(' · ') || '—'}
      </span>
    ),
  },
  { key: 'reason', header: 'Reason', cell: (d) => <span className="block min-w-40">{d.reason}</span> },
  { key: 'total', header: 'Amount incl. VAT', align: 'right', cell: (d) => <Money amount={d.total} /> },
  { key: 'status', header: 'Status', cell: (d) => <StatusBadge status={d.status} /> },
];

export function VendorDebitNotesCard({ partyId }: { partyId: string }) {
  const { data, isLoading } = useVendorDebitNotes(partyId);
  return (
    <Card>
      <CardHeader
        title="Debit notes"
        description="Deductions AENIX raised against your bills, for example for shortages or damage. Contact us to dispute."
      />
      <div className="mt-3">
        <DataTable
          caption="Debit notes against you"
          columns={debitColumns}
          rows={data}
          rowKey={(d) => d.id}
          loading={isLoading}
          emptyTitle="No debit notes"
        />
      </div>
    </Card>
  );
}

// ---------------- Printable purchase order ----------------
const printRoute = getRouteApi('/_app/vendor-portal/purchase-orders/$id');

export function VendorPoPrintPage() {
  const { id } = printRoute.useParams();
  const partyId = usePortalParty('vendor');
  const { data, isLoading } = useVendorPurchaseOrderDoc(partyId, id);
  if (!partyId) return <PortalDenied kind="vendor" />;
  if (isLoading) return <StatusMessage kind="loading" title="Loading purchase order…" />;
  if (!data)
    return (
      <div>
        <PageHeader
          title="Purchase order"
          crumbs={[{ label: 'Assignments', to: '/vendor-portal/assignments' }]}
        />
        <StatusMessage
          kind="empty"
          title="Purchase order not found"
          description="It may belong to another account."
        />
      </div>
    );
  return (
    <div>
      <PageHeader
        title={`Purchase order ${data.number}`}
        crumbs={[{ label: 'Assignments', to: '/vendor-portal/assignments' }, { label: data.number }]}
        meta={<StatusBadge status={data.status} />}
        actions={
          <Button variant="secondary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      <Card className="mx-auto max-w-3xl print:border-0 print:shadow-none">
        <CardBody className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-4">
            <div>
              <p className="text-[17px] font-semibold">{data.company.legalName}</p>
              {data.company.address.map((l) => (
                <p key={l} className="text-caption text-fg-muted">
                  {l}
                </p>
              ))}
              <p className="text-caption text-fg-muted">
                TRN {data.company.trn} · {data.company.phone} · {data.company.email}
              </p>
            </div>
            <div className="text-right">
              <p className="text-caption font-medium uppercase tracking-wide text-fg-muted">Purchase order</p>
              <p className="font-mono text-[17px] font-semibold">{data.number}</p>
              <p className="text-caption text-fg-muted">Issued {formatDate(data.issuedAt)}</p>
            </div>
          </div>
          <dl className="grid gap-4 text-body-s sm:grid-cols-2">
            <div>
              <dt className="text-caption text-fg-muted">To (vendor)</dt>
              <dd className="font-medium">{data.vendor.name}</dd>
              {data.vendor.contact ? (
                <dd className="text-caption text-fg-muted">Attn. {data.vendor.contact}</dd>
              ) : null}
            </div>
            <div>
              <dt className="text-caption text-fg-muted">Job</dt>
              <dd className="font-medium">
                <span className="font-mono">{data.jobRef}</span> · {data.location}
              </dd>
              {data.eta ? (
                <dd className="text-caption text-fg-muted">Required by {formatDate(data.eta)}</dd>
              ) : null}
            </div>
          </dl>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Purchase order lines">
            <table className="w-full border-collapse text-left text-body-s">
              <caption className="sr-only">Purchase order lines</caption>
              <thead>
                <tr className="border-y border-border-subtle bg-canvas/60 text-caption uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Service
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Description
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-subtle">
                  <td className="px-3 py-3">{data.service}</td>
                  <td className="px-3 py-3">{data.description}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMoney(data.amount)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2} className="px-3 pt-3 text-right font-normal text-fg-muted">
                    VAT {Math.round(data.vatRate * 100)}%
                  </th>
                  <td className="px-3 pt-3 text-right tabular-nums">{formatMoney(data.vat)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={2} className="px-3 py-2 text-right font-semibold">
                    Total
                  </th>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(data.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-caption text-fg-muted">
            Quote this PO number on your invoice. Your invoice is matched against this PO and the job’s GRN /
            POD before payment.
          </p>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-caption print:hidden">
        <Link to="/vendor-portal/assignments" className="font-medium text-brand hover:underline">
          Back to assignments
        </Link>
      </p>
    </div>
  );
}
