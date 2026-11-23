import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { VendorDetailPage } from './VendorDetailPage';
import { VendorsListPage } from './VendorsListPage';

export function vendorsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'vendors',
      validateSearch: validateListSearch,
      component: VendorsListPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'vendors/$id', component: VendorDetailPage }),
  ] as const;
}
