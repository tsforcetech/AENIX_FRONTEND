import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute, type ListSearch } from '@/app/routes-base';
import { CycleCountDetailPage, CycleCountsPage } from './CycleCountsPage';
import { LocationsPage } from './LocationsPage';
import { WarehousePage } from './WarehousePage';

export interface WarehouseSearch extends ListSearch {
  view?: 'movements' | 'inbound' | 'outbound' | 'customers';
  /** Selected warehouse (site id); none = all warehouses. */
  wh?: string;
}

function validateWarehouseSearch(s: Record<string, unknown>): WarehouseSearch {
  return {
    ...validateListSearch(s),
    view:
      s.view === 'movements' || s.view === 'inbound' || s.view === 'outbound' || s.view === 'customers'
        ? s.view
        : undefined,
    wh: typeof s.wh === 'string' && /^[a-z0-9-]{1,40}$/i.test(s.wh) ? s.wh : undefined,
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
    // FLOW-003 W4: bin locations and occupancy (own warehouse floor).
    createRoute({ getParentRoute: () => parent, path: 'warehouse/locations', component: LocationsPage }),
    // FLOW-003 W8: cycle counts.
    createRoute({
      getParentRoute: () => parent,
      path: 'warehouse/cycle-counts',
      validateSearch: validateListSearch,
      component: CycleCountsPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'warehouse/cycle-counts/$id',
      component: CycleCountDetailPage,
    }),
  ] as const;
}
