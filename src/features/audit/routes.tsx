import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { AuditLogPage } from './AuditLogPage';

export function auditRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'audit',
      validateSearch: validateListSearch,
      component: AuditLogPage,
    }),
  ] as const;
}
