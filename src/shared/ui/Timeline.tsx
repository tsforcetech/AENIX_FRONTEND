import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { Milestone } from '@/domain/types';
import { formatDateTime } from '@/shared/utils/format';

/** Vertical milestone tracker for work orders. */
export function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  return (
    <ol className="relative space-y-5">
      {milestones.map((m, i) => (
        <li key={m.id} className="relative flex gap-3">
          {i < milestones.length - 1 ? (
            <span
              aria-hidden="true"
              className={clsx(
                'absolute left-[11px] top-6 h-[calc(100%+4px)] w-0.5',
                m.status === 'Done' ? 'bg-brand' : 'bg-border-subtle',
              )}
            />
          ) : null}
          <span
            className={clsx(
              'relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2',
              m.status === 'Done' && 'border-brand bg-brand text-brand-fg',
              m.status === 'Current' && 'border-brand bg-surface',
              m.status === 'Pending' && 'border-border bg-surface',
            )}
          >
            {m.status === 'Done' ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : null}
            {m.status === 'Current' ? (
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-brand" />
            ) : null}
          </span>
          <div className="min-w-0 pb-0.5">
            <p
              className={clsx(
                'text-body-s font-medium',
                m.status === 'Pending' ? 'text-fg-muted' : 'text-fg',
              )}
            >
              {m.label}
              <span className="sr-only"> — {m.status}</span>
            </p>
            <p className="text-caption text-fg-muted">
              {m.at ? formatDateTime(m.at) : m.status === 'Current' ? 'In progress' : 'Pending'}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
