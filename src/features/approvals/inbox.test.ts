import type { ApprovalRequest } from '@/domain/types';
import { buildInbox, decisionError } from './inbox';

const req = (
  id: string,
  status: ApprovalRequest['record']['status'],
  over: Partial<ApprovalRequest> & { role?: string; at?: string; decidedAt?: string } = {},
): ApprovalRequest => ({
  id,
  docType: over.docType ?? 'Payment voucher',
  entity: 'Payment',
  entityId: `e-${id}`,
  entityRef: `PV-${id}`,
  summary: 'Pay vendor',
  amount: over.amount,
  record: {
    status,
    requestedBy: 'A',
    requestedAt: over.at ?? '2026-11-20T10:00:00Z',
    approverRole: over.role ?? 'Finance manager',
    decidedAt: over.decidedAt,
  },
});

describe('buildInbox', () => {
  const all = [
    req('1', 'Pending', { amount: 25000, at: '2026-11-21T10:00:00Z' }),
    req('2', 'Pending', { amount: 1000, at: '2026-11-20T10:00:00Z', role: 'Sales manager' }),
    req('3', 'Approved', { decidedAt: '2026-11-19T10:00:00Z', docType: 'Expense' }),
    req('4', 'Rejected', { decidedAt: '2026-11-22T10:00:00Z' }),
  ];

  it('lists pending oldest first with counts per tab and a summary per role', () => {
    const inbox = buildInbox(all, { status: 'Pending' });
    expect(inbox.rows.map((r) => r.id)).toEqual(['2', '1']);
    expect(inbox.counts).toEqual({ Pending: 2, Approved: 1, Rejected: 1 });
    expect(inbox.pendingAmount).toBe(26000);
    expect(inbox.pendingByRole).toEqual([
      { role: 'Finance manager', count: 1 },
      { role: 'Sales manager', count: 1 },
    ]);
  });

  it('filters by document type and approver role', () => {
    expect(buildInbox(all, { status: 'Pending', role: 'Sales manager' }).rows.map((r) => r.id)).toEqual([
      '2',
    ]);
    const exp = buildInbox(all, { status: 'Approved', docType: 'Expense' });
    expect(exp.rows.map((r) => r.id)).toEqual(['3']);
    expect(exp.counts.Pending).toBe(0);
  });
});

describe('decisionError', () => {
  it('requires a reason only for rejections', () => {
    expect(decisionError('Approved', '')).toBeUndefined();
    expect(decisionError('Rejected', 'no')).toMatch(/reason/);
    expect(decisionError('Rejected', 'Rate too high')).toBeUndefined();
  });
});
