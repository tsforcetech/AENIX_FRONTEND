import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute, type ListSearch } from '@/app/routes-base';
import { WarehousePage } from './WarehousePage';

export interface WarehouseSearch extends ListSearch {
  view?: 'movements' | 'inbound' | 'outbound' | 'customers';
}

function validateWarehouseSearch(s: Record<string, unknown>): WarehouseSearch {
  return {
    ...validateListSearch(s),
    view:
      s.view === 'movements' || s.view === 'inbound' || s.view === 'outbound' || s.view === 'customers'
        ? s.view
        : undefined,
  };
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
