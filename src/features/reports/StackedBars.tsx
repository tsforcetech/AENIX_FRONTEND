import { formatMoney } from '@/shared/utils/format';

/** Categorical slots in fixed order (validated palette; labels always shown next to colours). */
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

/**
 * Horizontal stacked bars: each row splits one total into parts (e.g. revenue → vendor cost,
 * internal cost, gross profit). Single axis, text legend, the key value written next to each bar.
 */
export function StackedBars({
  series,
  rows,
}: {
  series: string[];
  rows: { label: string; sub?: string; values: number[]; note?: string }[];
}) {
  const total = (vs: number[]) => vs.reduce((s, v) => s + Math.max(0, v), 0);
  const max = Math.max(1, ...rows.map((r) => total(r.values)));
  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-secondary" aria-label="Legend">
        {series.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: CATEGORICAL[i] }} />
            {s}
          </li>
        ))}
      </ul>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,12rem)_1fr] items-center gap-3 text-body-s">
            <span className="min-w-0">
              <span className="block truncate font-medium">{r.label}</span>
              {r.sub ? <span className="block text-caption text-fg-muted">{r.sub}</span> : null}
            </span>
            <span className="flex items-center gap-2">
              <span
                className="flex h-3 gap-[2px] overflow-hidden rounded-r-[4px]"
                style={{ width: `${(total(r.values) / max) * 80}%` }}
                role="img"
                aria-label={`${r.label}: ${series.map((s, i) => `${s} ${formatMoney(r.values[i] ?? 0)}`).join(', ')}`}
              >
                {r.values.map((v, i) =>
                  v > 0 ? (
                    <span
                      key={series[i]}
                      className="h-full"
                      style={{ flexGrow: v, background: CATEGORICAL[i] }}
                    />
                  ) : null,
                )}
              </span>
              {r.note ? (
                <span className="whitespace-nowrap text-caption font-medium tabular-nums text-fg-secondary">
                  {r.note}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Single-hue utilisation meter with the percentage written next to it (no colour-only meaning). */
export function Meter({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="flex items-center justify-end gap-2">
      <span
        className="block h-2 w-24 overflow-hidden rounded-full bg-surface-muted"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span className="block h-full rounded-full" style={{ width: `${v}%`, background: CATEGORICAL[0] }} />
      </span>
      <span className="w-12 text-right tabular-nums">{Math.round(value * 10) / 10}%</span>
    </span>
  );
}
