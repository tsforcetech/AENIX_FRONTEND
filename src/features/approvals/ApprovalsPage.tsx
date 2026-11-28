import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { ApprovalRequest } from '@/domain/types';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField, TextareaField } from '@/shared/ui/Field';
import { DocRef, Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Tabs } from '@/shared/ui/Tabs';
import { useToast } from '@/shared/ui/Toast';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { formatDateTime, formatMoney } from '@/shared/utils/format';
import { useApprovalInbox, useDecideApproval } from './api';
import { APPROVAL_DOC_TYPES, APPROVAL_TABS, APPROVER_ROLES, decisionError, type ApprovalTab } from './inbox';

const route = getRouteApi('/_app/approvals');

type Decision = { request: ApprovalRequest; decision: 'Approved' | 'Rejected' };

export function ApprovalsPage() {
  const search = route.useSearch();
  const navigate = useNavigate({ from: '/approvals' });
  const status: ApprovalTab = search.status ?? 'Pending';
  const { data, isLoading, error } = useApprovalInbox({
    status,
    docType: search.type,
    role: search.role,
  });
  const [deciding, setDeciding] = useState<Decision | null>(null);

  const columns: Column<ApprovalRequest>[] = [
    {
      key: 'doc',
      header: 'Document',
      cell: (r) => (
        <div>
          {r.href ? (
            <Link to={r.href} className="hover:underline">
              <DocRef>{r.entityRef}</DocRef>
            </Link>
          ) : (
            <DocRef>{r.entityRef}</DocRef>
          )}
          <p className="text-caption text-fg-muted">{r.docType}</p>
        </div>
      ),
    },
    {
      key: 'summary',
      header: 'Summary',
      cell: (r) => (
        <div className="min-w-48">
          <p>{r.summary}</p>
          {r.record.reason ? (
            <p className="text-caption text-fg-muted">
              {r.record.status === 'Pending' ? 'Note' : 'Reason'}: {r.record.reason}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (r) =>
        r.amount !== undefined ? <Money amount={r.amount} /> : <span className="text-fg-muted">—</span>,
    },
    {
      key: 'requested',
      header: 'Requested',
      hideOnMobile: true,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p>{r.record.requestedBy}</p>
          <p className="text-caption text-fg-muted">{formatDateTime(r.record.requestedAt)}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Approver',
      cell: (r) => <span className="whitespace-nowrap">{r.record.approverRole}</span>,
    },
    status === 'Pending'
      ? {
          key: 'action',
          header: <span className="sr-only">Decision</span>,
          align: 'right',
          cell: (r) => (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                icon={<Check aria-hidden="true" />}
                aria-label={`Approve ${r.entityRef}`}
                onClick={() => setDeciding({ request: r, decision: 'Approved' })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<X aria-hidden="true" />}
                aria-label={`Reject ${r.entityRef}`}
                onClick={() => setDeciding({ request: r, decision: 'Rejected' })}
              >
                Reject
              </Button>
            </div>
          ),
        }
      : {
          key: 'decided',
          header: 'Decision',
          cell: (r) => (
            <div className="whitespace-nowrap">
              <StatusBadge status={r.record.status} />
              <p className="mt-1 text-caption text-fg-muted">
                {r.record.decidedBy ?? '—'}
                {r.record.decidedAt ? ` · ${formatDateTime(r.record.decidedAt)}` : ''}
              </p>
            </div>
          ),
        },
  ];

  const setSearch = (patch: Partial<typeof search>) => void navigate({ search: (p) => ({ ...p, ...patch }) });

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Everything waiting for a decision under the approval matrix. The backend checks who may approve."
      />
      <section aria-label="Approvals summary" className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={data?.counts.Pending ? 'warning' : 'success'}>
          {data ? `${data.counts.Pending} waiting` : 'Loading…'}
        </Badge>
        {data && data.pendingAmount > 0 ? (
          <Badge tone="neutral" dot={false}>
            {formatMoney(data.pendingAmount)} pending
          </Badge>
        ) : null}
        {data?.pendingByRole.map((r) => (
          <Badge key={r.role} tone="info" dot={false}>
            {r.role}: {r.count}
          </Badge>
        ))}
      </section>
      <Card>
        <div className="space-y-4 px-5 pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
            <SelectField
              label="Document type"
              value={search.type ?? ''}
              placeholder="All types"
              options={APPROVAL_DOC_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(e) => setSearch({ type: (e.target.value || undefined) as typeof search.type })}
            />
            <SelectField
              label="Approver role"
              value={search.role ?? ''}
              placeholder="All roles"
              options={APPROVER_ROLES.map((r) => ({ value: r, label: r }))}
              onChange={(e) => setSearch({ role: e.target.value || undefined })}
            />
          </div>
          <Tabs
            label="Approval status"
            value={status}
            onChange={(v) => setSearch({ status: v === 'Pending' ? undefined : (v as ApprovalTab) })}
            items={APPROVAL_TABS.map((t) => ({ value: t, label: t, count: data?.counts[t] }))}
          />
        </div>
        <DataTable
          caption={`${status} approvals`}
          columns={columns}
          rows={data?.rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          error={error}
          emptyTitle={
            status === 'Pending' ? 'Nothing waiting for approval' : `No ${status.toLowerCase()} requests`
          }
          emptyDescription={
            status === 'Pending' ? 'Documents above the approval-matrix thresholds appear here.' : undefined
          }
        />
      </Card>
      {deciding ? (
        <DecisionDialog key={deciding.request.id} value={deciding} onClose={() => setDeciding(null)} />
      ) : null}
    </div>
  );
}

function DecisionDialog({ value, onClose }: { value: Decision; onClose: () => void }) {
  const { request, decision } = value;
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const decide = useDecideApproval();
  const toast = useToast();
  const err = decisionError(decision, reason);
  const submit = () => {
    setTouched(true);
    if (err || decide.isPending) return;
    decide.mutate(
      { id: request.id, decision, reason },
      {
        onSuccess: () => {
          toast({ title: `${request.entityRef} ${decision.toLowerCase()}` });
          onClose();
        },
      },
    );
  };
  useFormShortcuts({ onPrimary: submit });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${decision === 'Approved' ? 'Approve' : 'Reject'} ${request.entityRef}`}
      description={`${request.docType} · ${request.summary}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision === 'Rejected' ? 'danger' : 'primary'}
            busy={decide.isPending}
            onClick={submit}
            title="Ctrl/⌘ + Enter"
          >
            {decision === 'Approved' ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {request.amount !== undefined ? (
          <p className="text-body-s">
            Amount <Money amount={request.amount} className="font-semibold" />
          </p>
        ) : null}
        <TextareaField
          label={decision === 'Rejected' ? 'Reason for rejecting' : 'Note (optional)'}
          required={decision === 'Rejected'}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          error={touched ? err : undefined}
          hint={decision === 'Rejected' ? 'The requester sees this reason.' : undefined}
        />
        {decide.error ? (
          <p role="alert" className="text-body-s font-medium text-danger">
            {decide.error.message}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
