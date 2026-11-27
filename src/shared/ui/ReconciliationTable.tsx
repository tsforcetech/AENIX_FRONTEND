import clsx from 'clsx';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ReconResult } from '@/domain/reconcile';
import { StatusBadge } from './Badge';

/**
 * Side-by-side comparison: PL vs GRN (inbound) or customer request vs POD (outbound).
 * Status is shown as text + colour, never colour alone.
 */
export function ReconciliationTable({
  result,
  expectedLabel,
  actualLabel,
  caption,
}: {
  result: ReconResult;
  expectedLabel: string;
  actualLabel: string;
  caption: string;
}) {
  return (
    <div className="space-y-3">
      <div
        role="status"
        className={clsx(
          'flex items-start gap-2 rounded-lg px-3 py-2.5 text-body-s',
          result.ok ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger',
        )}
      >
        {result.ok ? (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        ) : (
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        )}
        <span>
          {result.ok
            ? `All lines match — ${result.actualTotal} of ${result.expectedTotal} units.`
            : `${result.mismatches} ${result.mismatches === 1 ? 'line needs' : 'lines need'} attention — ${expectedLabel}: ${result.expectedTotal}, ${actualLabel}: ${result.actualTotal}.`}
        </span>
      </div>
      <div
        className="overflow-x-auto rounded-lg border border-border-subtle"
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table className="w-full text-left text-body-s">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border-subtle bg-canvas text-caption uppercase tracking-wide text-fg-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                SKU / item
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {expectedLabel}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {actualLabel}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Damaged
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Variance
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr
                key={r.sku}
                className={clsx(
                  'border-b border-border-subtle last:border-0 align-top',
                  r.status !== 'Match' && 'bg-danger-subtle/40',
                )}
              >
                <td className="px-3 py-2.5">
                  <span className="block font-mono text-[13px] font-medium">{r.sku}</span>
                  <span className="block text-caption text-fg-muted">{r.description}</span>
                  {r.remarks ? (
                    <span className="mt-0.5 block text-caption text-fg-secondary">“{r.remarks}”</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.expected} <span className="text-caption text-fg-muted">{r.uom}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.actual}</td>
                <td
                  className={clsx(
                    'px-3 py-2.5 text-right tabular-nums',
                    r.damaged > 0 && 'font-semibold text-danger',
                  )}
                >
                  {r.damaged || '—'}
                </td>
                <td
                  className={clsx(
                    'px-3 py-2.5 text-right font-semibold tabular-nums',
                    r.variance === 0 ? 'text-fg-muted' : 'text-danger',
                  )}
                >
                  {r.variance > 0 ? `+${r.variance}` : r.variance}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={r.damaged > 0 && r.status === 'Match' ? 'Damaged' : r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
