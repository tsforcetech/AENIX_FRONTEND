import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute, type ListSearch } from '@/app/routes-base';
import { WarehousePage } from './WarehousePage';

export interface WarehouseSearch extends ListSearch {
  view?: 'movements';
}

function validateWarehouseSearch(s: Record<string, unknown>): WarehouseSearch {
  return { ...validateListSearch(s), view: s.view === 'movements' ? 'movements' : undefined };
}

export function warehouseRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'warehouse',
      validateSearch: validateWarehouseSearch,
      component: WarehousePage,
    }),
  ] as const;
}
