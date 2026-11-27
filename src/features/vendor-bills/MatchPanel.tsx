import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/shared/ui/Card';
import { Money } from '@/shared/ui/Money';
import type { ThreeWayMatch } from './api';

/** 3-way match: purchase order vs proof of work (GRN / POD) vs vendor invoice. */
export function MatchPanel({ match, poNumber }: { match: ThreeWayMatch; poNumber: string }) {
  return (
    <Card>
      <CardHeader
        title="3-way match"
        description={`${poNumber} vs proof of work vs vendor invoice`}
        actions={
          <span
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold',
              match.ok ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger',
            )}
          >
            {match.ok ? (
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
            ) : (
              <AlertTriangle aria-hidden="true" className="size-3.5" />
            )}
            {match.ok ? 'Matched' : 'Needs review'}
          </span>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-caption text-fg-muted">1 · Purchase order (net)</p>
            <Money amount={match.poAmount} className="mt-1 block text-[20px] font-semibold" />
          </div>
          <div className={clsx('rounded-xl p-4', match.proofOk ? 'bg-success-subtle' : 'bg-danger-subtle')}>
            <p className="text-caption text-fg-muted">2 · Proof of work</p>
            <p
              className={clsx(
                'mt-1 text-[17px] font-semibold',
                match.proofOk ? 'text-success' : 'text-danger',
              )}
            >
              {match.proofOk ? 'Complete' : `${match.proof.filter((p) => !p.ok).length} open item(s)`}
            </p>
          </div>
          <div className={clsx('rounded-xl p-4', match.amountOk ? 'bg-success-subtle' : 'bg-warning-subtle')}>
            <p className="text-caption text-fg-muted">3 · Vendor invoice (net)</p>
            <Money amount={match.invoiceAmount} className="mt-1 block text-[20px] font-semibold" />
            {!match.amountOk ? (
              <p className="text-caption font-medium text-warning">
                {match.difference > 0 ? '+' : ''}
                <Money amount={match.difference} /> vs PO
              </p>
            ) : (
              <p className="text-caption text-success">Same as PO</p>
            )}
          </div>
        </div>
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {match.proof.map((p) => (
            <li key={p.label} className="flex items-center gap-3 px-3 py-2 text-body-s">
              {p.ok ? (
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
              ) : (
                <XCircle aria-hidden="true" className="size-4 shrink-0 text-danger" />
              )}
              <span className="font-medium">{p.label}</span>
              <span className="ml-auto text-caption text-fg-muted">
                {p.detail}
                <span className="sr-only">{p.ok ? ' — ok' : ' — open'}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
