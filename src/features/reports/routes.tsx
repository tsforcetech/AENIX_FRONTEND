import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { ReportsPage } from './ReportsPage';

export function reportsRoutes(parent: AppParentRoute) {
  return [createRoute({ getParentRoute: () => parent, path: 'reports', component: ReportsPage })] as const;
}
