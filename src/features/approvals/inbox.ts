import type { ApprovalDocType, ApprovalRequest, ApprovalRule } from '@/domain/types';

/** X2 approvals inbox — pure filtering (prototype; the backend filters server-side later). */
export type ApprovalTab = ApprovalRequest['record']['status'];
export const APPROVAL_TABS: readonly ApprovalTab[] = ['Pending', 'Approved', 'Rejected'];

export const APPROVER_ROLES: readonly ApprovalRule['approverRole'][] = [
  'Sales manager',
  'Operations manager',
  'Finance manager',
  'General manager',
];

export const APPROVAL_DOC_TYPES: readonly ApprovalDocType[] = [
  'Quotation discount %',
  'Quotation margin % below',
  'Credit override',
  'Sales order change',
  'Purchase order',
  'Vendor invoice variance',
  'Payment voucher',
  'Stock adjustment (qty)',
  'Variance outcome',
  'Write-off',
  'Credit note',
  'Expense',
];

export interface ApprovalFilter {
  status: ApprovalTab;
  docType?: ApprovalDocType | '';
  role?: string;
}

export interface ApprovalInbox {
  rows: ApprovalRequest[];
  counts: Record<ApprovalTab, number>;
  /** Pending requests per approver role (summary at the top of the inbox). */
  pendingByRole: { role: string; count: number }[];
  pendingAmount: number;
}

export function buildInbox(requests: readonly ApprovalRequest[], filter: ApprovalFilter): ApprovalInbox {
  const scoped = requests.filter(
    (r) =>
      (!filter.docType || r.docType === filter.docType) &&
      (!filter.role || r.record.approverRole === filter.role),
  );
  const counts: Record<ApprovalTab, number> = { Pending: 0, Approved: 0, Rejected: 0 };
  for (const r of scoped) counts[r.record.status] += 1;
  const pending = requests.filter((r) => r.record.status === 'Pending');
  const byRole = new Map<string, number>();
  for (const r of pending) byRole.set(r.record.approverRole, (byRole.get(r.record.approverRole) ?? 0) + 1);
  const rows = scoped
    .filter((r) => r.record.status === filter.status)
    .sort((a, b) =>
      filter.status === 'Pending'
        ? a.record.requestedAt.localeCompare(b.record.requestedAt)
        : (b.record.decidedAt ?? '').localeCompare(a.record.decidedAt ?? ''),
    );
  return {
    rows,
    counts,
    pendingByRole: [...byRole.entries()].map(([role, count]) => ({ role, count })),
    pendingAmount: Math.round(pending.reduce((s, r) => s + (r.amount ?? 0), 0) * 100) / 100,
  };
}

/** A rejection must say why; an approval note is optional. */
export function decisionError(decision: 'Approved' | 'Rejected', reason: string): string | undefined {
  if (decision === 'Rejected' && reason.trim().length < 5)
    return 'Write the reason for rejecting (at least 5 characters).';
  return undefined;
}
