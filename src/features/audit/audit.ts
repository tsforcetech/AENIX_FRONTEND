import type { ActivityEvent, IsoDate } from '@/domain/types';
import { toCsv } from './csv';

/** X3 audit log filter (prototype; the backend audit service filters server-side later). */
export interface AuditFilter {
  entity?: ActivityEvent['entity'] | '';
  actor?: string;
  /** Inclusive dates (YYYY-MM-DD), compared on the event's calendar date. */
  from?: IsoDate;
  to?: IsoDate;
  q?: string;
}

function searchText(e: ActivityEvent): string {
  return [
    e.entityRef,
    e.action,
    e.actor,
    e.entity,
    ...(e.changes ?? []).flatMap((c) => [c.field, c.from, c.to]),
  ]
    .join(' ')
    .toLowerCase();
}

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dubai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date of a timestamp in UAE time (YYYY-MM-DD). */
export function dubaiDay(iso: string): IsoDate {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : dayFormat.format(d);
}

/** Newest first, filtered by entity type, user, date range and free text. */
export function filterActivity(events: readonly ActivityEvent[], f: AuditFilter): ActivityEvent[] {
  const q = f.q?.trim().toLowerCase();
  return events
    .filter((e) => {
      const day = dubaiDay(e.at);
      return (
        (!f.entity || e.entity === f.entity) &&
        (!f.actor || e.actor === f.actor) &&
        (!f.from || day >= f.from) &&
        (!f.to || day <= f.to) &&
        (!q || searchText(e).includes(q))
      );
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function formatChanges(e: Pick<ActivityEvent, 'changes'>): string {
  return (e.changes ?? []).map((c) => `${c.field}: ${c.from || '—'} → ${c.to || '—'}`).join('; ');
}

export function activityCsv(events: readonly ActivityEvent[]): string {
  return toCsv(
    ['When', 'User', 'Entity type', 'Reference', 'Action', 'Changes'],
    events.map((e) => [e.at, e.actor, e.entity, e.entityRef, e.action, formatChanges(e)]),
  );
}
