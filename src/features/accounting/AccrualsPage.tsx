import { useState } from 'react';
import { Badge, StatusBadge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { TextField } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { PageHeader } from '@/shared/ui/PageHeader';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { formatDate } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import { monthEnd, nextDay } from './accruals';
import { useAccrualPreview, useAccrualRuns, usePostAccruals } from './closing';

/** Last day of the previous month (the usual period to close). */
function previousMonthEnd(today: string) {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

/** A7 month-end accruals: unbilled revenue and costs without a vendor invoice, auto-reversed next period. */
export function AccrualsPage() {
  const [periodEnd, setPeriodEnd] = useState(monthEnd(PROTO_TODAY));
  const preview = useAccrualPreview(periodEnd);
  const runs = useAccrualRuns();
  const post = usePostAccruals();
  const toast = useToast();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const changePeriod = (p: string) => {
    setPeriodEnd(p);
    setExcluded(new Set());
  };

  const lines = preview.data?.lines ?? [];
  const keyOf = (l: (typeof lines)[number]) => `${l.kind}|${l.reference}`;
  const chosen = lines.filter((l) => !excluded.has(keyOf(l)));
  const sum = (k: string) =>
    Math.round(chosen.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const existing = preview.data?.existing;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        crumbs={[{ label: 'Accounting', to: '/accounting' }, { label: 'Accruals' }]}
        title="Month-end accruals"
        description="Revenue earned but not invoiced, and vendor costs incurred without a vendor invoice. Each accrual reverses on the first day of the next period."
      />
      <p className="mb-4 text-caption text-fg-muted">
        Illustrative postings — pending accountant sign-off. Dr 1400 Unbilled revenue / Cr 4100 revenue; Dr
        5100 / Cr 2400 Accrued job costs.
      </p>
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end gap-4">
          <TextField
            label="Period end"
            type="date"
            value={periodEnd}
            onChange={(e) => changePeriod(e.target.value)}
            hint={`Reversal dated ${/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? formatDate(nextDay(periodEnd)) : '—'}`}
          />
          <div className="flex gap-2 pb-6">
            <Button variant="secondary" size="sm" onClick={() => changePeriod(previousMonthEnd(PROTO_TODAY))}>
              Last month
            </Button>
            <Button variant="secondary" size="sm" onClick={() => changePeriod(monthEnd(PROTO_TODAY))}>
              This month
            </Button>
          </div>
        </CardBody>
      </Card>

      {preview.isLoading ? (
        <StatusMessage kind="loading" title="Computing accruals…" />
      ) : (
        <Card>
          <CardHeader
            title="Review lines"
            description="Untick a line to leave it out of this run."
            actions={existing ? <Badge tone="success">{`${existing.number} posted`}</Badge> : undefined}
          />
          {lines.length === 0 ? (
            <CardBody>
              <StatusMessage
                kind="empty"
                title="Nothing to accrue"
                description="Everything done is invoiced and billed."
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto" role="region" aria-label="Accrual lines" tabIndex={0}>
              <table className="w-full text-left text-body-s">
                <caption className="sr-only">Accrual lines</caption>
                <thead>
                  <tr className="border-y border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="w-10 px-5 py-2">
                      <span className="sr-only">Include</span>
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Reference
                    </th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">
                      Amount (AED)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const k = keyOf(l);
                    return (
                      <tr key={k} className="border-b border-border-subtle last:border-0">
                        <td className="px-5 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Include ${l.reference}`}
                            checked={!excluded.has(k)}
                            disabled={!!existing}
                            onChange={(e) =>
                              setExcluded((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.delete(k);
                                else n.add(k);
                                return n;
                              })
                            }
                            className="size-4 accent-[var(--color-brand)]"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={l.kind === 'Unbilled revenue' ? 'info' : 'warning'}>{l.kind}</Badge>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[13px]">{l.reference}</td>
                        <td className="px-5 py-2.5 text-right">
                          <Money amount={l.amount} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <CardBody className="flex flex-wrap items-end justify-between gap-4 border-t border-border-subtle">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body-s">
              <dt className="text-fg-muted">Unbilled revenue</dt>
              <dd className="text-right font-medium">
                <Money amount={sum('Unbilled revenue')} />
              </dd>
              <dt className="text-fg-muted">Accrued cost</dt>
              <dd className="text-right font-medium">
                <Money amount={sum('Accrued cost')} />
              </dd>
            </dl>
            <Button
              busy={post.isPending}
              disabled={!!existing || chosen.length === 0}
              onClick={() => {
                setError(undefined);
                post.mutate(
                  { periodEnd, lines: chosen },
                  {
                    onSuccess: (run) =>
                      toast({
                        title: `${run.number} posted`,
                        body: 'Accrual and auto-reversal journals created',
                      }),
                    onError: (e) => setError(e instanceof Error ? e.message : 'Could not post'),
                  },
                );
              }}
            >
              Post accruals
            </Button>
          </CardBody>
          {error ? (
            <div className="px-5 pb-5">
              <StatusMessage kind="error" title="Cannot post" description={error} />
            </div>
          ) : null}
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Accrual runs" />
        <CardBody>
          {runs.data?.length ? (
            <ul className="divide-y divide-border-subtle">
              {runs.data.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-body-s"
                >
                  <span>
                    <span className="font-mono font-medium text-brand">{r.number}</span> · period end{' '}
                    {formatDate(r.periodEnd)} · {r.lines.length} line(s)
                  </span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-s text-fg-muted">No accrual runs yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
