import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import type { ApprovalDocType } from '@/domain/types';
import { ApprovalsPage } from './ApprovalsPage';
import { APPROVAL_DOC_TYPES, APPROVAL_TABS, APPROVER_ROLES, type ApprovalTab } from './inbox';

export interface ApprovalsSearch {
  status?: ApprovalTab;
  type?: ApprovalDocType;
  role?: string;
}

function validateApprovalsSearch(search: Record<string, unknown>): ApprovalsSearch {
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  const status = pick(search.status, APPROVAL_TABS);
  return {
    status: status === 'Pending' ? undefined : status,
    type: pick(search.type, APPROVAL_DOC_TYPES),
    role: pick(search.role, APPROVER_ROLES),
  };
}

export function approvalsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'approvals',
      validateSearch: validateApprovalsSearch,
      component: ApprovalsPage,
    }),
  ] as const;
}
