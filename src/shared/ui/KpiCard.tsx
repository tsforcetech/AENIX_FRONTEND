import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel = 'vs last month',
  trend,
  icon,
  positiveIsGood = true,
  footnote,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  deltaLabel?: string;
  trend?: number[];
  icon?: ReactNode;
  positiveIsGood?: boolean;
  footnote?: ReactNode;
}) {
  const up = (delta ?? 0) >= 0;
  const good = up === positiveIsGood;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border-subtle bg-surface p-5 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-s font-medium text-fg-muted">{label}</p>
        {icon ? (
          <span className="grid size-8 place-items-center rounded-lg bg-brand-subtle text-brand [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[26px] font-semibold leading-8 tracking-tight tabular-nums text-fg">
            {value}
          </p>
          {delta !== undefined ? (
            <p className="mt-1.5 flex items-center gap-1 whitespace-nowrap text-caption text-fg-muted">
              <span
                className={clsx(
                  'inline-flex items-center gap-0.5 font-semibold',
                  good ? 'text-success' : 'text-danger',
                )}
              >
                {up ? (
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                ) : (
                  <ArrowDownRight aria-hidden="true" className="size-3.5" />
                )}
                {Math.abs(delta)}%
              </span>
              {deltaLabel}
            </p>
          ) : null}
          {footnote ? <p className="mt-1.5 whitespace-nowrap text-caption">{footnote}</p> : null}
        </div>
        {trend ? (
          <Sparkline
            values={trend}
            label={`${label} trend: ${trend.join(', ')}`}
            className="hidden h-9 w-20 shrink-1 sm:block"
          />
        ) : null}
      </div>
    </div>
  );
}
