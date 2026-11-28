import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ActivityEvent } from '@/domain/types';
import { latency, protoDb } from '@/prototype/store';
import { activityCsv, filterActivity, type AuditFilter } from './audit';

/**
 * X3 audit log. PROTOTYPE ADAPTER over the in-memory activity stream; the real audit trail is
 * written and queried by the backend (append-only, server time).
 */
export const AUDIT_PAGE_SIZE = 20;

export interface AuditPage {
  items: ActivityEvent[];
  total: number;
  page: number;
  pageSize: number;
  actors: string[];
  entities: ActivityEvent['entity'][];
}

function build(filter: AuditFilter, page: number): AuditPage {
  const events = protoDb.get().activity;
  const rows = filterActivity(events, filter);
  const p = Math.max(1, Math.min(page, Math.ceil(rows.length / AUDIT_PAGE_SIZE) || 1));
  return {
    items: rows.slice((p - 1) * AUDIT_PAGE_SIZE, p * AUDIT_PAGE_SIZE),
    total: rows.length,
    page: p,
    pageSize: AUDIT_PAGE_SIZE,
    actors: [...new Set(events.map((e) => e.actor))].sort(),
    entities: [...new Set(events.map((e) => e.entity))].sort(),
  };
}

export function useAuditLog(filter: AuditFilter, page: number) {
  return useQuery({
    queryKey: ['audit', filter, page],
    queryFn: () => latency(build(filter, page)),
    placeholderData: keepPreviousData,
  });
}

/** CSV of the whole filtered view (not only the current page). */
export function exportAuditCsv(filter: AuditFilter): Promise<string> {
  return latency(activityCsv(filterActivity(protoDb.get().activity, filter)), 80);
}
