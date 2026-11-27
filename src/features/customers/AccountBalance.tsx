import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { CustomerBalance } from '@/domain/balances';
import { StatusBadge } from '@/shared/ui/Badge';
import { DocRef, Money } from '@/shared/ui/Money';
import { formatMoney } from '@/shared/utils/format';

/**
 * Exact customer position (prototype maths from `customerBalance`; the backend ledger is the authority).
 * Positive net balance = the customer owes us; negative = we hold more than is due (advances).
 */
export function BalanceTiles({ balance: b }: { balance: CustomerBalance }) {
  const tiles: { label: string; value: number; hint: string; tone?: 'danger' | 'success' | 'strong' }[] = [
    { label: 'Invoiced', value: b.invoiced, hint: 'Posted invoices incl. VAT' },
    { label: 'Received', value: b.received, hint: 'Receipts incl. advances' },
    { label: 'Advances', value: b.advances, hint: 'Held against sales orders' },
    {
      label: 'Outstanding',
      value: b.outstanding,
      hint: 'Invoices not yet paid',
      tone: b.outstanding > 0 ? 'danger' : undefined,
    },
    {
      label: 'Net balance',
      value: b.balance,
      hint: b.balance > 0 ? 'Customer owes us' : b.balance < 0 ? 'We owe / hold credit' : 'Settled',
      tone: 'strong',
    },
    { label: 'Not yet invoiced', value: b.notYetInvoiced, hint: 'Open sales-order value' },
    { label: 'PDC pending', value: b.pdcPending, hint: 'Cheques not yet cleared' },
  ];
  return (
    <section aria-label="Account balance" className="mb-6">
      <h2 className="mb-3 text-[15px] font-semibold text-fg">Account balance</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={clsx(
              'rounded-xl border p-4 shadow-card',
              t.tone === 'strong'
                ? 'border-transparent bg-surface-inverse text-fg-inverse'
                : 'border-border-subtle bg-surface',
            )}
          >
            <dt
              className={clsx(
                'text-caption font-medium',
                t.tone === 'strong' ? 'text-white/70' : 'text-fg-muted',
              )}
            >
              {t.label}
            </dt>
            <dd
              className={clsx(
                'mt-1.5 whitespace-nowrap text-[17px] font-semibold tabular-nums tracking-tight',
                t.tone === 'danger' && 'text-danger',
              )}
            >
              {formatMoney(t.value)}
            </dd>
            <dd
              className={clsx('mt-1 text-caption', t.tone === 'strong' ? 'text-white/70' : 'text-fg-muted')}
            >
              {t.hint}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SalesOrderBalanceTable({ balance: b }: { balance: CustomerBalance }) {
  if (b.salesOrders.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-body-s text-fg-muted">
        No sales orders for this customer yet.
      </p>
    );
  }
  const soSum = (k: 'orderValue' | 'invoiced' | 'notInvoiced' | 'received' | 'advance' | 'balance') =>
    b.salesOrders.reduce((s, o) => s + o[k], 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // Reconcile to the account: invoices not linked to a sales order (e.g. storage billing) and unallocated receipts.
  const otherInvoiced = r2(b.invoiced - soSum('invoiced'));
  const receivedOnInvoices = b.received - b.advances - b.unallocated;
  const otherReceived = r2(receivedOnInvoices - (soSum('received') - soSum('advance')));
  const extraRows = [
    ...(Math.abs(otherInvoiced) > 0.004 || Math.abs(otherReceived) > 0.004
      ? [
          {
            label: 'Invoices without a sales order',
            note: 'e.g. storage billing',
            invoiced: otherInvoiced,
            received: otherReceived,
            advance: 0,
          },
        ]
      : []),
    ...(b.unallocated > 0
      ? [
          {
            label: 'Unallocated receipts',
            note: 'not yet matched to an invoice or order',
            invoiced: 0,
            received: b.unallocated,
            advance: b.unallocated,
          },
        ]
      : []),
  ];
  const sum = (k: 'orderValue' | 'invoiced' | 'notInvoiced' | 'received' | 'advance' | 'balance') =>
    r2(
      soSum(k) +
        extraRows.reduce(
          (s, x) =>
            s +
            (k === 'invoiced'
              ? x.invoiced
              : k === 'received'
                ? x.received
                : k === 'advance'
                  ? x.advance
                  : k === 'balance'
                    ? x.invoiced - x.received
                    : 0),
          0,
        ),
    );
  const num = 'px-4 py-3 text-right tabular-nums whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-s">
        <caption className="sr-only">Balance by sales order</caption>
        <thead>
          <tr className="border-b border-border-subtle bg-canvas/60 text-caption uppercase tracking-wide text-fg-muted">
            <th scope="col" className="px-4 py-2.5 pl-5 font-medium">
              Sales order
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Order value
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Invoiced
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Not invoiced
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Received
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              of which advance
            </th>
            <th scope="col" className="px-4 py-2.5 pr-5 text-right font-medium">
              Balance due
            </th>
          </tr>
        </thead>
        <tbody>
          {b.salesOrders.map((o) => (
            <tr key={o.salesOrderId} className="border-b border-border-subtle last:border-0">
              <td className="px-4 py-3 pl-5">
                <Link to="/sales-orders/$id" params={{ id: o.salesOrderId }} className="hover:underline">
                  <DocRef>{o.number}</DocRef>
                </Link>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={o.status} />
              </td>
              <td className={num}>
                <Money amount={o.orderValue} />
              </td>
              <td className={num}>
                <Money amount={o.invoiced} />
              </td>
              <td className={clsx(num, o.notInvoiced > 0 && 'font-medium text-warning')}>
                <Money amount={o.notInvoiced} />
              </td>
              <td className={num}>
                <Money amount={o.received} />
              </td>
              <td className={num}>
                {o.advance ? <Money amount={o.advance} /> : <span className="text-fg-muted">—</span>}
              </td>
              <td
                className={clsx(
                  num,
                  'pr-5 font-semibold',
                  o.balance > 0 ? 'text-danger' : o.balance < 0 ? 'text-success' : '',
                )}
              >
                <Money amount={o.balance} />
              </td>
            </tr>
          ))}
          {extraRows.map((x) => (
            <tr key={x.label} className="border-b border-border-subtle bg-canvas/40 last:border-0">
              <td colSpan={2} className="px-4 py-3 pl-5">
                <span className="font-medium">{x.label}</span>
                <span className="block text-caption text-fg-muted">{x.note}</span>
              </td>
              <td className={num}>
                <span className="text-fg-muted">—</span>
              </td>
              <td className={num}>
                <Money amount={x.invoiced} muted={x.invoiced === 0} />
              </td>
              <td className={num}>
                <span className="text-fg-muted">—</span>
              </td>
              <td className={num}>
                <Money amount={x.received} />
              </td>
              <td className={num}>
                {x.advance ? <Money amount={x.advance} /> : <span className="text-fg-muted">—</span>}
              </td>
              <td
                className={clsx(
                  num,
                  'pr-5 font-semibold',
                  x.invoiced - x.received > 0
                    ? 'text-danger'
                    : x.invoiced - x.received < 0
                      ? 'text-success'
                      : '',
                )}
              >
                <Money amount={r2(x.invoiced - x.received)} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-canvas/60 font-semibold">
            <th scope="row" colSpan={2} className="px-4 py-3 pl-5 text-left">
              Total = net balance
            </th>
            <td className={num}>
              <Money amount={sum('orderValue')} />
            </td>
            <td className={num}>
              <Money amount={sum('invoiced')} />
            </td>
            <td className={num}>
              <Money amount={sum('notInvoiced')} />
            </td>
            <td className={num}>
              <Money amount={sum('received')} />
            </td>
            <td className={num}>
              <Money amount={sum('advance')} />
            </td>
            <td className={clsx(num, 'pr-5')}>
              <Money amount={sum('balance')} />
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="border-t border-border-subtle px-5 py-3 text-caption text-fg-muted">
        Receipts against an invoice that bills several sales orders are split across those orders in
        proportion to their invoice amounts. Negative balance = received in advance.
      </p>
    </div>
  );
}
