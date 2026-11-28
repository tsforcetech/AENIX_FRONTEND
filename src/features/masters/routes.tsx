import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { MastersPage } from './MastersPage';

export function mastersRoutes(parent: AppParentRoute) {
  return [createRoute({ getParentRoute: () => parent, path: 'masters', component: MastersPage })] as const;
}
