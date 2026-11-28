import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { FleetPage } from './FleetPage';

export function fleetRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'fleet',
      validateSearch: validateListSearch,
      component: FleetPage,
    }),
  ] as const;
}
