import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { ApprovalsPage } from './ApprovalsPage';

export function approvalsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'approvals',
      validateSearch: validateListSearch,
      component: ApprovalsPage,
    }),
  ] as const;
}
