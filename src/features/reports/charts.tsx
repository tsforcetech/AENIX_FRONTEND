import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { formatMoney, formatMoneyCompact } from '@/shared/utils/format';

/** "View as table" disclosure required under every chart. */
export function ChartTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <details className="mt-4 text-caption text-fg-muted">
      <summary className="cursor-pointer select-none hover:text-fg">View as table</summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={clsx('py-1 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border-subtle">
              {r.map((c, j) => (
                <td key={j} className={clsx('py-1', j > 0 && 'text-right tabular-nums')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Single-series vertical bars (brand), hover/focus readout. */
export function MonthlyBars({ data }: { data: { month: string; revenue: number; cost: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // "Nice" axis: round the top up to the next 100K so the 4 equal steps are honest tick values.
  const max = Math.ceil(Math.max(...data.map((d) => d.revenue)) / 100000) * 100000 || 100000;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  const active = hover ?? data.length - 1;
  const cur = data[active]!;
  return (
    <div>
      <p className="mb-3 text-body-s text-fg-secondary">
        <span className="font-semibold text-fg">{cur.month}</span> · revenue{' '}
        <span className="font-semibold tabular-nums text-fg">{formatMoney(cur.revenue)}</span> · cost{' '}
        <span className="tabular-nums">{formatMoney(cur.cost)}</span>
      </p>
      <div className="relative flex h-60 gap-3 pl-12" onMouseLeave={() => setHover(null)}>
        <div aria-hidden="true" className="absolute inset-0 flex flex-col-reverse justify-between pb-6">
          {ticks.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-10 text-right text-[11px] tabular-nums text-fg-muted">
                {t ? `${t / 1000}K` : '0'}
              </span>
              <span className="h-px flex-1 bg-border-subtle" />
            </div>
          ))}
        </div>
        {data.map((d, i) => (
          <button
            key={d.month}
            type="button"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            aria-label={`${d.month}: revenue ${formatMoney(d.revenue)}`}
            className="relative z-10 flex flex-1 flex-col items-center justify-end gap-2"
          >
            <span className="flex h-[calc(100%-24px)] w-full max-w-14 items-end">
              <span
                className={clsx(
                  'w-full rounded-t-[4px] transition-colors',
                  i === active ? 'bg-brand' : 'bg-brand/25',
                )}
                style={{ height: `${(d.revenue / max) * 100}%` }}
              />
            </span>
            <span
              className={clsx('h-4 text-caption', i === active ? 'font-semibold text-fg' : 'text-fg-muted')}
            >
              {d.month}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small single-series line for margin %, own axis (no dual-axis). */
export function MarginLine({ data }: { data: { month: string; marginPct: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 320;
  const h = 200;
  const padX = 28;
  const padY = 22;
  const vals = data.map((d) => d.marginPct);
  const min = Math.floor(Math.min(...vals) - 2);
  const max = Math.ceil(Math.max(...vals) + 2);
  const x = (i: number) => padX + (i * (w - padX * 2)) / (data.length - 1);
  const y = (v: number) => h - padY - ((v - min) / (max - min)) * (h - padY * 2);
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.marginPct)}`).join(' ');
  const active = hover ?? data.length - 1;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Gross margin by month: ${data.map((p) => `${p.month} ${p.marginPct}%`).join(', ')}`}
    >
      {[min, (min + max) / 2, max].map((t) => (
        <g key={t}>
          <line x1={padX} x2={w - padX} y1={y(t)} y2={y(t)} stroke="var(--color-border-subtle)" />
          <text x={padX - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--color-fg-muted)">
            {Math.round(t)}%
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" />
      {data.map((p, i) => (
        <g key={p.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <rect x={x(i) - 20} y={0} width={40} height={h} fill="transparent" />
          <circle
            cx={x(i)}
            cy={y(p.marginPct)}
            r={i === active ? 5 : 4}
            fill="var(--color-brand)"
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
          <text
            x={x(i)}
            y={h - 4}
            textAnchor="middle"
            fontSize="11"
            fill={i === active ? 'var(--color-fg)' : 'var(--color-fg-muted)'}
          >
            {p.month}
          </text>
          {i === active ? (
            <text
              x={x(i)}
              y={y(p.marginPct) - 10}
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill="var(--color-fg)"
            >
              {p.marginPct}%
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/** Horizontal bars with direct value labels. */
export function HorizontalBars({ items }: { items: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,12rem)_1fr] items-center gap-3 text-body-s">
          <span className="min-w-0">
            <span className="block truncate font-medium">{it.label}</span>
            {it.sub ? <span className="block text-caption text-fg-muted">{it.sub}</span> : null}
          </span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 rounded-r-[4px] bg-brand"
              style={{ width: `${(it.value / max) * 80}%` }}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap text-caption font-medium tabular-nums text-fg-secondary">
              {formatMoneyCompact(it.value)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Sequential single-hue ramp (brand red, light → dark) for ordered ageing buckets. */
export const AGEING_RAMP = ['#efb8b3', '#d6726a', '#b23a30', '#7f1b14'];

export function AgeingBar({ buckets }: { buckets: { bucket: string; amount: number; count: number }[] }) {
  const total = buckets.reduce((s, b) => s + b.amount, 0) || 1;
  return (
    <div>
      <div
        className="flex h-8 gap-[2px] overflow-hidden rounded-md"
        role="img"
        aria-label={buckets.map((b) => `${b.bucket} ${formatMoney(b.amount)}`).join(', ')}
      >
        {buckets
          .filter((b) => b.amount > 0)
          .map((b) => {
            const i = buckets.indexOf(b);
            return (
              <span
                key={b.bucket}
                title={`${b.bucket}: ${formatMoney(b.amount)}`}
                style={{ width: `${(b.amount / total) * 100}%`, background: AGEING_RAMP[i] }}
              />
            );
          })}
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((b, i) => (
          <li key={b.bucket} className="rounded-lg border border-border-subtle p-3">
            <span className="flex items-center gap-2 text-caption text-fg-muted">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ background: AGEING_RAMP[i] }}
              />
              {b.bucket}
            </span>
            <span className="mt-1 block text-[18px] font-semibold tabular-nums">
              {formatMoneyCompact(b.amount)}
            </span>
            <span className="text-caption text-fg-muted">
              {b.count} invoice{b.count === 1 ? '' : 's'} · {Math.round((b.amount / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
