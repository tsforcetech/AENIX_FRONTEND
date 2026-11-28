import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { MasterListPage } from './MasterListPage';
import { MastersPage } from './MastersPage';
import { WarehousesMasterPage } from './WarehousesMasterPage';

export function mastersRoutes(parent: AppParentRoute) {
  return [
    createRoute({ getParentRoute: () => parent, path: 'masters', component: MastersPage }),
    // FLOW-003 M1: warehouses (sites) master — static path wins over $key.
    createRoute({
      getParentRoute: () => parent,
      path: 'masters/warehouses',
      component: WarehousesMasterPage,
    }),
    // FLOW-003 M1: generic master list driven by config.ts.
    createRoute({ getParentRoute: () => parent, path: 'masters/$key', component: MasterListPage }),
  ] as const;
}
