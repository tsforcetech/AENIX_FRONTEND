import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { VendorBillDetailPage } from './VendorBillDetailPage';
import { VendorBillsListPage } from './VendorBillsListPage';

export function vendorBillsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'vendor-bills',
      validateSearch: validateListSearch,
      component: VendorBillsListPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'vendor-bills/$id', component: VendorBillDetailPage }),
  ] as const;
}
