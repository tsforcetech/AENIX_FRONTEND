import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { ModulePlaceholder } from '@/shared/ui/ModulePlaceholder';

export function purchaseOrdersRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'purchase-orders',
      validateSearch: validateListSearch,
      component: () => <ModulePlaceholder title="Purchase orders" />,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'purchase-orders/$id',
      component: () => <ModulePlaceholder title="Purchase order" />,
    }),
  ] as const;
}
