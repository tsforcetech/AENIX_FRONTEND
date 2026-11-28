/**
 * A6 collections follow-up (prototype rules; owner to confirm the reminder ladder).
 * Overdue invoices are grouped by days past due; the next reminder level follows the last one sent;
 * a customer with any invoice more than `holdAfterDays` overdue is flagged "Credit hold suggested".
 */
export type AgeingBucket = '1–30 days' | '31–60 days' | '61–90 days' | '90+ days';
export const AGEING_BUCKETS: readonly AgeingBucket[] = ['1–30 days', '31–60 days', '61–90 days', '90+ days'];

export function ageingBucket(daysOverdue: number): AgeingBucket | undefined {
  if (daysOverdue <= 0) return undefined;
  if (daysOverdue <= 30) return '1–30 days';
  if (daysOverdue <= 60) return '31–60 days';
  if (daysOverdue <= 90) return '61–90 days';
  return '90+ days';
}

export function nextReminderLevel(sent: readonly { level: 1 | 2 | 3 }[] | undefined): 1 | 2 | 3 {
  const last = Math.max(0, ...(sent ?? []).map((r) => r.level));
  return (Math.min(3, last + 1) as 1 | 2 | 3) || 1;
}

export interface FollowUpInvoice {
  customerId: string;
  daysOverdue: number;
  outstandingAed: number;
}

export function creditHoldSuggestions(
  rows: readonly FollowUpInvoice[],
  holdAfterDays = 30,
): Map<string, { maxDays: number; overdue: number }> {
  const out = new Map<string, { maxDays: number; overdue: number }>();
  for (const r of rows) {
    if (r.daysOverdue <= 0) continue;
    const cur = out.get(r.customerId) ?? { maxDays: 0, overdue: 0 };
    cur.maxDays = Math.max(cur.maxDays, r.daysOverdue);
    cur.overdue = Math.round((cur.overdue + r.outstandingAed) * 100) / 100;
    out.set(r.customerId, cur);
  }
  for (const [k, v] of out) if (v.maxDays <= holdAfterDays) out.delete(k);
  return out;
}
