/**
 * FLOW-003 X2 — shared approval service (PROTOTYPE ADAPTER; backend contract API-DEP-31 pending).
 * Any module calls `requestApproval` when the approval matrix says so; the approvals inbox
 * decides; the owning module registers an `onApprovalDecided` handler to apply the effect
 * (e.g. post the payment voucher, apply the variance outcome).
 */
import type { ApprovalDocType, ApprovalRecord, ApprovalRequest, ApprovalRule } from '@/domain/types';
import { approvalRuleFor } from '@/domain/controls';
import { logActivity, newId, nowIso, protoDb } from '@/prototype/store';

type Handler = (req: ApprovalRequest) => void;
const handlers = new Map<ApprovalDocType, Handler>();

/** Owning module registers what happens when its request is approved or rejected. */
export function onApprovalDecided(docType: ApprovalDocType, handler: Handler): void {
  handlers.set(docType, handler);
}

export function currentUser(): string {
  return protoDb.get().session?.displayName ?? 'Prototype user';
}

/** Rule that applies to `value` for this document type, if any. */
export function approvalNeeded(docType: ApprovalDocType, value: number): ApprovalRule | undefined {
  return approvalRuleFor(protoDb.get().approvalRules, docType, value);
}

/** Creates a pending approval request and returns its record (store it on the document too). */
export function requestApproval(input: {
  docType: ApprovalDocType;
  rule: ApprovalRule;
  entity: ApprovalRequest['entity'];
  entityId: string;
  entityRef: string;
  summary: string;
  amount?: number;
  href?: string;
  reason?: string;
}): ApprovalRecord {
  const record: ApprovalRecord = {
    status: 'Pending',
    requestedBy: currentUser(),
    requestedAt: nowIso(),
    approverRole: input.rule.approverRole,
    reason: input.reason,
  };
  const req: ApprovalRequest = {
    id: newId('apq'),
    docType: input.docType,
    entity: input.entity,
    entityId: input.entityId,
    entityRef: input.entityRef,
    summary: input.summary,
    amount: input.amount,
    href: input.href,
    record,
  };
  protoDb.update((db) => ({
    ...db,
    approvalRequests: [
      req,
      ...db.approvalRequests.filter(
        (r) =>
          !(r.entityId === input.entityId && r.docType === input.docType && r.record.status === 'Pending'),
      ),
    ],
    notifications: [
      {
        id: newId('ntf'),
        at: nowIso(),
        title: `Approval needed: ${input.entityRef}`,
        body: `${input.docType} — ${input.summary} (${input.rule.approverRole})`,
        read: false,
        href: '/approvals',
      },
      ...db.notifications,
    ],
  }));
  logActivity({
    entity: 'Approval',
    entityId: input.entityId,
    entityRef: input.entityRef,
    action: `approval requested (${input.docType})`,
  });
  return record;
}

/** Approve or reject; runs the owning module's handler. */
export function decideApproval(
  id: string,
  decision: 'Approved' | 'Rejected',
  reason?: string,
): ApprovalRequest {
  const req = protoDb.get().approvalRequests.find((r) => r.id === id);
  if (!req) throw new Error('Approval request not found');
  if (req.record.status !== 'Pending') throw new Error('Already decided');
  const decided: ApprovalRequest = {
    ...req,
    record: {
      ...req.record,
      status: decision,
      decidedBy: currentUser(),
      decidedAt: nowIso(),
      reason: reason ?? req.record.reason,
    },
  };
  protoDb.update((db) => ({
    ...db,
    approvalRequests: db.approvalRequests.map((r) => (r.id === id ? decided : r)),
  }));
  logActivity({
    entity: 'Approval',
    entityId: req.entityId,
    entityRef: req.entityRef,
    action: `${decision.toLowerCase()} (${req.docType})`,
  });
  handlers.get(req.docType)?.(decided);
  return decided;
}

/** Latest approval request for a document (any status). */
export function approvalFor(entityId: string, docType: ApprovalDocType): ApprovalRequest | undefined {
  return protoDb.get().approvalRequests.find((r) => r.entityId === entityId && r.docType === docType);
}
