import { Link } from '@tanstack/react-router';
import { CheckCircle2, ClipboardList, Truck, Wallet } from 'lucide-react';
import { StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { KpiCard } from '@/shared/ui/KpiCard';
import { ModeIcon } from '@/shared/ui/ModeIcon';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatMoneyCompact } from '@/shared/utils/format';
import {
  useAssignmentAction,
  usePortalParty,
  useVendorAssignments,
  useVendorBills,
  useVendorPortalOverview,
  type VendorAssignmentRow,
  type VendorBillRow,
} from './api';
import { PortalDenied } from './PortalDenied';

export function VendorPortalHome() {
  const partyId = usePortalParty('vendor');
  const { data, isLoading } = useVendorPortalOverview(partyId);
  if (!partyId) return <PortalDenied kind="vendor" />;
  if (isLoading || !data) return <StatusMessage kind="loading" title="Loading your account…" />;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${data.vendorName}`}
        description="Your assignments from AENIX and the status of your bills."
      />
      <section aria-label="Account summary" className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Open assignments" value={String(data.openAssignments)} icon={<Truck />} />
        <KpiCard
          label="Bills outstanding"
          value={formatMoneyCompact(data.billsOutstanding)}
          icon={<ClipboardList />}
        />
        <KpiCard label="Paid · November" value={formatMoneyCompact(data.paidThisMonth)} icon={<Wallet />} />
      </section>
      <Card>
        <CardHeader
          title="Open assignments"
          actions={
            <Link
              to="/vendor-portal/assignments"
              className="text-body-s font-medium text-brand hover:underline"
            >
              View all
            </Link>
          }
        />
        <CardBody className="pt-3">
          {data.recentAssignments.length === 0 ? (
            <p className="py-6 text-center text-body-s text-fg-muted">No open assignments.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.recentAssignments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-4 py-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-fg-secondary">
                    <ModeIcon mode={a.mode} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <DocRef>{a.jobRef}</DocRef>
                    <span className="block truncate text-body-s font-medium">{a.lane}</span>
                    <span className="block text-caption text-fg-muted">{a.service}</span>
                  </span>
                  <span className="text-right">
                    <Money amount={a.agreedCost} className="block text-body-s font-medium" />
                    <StatusBadge status={a.status} />
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

export function VendorAssignmentsPage() {
  const partyId = usePortalParty('vendor');
  const { data, isLoading } = useVendorAssignments(partyId);
  const act = useAssignmentAction(partyId);
  const toast = useToast();
  if (!partyId) return <PortalDenied kind="vendor" />;

  const columns: Column<VendorAssignmentRow>[] = [
    { key: 'job', header: 'Job', cell: (a) => <DocRef>{a.jobRef}</DocRef> },
    {
      key: 'lane',
      header: 'Lane',
      cell: (a) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <ModeIcon mode={a.mode} className="size-4 text-fg-muted" />
          {a.lane}
        </span>
      ),
    },
    { key: 'service', header: 'Service', hideOnMobile: true, cell: (a) => a.service },
    {
      key: 'eta',
      header: 'ETA',
      hideOnMobile: true,
      cell: (a) => <span className="whitespace-nowrap">{formatDate(a.eta)}</span>,
    },
    { key: 'cost', header: 'Agreed cost', align: 'right', cell: (a) => <Money amount={a.agreedCost} /> },
    { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} /> },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      align: 'right',
      cell: (a) =>
        a.status === 'Requested' ? (
          <Button
            size="sm"
            busy={act.isPending && act.variables?.id === a.id}
            onClick={() =>
              act.mutate(
                { id: a.id, next: 'Accepted' },
                { onSuccess: () => toast({ title: `${a.jobRef} accepted` }) },
              )
            }
          >
            Accept
          </Button>
        ) : a.status === 'Accepted' ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<CheckCircle2 aria-hidden="true" />}
            busy={act.isPending && act.variables?.id === a.id}
            onClick={() =>
              act.mutate(
                { id: a.id, next: 'Completed' },
                { onSuccess: () => toast({ title: `${a.jobRef} marked completed` }) },
              )
            }
          >
            Mark completed
          </Button>
        ) : (
          <span className="text-caption text-fg-muted">Done</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Assignments"
        description="Services AENIX has assigned to you. Accept new requests and confirm completion."
      />
      <Card>
        <DataTable
          caption="Your assignments"
          columns={columns}
          rows={data}
          rowKey={(a) => a.id}
          loading={isLoading}
          emptyTitle="No assignments"
        />
      </Card>
    </div>
  );
}

const billColumns: Column<VendorBillRow>[] = [
  {
    key: 'number',
    header: 'Bill',
    cell: (b) => (
      <div>
        <DocRef>{b.number}</DocRef>
        <p className="text-caption text-fg-muted">Your ref {b.vendorRef}</p>
      </div>
    ),
  },
  {
    key: 'job',
    header: 'Job',
    hideOnMobile: true,
    cell: (b) => <span className="font-mono text-[13px]">{b.jobRef}</span>,
  },
  {
    key: 'date',
    header: 'Bill date',
    hideOnMobile: true,
    cell: (b) => <span className="whitespace-nowrap">{formatDate(b.billDate)}</span>,
  },
  {
    key: 'due',
    header: 'Due',
    cell: (b) => <span className="whitespace-nowrap">{formatDate(b.dueDate)}</span>,
  },
  { key: 'total', header: 'Total', align: 'right', cell: (b) => <Money amount={b.total} /> },
  {
    key: 'paid',
    header: 'Paid',
    align: 'right',
    hideOnMobile: true,
    cell: (b) => <Money amount={b.paid} muted={b.paid === 0} />,
  },
  {
    key: 'out',
    header: 'Outstanding',
    align: 'right',
    cell: (b) => <Money amount={b.outstanding} muted={b.outstanding === 0} />,
  },
  { key: 'status', header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
];

export function VendorBillsPage() {
  const partyId = usePortalParty('vendor');
  const { data, isLoading } = useVendorBills(partyId);
  if (!partyId) return <PortalDenied kind="vendor" />;
  return (
    <div>
      <PageHeader
        title="Bills & payments"
        description="Read-only status of the bills you have submitted to AENIX."
      />
      <Card>
        <DataTable
          caption="Your bills"
          columns={billColumns}
          rows={data}
          rowKey={(b) => b.id}
          loading={isLoading}
          emptyTitle="No bills yet"
        />
      </Card>
    </div>
  );
}
