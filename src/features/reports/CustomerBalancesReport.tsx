import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader } from '@/shared/ui/Card';
import { Money } from '@/shared/ui/Money';
import type { ReportsData } from './api';

type Row = ReportsData['customerBalances'][number];
type SortKey = 'name' | 'invoiced' | 'received' | 'advances' | 'outstanding' | 'notYetInvoiced' | 'balance';

const COLS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Customer', numeric: false },
  { key: 'invoiced', label: 'Invoiced', numeric: true },
  { key: 'received', label: 'Received', numeric: true },
  { key: 'advances', label: 'Advances', numeric: true },
  { key: 'outstanding', label: 'Outstanding', numeric: true },
  { key: 'notYetInvoiced', label: 'Not yet invoiced', numeric: true },
  { key: 'balance', label: 'Net balance', numeric: true },
];

/** Every customer's exact position from the shared balance model (sortable; defaults to highest net balance). */
export function CustomerBalancesReport({ rows }: { rows: Row[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'balance', desc: true });
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    const cmp =
      typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sort.desc ? -cmp : cmp;
  });
  const total = (k: Exclude<SortKey, 'name'>) => rows.reduce((s, r) => s + r[k], 0);
  return (
    <Card>
      <CardHeader
        title="Customer balances"
        description="Exact position per customer: invoiced, received (incl. advances), outstanding and net balance · sample data"
      />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-body-s">
          <caption className="sr-only">Customer balances</caption>
          <thead>
            <tr className="border-b border-border-subtle bg-canvas/60 text-caption uppercase tracking-wide text-fg-muted">
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                    className={clsx(
                      'px-4 py-2.5 font-medium first:pl-5 last:pr-5',
                      c.numeric && 'text-right',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.numeric }))
                      }
                      className={clsx(
                        'inline-flex items-center gap-1 uppercase hover:text-fg',
                        active && 'text-fg',
                      )}
                    >
                      {c.label}
                      {active ? (
                        sort.desc ? (
                          <ArrowDown aria-hidden="true" className="size-3" />
                        ) : (
                          <ArrowUp aria-hidden="true" className="size-3" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 pl-5">
                  <Link
                    to="/customers/$id"
                    params={{ id: r.id }}
                    className="font-medium hover:text-brand hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span className="block text-caption text-fg-muted">
                    {r.code} · ledger <span className="font-mono">{r.ledgerCode}</span>
                  </span>
                </td>
                {(['invoiced', 'received', 'advances', 'outstanding', 'notYetInvoiced'] as const).map((k) => (
                  <td key={k} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    <Money amount={r[k]} muted={r[k] === 0} />
                  </td>
                ))}
                <td
                  className={clsx(
                    'whitespace-nowrap px-4 py-3 pr-5 text-right font-semibold tabular-nums',
                    r.balance > 0 ? 'text-fg' : r.balance < 0 ? 'text-success' : 'text-fg-muted',
                  )}
                >
                  <Money amount={r.balance} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-canvas/60 font-semibold">
              <th scope="row" className="px-4 py-3 pl-5 text-left">
                Total ({rows.length} customers)
              </th>
              {(
                ['invoiced', 'received', 'advances', 'outstanding', 'notYetInvoiced', 'balance'] as const
              ).map((k) => (
                <td key={k} className="whitespace-nowrap px-4 py-3 text-right tabular-nums last:pr-5">
                  <Money amount={total(k)} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-border-subtle px-5 py-3 text-caption text-fg-muted">
        Net balance = outstanding invoices − advances and unallocated receipts. Positive = customer owes
        AENIX; negative = credit held for the customer. PDC cheques count once cleared.
      </p>
    </Card>
  );
}
