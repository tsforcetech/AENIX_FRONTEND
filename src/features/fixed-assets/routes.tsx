import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { FixedAssetsPage } from './FixedAssetsPage';

export function fixedAssetsRoutes(parent: AppParentRoute) {
  return [
    createRoute({ getParentRoute: () => parent, path: 'fixed-assets', component: FixedAssetsPage }),
  ] as const;
}
