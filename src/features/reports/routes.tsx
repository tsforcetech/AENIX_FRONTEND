import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { ReportsPage } from './ReportsPage';
import { validateReportsSearch } from './tabs';

export function reportsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'reports',
      validateSearch: validateReportsSearch,
      component: ReportsPage,
    }),
  ] as const;
}
