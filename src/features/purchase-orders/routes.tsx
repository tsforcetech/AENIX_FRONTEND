import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { PurchaseOrderDetailPage } from './PurchaseOrderDetailPage';
import { PurchaseOrdersListPage } from './PurchaseOrdersListPage';

export function purchaseOrdersRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'purchase-orders',
      validateSearch: validateListSearch,
      component: PurchaseOrdersListPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'purchase-orders/$id',
      component: PurchaseOrderDetailPage,
    }),
  ] as const;
}
