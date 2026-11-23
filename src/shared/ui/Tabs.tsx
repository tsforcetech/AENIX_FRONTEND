import clsx from 'clsx';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

/** Underline tabs with live counts — used for status filters on list pages. */
export function Tabs({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mb-px flex gap-1 overflow-x-auto border-b border-border-subtle"
    >
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={clsx(
              'relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-1 text-body-s font-medium transition-colors',
              active ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span
                className={clsx(
                  'rounded-full px-1.5 text-caption tabular-nums',
                  active ? 'bg-brand text-brand-fg' : 'bg-surface-muted text-fg-muted',
                )}
              >
                {t.count}
              </span>
            ) : null}
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
