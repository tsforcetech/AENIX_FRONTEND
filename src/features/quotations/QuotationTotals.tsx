import clsx from 'clsx';
import { Money } from '@/shared/ui/Money';
import type { totals } from './api';

/** Subtotal / VAT / total plus internal cost & margin (staff only — never shown to customers). */
export function QuotationTotals({
  t,
  showMargin = true,
}: {
  t: ReturnType<typeof totals>;
  showMargin?: boolean;
}) {
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 text-body-s">
      <div className="flex justify-between">
        <dt className="text-fg-muted">Subtotal</dt>
        <dd>
          <Money amount={t.subtotal} />
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-fg-muted">VAT 5%</dt>
        <dd>
          <Money amount={t.vat} />
        </dd>
      </div>
      <div className="flex justify-between border-t border-border-subtle pt-2 text-[15px] font-semibold">
        <dt>Total</dt>
        <dd>
          <Money amount={t.total} />
        </dd>
      </div>
      {showMargin ? (
        <div className="mt-2 flex flex-wrap justify-between gap-x-2 rounded-lg bg-canvas px-3 py-2 text-caption">
          <dt className="text-fg-muted">
            Cost <Money amount={t.cost} /> · margin
          </dt>
          <dd className={clsx('font-semibold', t.marginPct < 15 ? 'text-warning' : 'text-success')}>
            <Money amount={t.margin} /> ({t.marginPct}%)
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
