import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { ApprovalRecord } from '@/domain/types';
import { Badge } from '@/shared/ui/Badge';
import { Money } from '@/shared/ui/Money';
import { formatDateTime } from '@/shared/utils/format';

export interface CreditView {
  creditLimit: number;
  exposure: number;
  available: number;
  blocked: boolean;
  reasons: string[];
  customerStatus: string;
  oldestOverdueDays: number;
}

/**
 * FLOW-003 C5: credit position (AED incl. VAT) — limit, exposure, available, status, overdue.
 * Used on the sales order and the customer page. Status is always written, not colour only.
 */
export function CreditPanel({
  credit,
  override,
  title = 'Credit check',
}: {
  credit: CreditView;
  override?: ApprovalRecord;
  title?: string;
}) {
  const usedPct = credit.creditLimit > 0 ? Math.round((credit.exposure / credit.creditLimit) * 100) : 100;
  return (
    <section aria-label={title} className="space-y-3 text-body-s">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {credit.blocked ? (
          <Badge tone="danger">
            <AlertTriangle aria-hidden="true" className="size-3" />
            Blocked
          </Badge>
        ) : (
          <Badge tone="success">
            <CheckCircle2 aria-hidden="true" className="size-3" />
            Within limit
          </Badge>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-caption text-fg-muted">Credit limit</dt>
          <dd className="font-medium tabular-nums">
            <Money amount={credit.creditLimit} />
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">Exposure</dt>
          <dd className="font-medium tabular-nums">
            <Money amount={credit.exposure} />
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">Available</dt>
          <dd className={clsx('font-medium tabular-nums', credit.available < 0 && 'text-danger')}>
            <Money amount={credit.available} />
            {credit.available < 0 ? ' (over)' : ''}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-fg-muted">Customer status</dt>
          <dd className="font-medium">{credit.customerStatus}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-caption text-fg-muted">Oldest overdue invoice</dt>
          <dd className="font-medium">
            {credit.oldestOverdueDays > 0 ? `${credit.oldestOverdueDays} days past due` : 'None overdue'}
          </dd>
        </div>
      </dl>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
        role="meter"
        aria-label="Credit used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.max(0, usedPct))}
        aria-valuetext={`${usedPct}% of the credit limit used`}
      >
        <div
          className={clsx(
            'h-full rounded-full',
            usedPct > 100 ? 'bg-danger' : usedPct > 80 ? 'bg-warning' : 'bg-brand',
          )}
          style={{ width: `${Math.min(100, Math.max(2, usedPct))}%` }}
        />
      </div>
      <p className="text-caption text-fg-muted">
        {usedPct}% of the limit used (open balance + uninvoiced orders).
      </p>
      {credit.blocked ? (
        <ul className="space-y-1 rounded-lg bg-danger-subtle px-3 py-2 text-danger">
          {credit.reasons.map((r) => (
            <li key={r} className="flex items-start gap-1.5">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      ) : null}
      {override ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-caption text-fg-secondary">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Credit override <strong className="font-semibold">{override.status.toLowerCase()}</strong> ·{' '}
            {override.approverRole} · requested by {override.requestedBy}{' '}
            {formatDateTime(override.requestedAt)}
            {override.decidedBy ? ` · decided by ${override.decidedBy}` : ''}
            {override.decidedAt ? ` ${formatDateTime(override.decidedAt)}` : ''}
            {override.reason ? ` · “${override.reason}”` : ''}
          </span>
        </p>
      ) : null}
    </section>
  );
}
