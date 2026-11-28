import { Link } from '@tanstack/react-router';
import { CheckCircle2, CircleDashed, Lock, LockOpen } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Dialog } from '@/shared/ui/Dialog';
import { TextareaField, TextField } from '@/shared/ui/Field';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import { usePeriodClose, usePeriodLock } from './closing';

function previousMonthEnd(today: string) {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

/** A14 period close: checklist and "lock period up to" (unlock needs a reason, logged). */
export function PeriodClosePage() {
  const [periodEnd, setPeriodEnd] = useState(previousMonthEnd(PROTO_TODAY));
  const [vatReviewed, setVatReviewed] = useState(false);
  const { data, isLoading, error } = usePeriodClose(periodEnd, vatReviewed);
  const lock = usePeriodLock();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockTo, setUnlockTo] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string>();
  const allOk = data?.checks.every((c) => c.ok) ?? false;
  const onError = (e: unknown) => setFormError(e instanceof Error ? e.message : 'Please try again.');

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        crumbs={[{ label: 'Accounting', to: '/accounting' }, { label: 'Period close' }]}
        title="Period close"
        description="Check the month is complete, then lock it so nothing can be posted into it."
        meta={
          data?.lockedUntil ? (
            <Badge tone="dark">{`Locked up to ${formatDate(data.lockedUntil)}`}</Badge>
          ) : (
            <Badge tone="warning">No period locked</Badge>
          )
        }
      />
      <p className="mb-4 text-caption text-fg-muted">
        Close rules are illustrative and pending accountant sign-off.
      </p>
      <Card className="mb-6">
        <CardBody>
          <TextField
            label="Period end to close"
            type="date"
            value={periodEnd}
            max={PROTO_TODAY}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="max-w-xs"
          />
        </CardBody>
      </Card>
      {error ? (
        <StatusMessage kind="error" title="Could not load the checklist" />
      ) : isLoading || !data ? (
        <StatusMessage kind="loading" title="Checking the period…" />
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader title="Checklist" description={`Before locking up to ${formatDate(periodEnd)}`} />
            <CardBody>
              <ul className="divide-y divide-border-subtle">
                {data.checks.map((c) => (
                  <li key={c.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="flex items-start gap-3">
                      {c.ok ? (
                        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 text-success" />
                      ) : (
                        <CircleDashed aria-hidden="true" className="mt-0.5 size-5 text-warning" />
                      )}
                      <div>
                        <p className="font-medium">
                          {c.label} <span className="sr-only">{c.ok ? '(done)' : '(open)'}</span>
                        </p>
                        <p className="text-caption text-fg-muted">{c.detail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.key === 'vat' ? (
                        <label className="flex items-center gap-2 text-body-s">
                          <input
                            type="checkbox"
                            checked={vatReviewed}
                            onChange={(e) => setVatReviewed(e.target.checked)}
                            className="size-4 accent-[var(--color-brand)]"
                          />
                          VAT reviewed
                        </label>
                      ) : null}
                      <Link to={c.href} className="text-body-s font-medium text-brand hover:underline">
                        Open
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card className="mb-6">
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-body-s text-fg-secondary">
                {allOk
                  ? 'All checks are done.'
                  : 'Some checks are open. You can still lock, but agree it with the accountant first.'}
              </p>
              <div className="flex gap-2">
                {data.lockedUntil ? (
                  <Button
                    variant="secondary"
                    icon={<LockOpen aria-hidden="true" />}
                    onClick={() => {
                      setReason('');
                      setUnlockTo('');
                      setFormError(undefined);
                      setUnlockOpen(true);
                    }}
                  >
                    Unlock…
                  </Button>
                ) : null}
                <Button
                  icon={<Lock aria-hidden="true" />}
                  disabled={!!data.lockedUntil && periodEnd <= data.lockedUntil}
                  onClick={() => {
                    setFormError(undefined);
                    setConfirmOpen(true);
                  }}
                >
                  Lock period up to {formatDate(periodEnd)}
                </Button>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Lock history" />
            <CardBody>
              {data.history.length ? (
                <ul className="space-y-2 text-body-s">
                  {data.history.map((h) => (
                    <li key={h.at + h.action}>
                      <span className="text-fg-muted">
                        {formatDateTime(h.at)} · {h.actor}:
                      </span>{' '}
                      {h.action}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-s text-fg-muted">No lock changes in this session.</p>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Lock the books up to ${formatDate(periodEnd)}?`}
        description="No invoice, receipt, payment, bill, note, journal, expense or accrual can be posted on or before this date. Unlocking needs a reason."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={lock.isPending}
              onClick={() =>
                lock.mutate(
                  { kind: 'lock', upTo: periodEnd },
                  {
                    onSuccess: () => {
                      setConfirmOpen(false);
                      toast({ title: `Locked up to ${formatDate(periodEnd)}` });
                    },
                    onError,
                  },
                )
              }
            >
              Lock period
            </Button>
          </>
        }
      >
        {formError ? (
          <p role="alert" className="text-caption font-medium text-danger">
            {formError}
          </p>
        ) : (
          <p className="text-body-s text-fg-secondary">
            {allOk ? 'All checklist items are done.' : 'Some checklist items are still open.'}
          </p>
        )}
      </Dialog>

      <Dialog
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        title="Re-open a locked period"
        description="The reason is kept in the audit log."
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnlockOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={lock.isPending}
              onClick={() => {
                if (reason.trim().length < 5) return setFormError('Give a reason of at least 5 characters');
                lock.mutate(
                  { kind: 'unlock', to: unlockTo || undefined, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setUnlockOpen(false);
                      toast({
                        title: 'Period re-opened',
                        body: unlockTo ? `Locked up to ${formatDate(unlockTo)}` : 'No lock',
                      });
                    },
                    onError,
                  },
                );
              }}
            >
              Unlock
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Keep locked up to (optional)"
            type="date"
            value={unlockTo}
            hint="Leave empty to remove the lock completely."
            onChange={(e) => setUnlockTo(e.target.value)}
          />
          <TextareaField
            label="Reason"
            required
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setFormError(undefined);
            }}
            placeholder="e.g. Accountant correction to October accruals"
          />
          {formError ? (
            <p role="alert" className="text-caption font-medium text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
