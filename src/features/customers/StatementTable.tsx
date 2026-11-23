import { Link } from '@tanstack/react-router';
import { Money } from '@/shared/ui/Money';
import { formatDate } from '@/shared/utils/format';
import type { StatementLine } from './statement';

/** Statement of account table (shared with the customer portal). */
export function StatementTable({
  lines,
  linkInvoices = true,
}: {
  lines: StatementLine[];
  linkInvoices?: boolean;
}) {
  const closing = lines.length ? lines[lines.length - 1]!.balance : 0;
  if (lines.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-body-s text-fg-muted">No posted invoices or receipts yet.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-body-s">
        <caption className="sr-only">Statement of account</caption>
        <thead>
          <tr className="border-b border-border-subtle bg-canvas/60">
            {['Date', 'Type', 'Reference', 'Details', 'Debit', 'Credit', 'Balance'].map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`whitespace-nowrap px-4 py-2.5 text-caption font-medium uppercase tracking-wide text-fg-muted first:pl-5 last:pr-5 ${i >= 4 ? 'text-right' : ''} ${i === 3 ? 'hidden md:table-cell' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-border-subtle last:border-0">
              <td className="whitespace-nowrap px-4 py-3 pl-5">{formatDate(l.date)}</td>
              <td className="px-4 py-3 text-fg-secondary">{l.type}</td>
              <td className="px-4 py-3">
                {l.type === 'Invoice' && linkInvoices ? (
                  <Link
                    to="/invoices/$id"
                    params={{ id: l.refId }}
                    className="font-mono text-[13px] font-medium text-brand hover:underline"
                  >
                    {l.reference}
                  </Link>
                ) : (
                  <span className="font-mono text-[13px] font-medium text-fg-secondary">{l.reference}</span>
                )}
              </td>
              <td className="hidden px-4 py-3 text-caption text-fg-muted md:table-cell">{l.description}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {l.debit ? <Money amount={l.debit} /> : <span className="text-fg-muted">—</span>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {l.credit ? <Money amount={l.credit} /> : <span className="text-fg-muted">—</span>}
              </td>
              <td className="px-4 py-3 pr-5 text-right font-medium tabular-nums">
                <Money amount={l.balance} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-canvas/60">
            <td colSpan={5} className="px-4 py-3 pl-5 text-right font-medium md:hidden">
              Closing balance
            </td>
            <td colSpan={6} className="hidden px-4 py-3 pl-5 text-right font-medium md:table-cell">
              Closing balance
            </td>
            <td className="px-4 py-3 pr-5 text-right font-semibold tabular-nums">
              <Money amount={closing} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
