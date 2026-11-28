import { Link } from '@tanstack/react-router';
import { AlertTriangle, BellRing } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { DataTable, type Column } from '@/shared/ui/DataTable';
import { Dialog } from '@/shared/ui/Dialog';
import { SelectField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import { useSendReminder } from '@/features/invoices/api';
import { useFollowUp, type FollowUpRow } from './api';
import { AGEING_BUCKETS } from './followUp';

type Channel = 'Email' | 'WhatsApp' | 'Letter';

/** A6 collections follow-up: overdue invoices by ageing bucket, reminder ladder, credit-hold suggestions. */
export function FollowUpPage() {
  const { data, isLoading, error } = useFollowUp();
  const send = useSendReminder();
  const toast = useToast();
  const [bucket, setBucket] = useState<string>('All');
  const [target, setTarget] = useState<FollowUpRow | null>(null);
  const [level, setLevel] = useState<'1' | '2' | '3'>('1');
  const [channel, setChannel] = useState<Channel>('Email');

  const rows = (data?.rows ?? []).filter((r) => bucket === 'All' || r.bucket === bucket);
  const totals = AGEING_BUCKETS.map((b) => {
    const list = (data?.rows ?? []).filter((r) => r.bucket === b);
    return { b, count: list.length, amount: list.reduce((s, r) => s + r.outstandingAed, 0) };
  });
  const holdIds = new Set((data?.creditHold ?? []).map((h) => h.customerId));

  const columns: Column<FollowUpRow>[] = [
    {
      key: 'invoice',
      header: 'Invoice',
      cell: (r) => (
        <div>
          <Link
            to="/invoices/$id"
            params={{ id: r.id }}
            className="font-mono text-[13px] font-medium text-brand hover:underline"
          >
            {r.number}
          </Link>
          <p className="whitespace-nowrap text-caption text-fg-muted">Due {formatDate(r.dueDate)}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.customerName}</p>
          {holdIds.has(r.customerId) ? <Badge tone="danger">Credit hold suggested</Badge> : null}
        </div>
      ),
    },
    {
      key: 'days',
      header: 'Overdue',
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p className="font-medium">{r.daysOverdue} days</p>
          <p className="text-caption text-fg-muted">{r.bucket}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Outstanding (AED)',
      align: 'right',
      cell: (r) => <Money amount={r.outstandingAed} className="whitespace-nowrap font-medium" />,
    },
    {
      key: 'last',
      header: 'Last reminder',
      hideOnMobile: true,
      cell: (r) =>
        r.lastReminder ? (
          <div className="whitespace-nowrap">
            <p>
              Level {r.lastReminder.level} · {r.lastReminder.channel}
            </p>
            <p className="text-caption text-fg-muted">{formatDateTime(r.lastReminder.at)}</p>
          </div>
        ) : (
          <span className="text-fg-muted">None sent</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            icon={<BellRing aria-hidden="true" />}
            onClick={() => {
              setTarget(r);
              setLevel(String(r.nextLevel) as '1' | '2' | '3');
              setChannel(r.nextLevel === 3 ? 'Letter' : 'Email');
            }}
          >
            Send reminder {r.nextLevel}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Receipts', to: '/collections' }, { label: 'Follow-up' }]}
        title="Collections follow-up"
        description="Overdue invoices by age. Send reminders level 1, 2 and 3; write off bad debts from the invoice (needs approval)."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.map((t) => (
          <button
            key={t.b}
            type="button"
            aria-pressed={bucket === t.b}
            onClick={() => setBucket(bucket === t.b ? 'All' : t.b)}
            className="rounded-xl border border-border-subtle bg-surface p-5 text-left shadow-card hover:shadow-card-hover aria-pressed:border-brand"
          >
            <p className="text-body-s font-medium text-fg-muted">{t.b}</p>
            <p className="mt-2 text-[22px] font-semibold">
              <Money amount={t.amount} />
            </p>
            <p className="text-caption text-fg-muted">
              {t.count} invoice(s){bucket === t.b ? ' · filtered' : ''}
            </p>
          </button>
        ))}
      </div>
      {data?.creditHold.length ? (
        <Card className="mb-6">
          <CardHeader
            title="Credit hold suggested"
            description="Customers with an invoice more than 30 days overdue. Putting a customer on hold is done on the customer page."
          />
          <CardBody>
            <ul className="divide-y divide-border-subtle">
              {data.creditHold.map((h) => (
                <li key={h.customerId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <AlertTriangle aria-hidden="true" className="size-4 text-danger" />
                    <Link
                      to="/customers/$id"
                      params={{ id: h.customerId }}
                      className="font-medium hover:underline"
                    >
                      {h.customerName}
                    </Link>
                    <span className="text-caption text-fg-muted">({h.status})</span>
                  </span>
                  <span className="text-body-s">
                    Oldest {h.maxDays} days · overdue <Money amount={h.overdue} className="font-medium" />
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <DataTable
          caption="Overdue invoices"
          columns={columns}
          rows={data ? rows : undefined}
          rowKey={(r) => r.id}
          loading={isLoading}
          error={error}
          emptyTitle="Nothing overdue"
          emptyDescription="All open invoices are within their terms."
        />
      </Card>

      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? `Payment reminder for ${target.number}` : 'Payment reminder'}
        description="Recorded on the invoice. Sending by email / WhatsApp is done by the backend (not in the prototype)."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              busy={send.isPending}
              onClick={() =>
                target &&
                send.mutate(
                  { id: target.id, level: Number(level) as 1 | 2 | 3, channel },
                  {
                    onSuccess: () => {
                      toast({ title: `Reminder ${level} recorded`, body: `${target.number} · ${channel}` });
                      setTarget(null);
                    },
                    onError: (e) =>
                      toast({
                        title: 'Not sent',
                        body: e instanceof Error ? e.message : 'Please try again.',
                      }),
                  },
                )
              }
            >
              Send reminder
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Level"
            value={level}
            onChange={(e) => setLevel(e.target.value as '1' | '2' | '3')}
            options={[
              { value: '1', label: '1 — friendly reminder' },
              { value: '2', label: '2 — firm reminder' },
              { value: '3', label: '3 — final notice' },
            ]}
          />
          <SelectField
            label="Channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            options={['Email', 'WhatsApp', 'Letter'].map((c) => ({ value: c, label: c }))}
          />
        </div>
      </Dialog>
    </div>
  );
}
