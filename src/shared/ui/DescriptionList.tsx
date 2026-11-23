import type { ReactNode } from 'react';

export function DescriptionList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 2 | 3;
}) {
  return (
    <dl className={`grid gap-x-6 gap-y-4 sm:grid-cols-2 ${columns === 3 ? 'lg:grid-cols-3' : ''}`}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-caption font-medium uppercase tracking-wide text-fg-muted">{it.label}</dt>
          <dd className="mt-1 break-words text-body-s text-fg">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
