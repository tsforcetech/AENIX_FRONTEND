import clsx from 'clsx';
import { EyeOff } from 'lucide-react';
import { toAed } from '@/domain/controls';
import type { Currency } from '@/domain/types';
import { formatInCurrency } from '@/features/sales-orders/commercial-api';
import { formatMoney } from '@/shared/utils/format';
import type { totals } from './api';

/**
 * Subtotal / VAT / total plus internal cost & margin (staff only — never shown to customers).
 * FLOW-003 C10: amounts in the document currency with the AED equivalent.
 */
export function QuotationTotals({
  t,
  showMargin = true,
  currency = 'AED',
  rate,
}: {
  t: ReturnType<typeof totals>;
  showMargin?: boolean;
  currency?: Currency;
  rate?: number;
}) {
  const fmt = (n: number) => (currency === 'AED' ? formatMoney(n) : formatInCurrency(n, currency));
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 text-body-s">
      <div className="flex justify-between">
        <dt className="text-fg-muted">Subtotal</dt>
        <dd className="tabular-nums">{fmt(t.subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-fg-muted">VAT 5%</dt>
        <dd className="tabular-nums">{fmt(t.vat)}</dd>
      </div>
      <div className="flex justify-between border-t border-border-subtle pt-2 text-[15px] font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums">{fmt(t.total)}</dd>
      </div>
      {currency !== 'AED' ? (
        <div className="flex justify-between text-caption text-fg-muted">
          <dt>AED equivalent (rate {rate ?? '—'})</dt>
          <dd className="tabular-nums">≈ {formatMoney(toAed(t.total, currency, rate))}</dd>
        </div>
      ) : null}
      {showMargin ? (
        <div className="mt-2 space-y-1 rounded-lg bg-canvas px-3 py-2 text-caption">
          <dt className="flex items-center gap-1 font-medium text-fg-secondary">
            <EyeOff aria-hidden="true" className="size-3.5" />
            Internal — not printed
          </dt>
          <dd className="flex justify-between gap-2">
            <span className="text-fg-muted">Estimated cost</span>
            <span className="tabular-nums">{fmt(t.cost)}</span>
          </dd>
          <dd className="flex justify-between gap-2">
            <span className="text-fg-muted">Margin</span>
            <span
              className={clsx(
                'font-semibold tabular-nums',
                t.margin < 0 ? 'text-danger' : t.marginPct < 15 ? 'text-warning' : 'text-success',
              )}
            >
              {fmt(t.margin)} ({t.marginPct}%){t.marginPct < 15 ? ' · low' : ''}
            </span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
