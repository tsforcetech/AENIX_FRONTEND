import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute, type ListSearch } from '@/app/routes-base';
import { FleetPage, type FleetTab } from './FleetPage';
import { TripDetailPage } from './TripDetailPage';

const TABS: FleetTab[] = ['vehicles', 'drivers', 'trips'];

export function fleetRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'fleet',
      validateSearch: (s: Record<string, unknown>): ListSearch & { tab?: FleetTab } => ({
        ...validateListSearch(s),
        tab: TABS.includes(s.tab as FleetTab) ? (s.tab as FleetTab) : undefined,
      }),
      component: FleetPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'fleet/trips/$id', component: TripDetailPage }),
  ] as const;
}
