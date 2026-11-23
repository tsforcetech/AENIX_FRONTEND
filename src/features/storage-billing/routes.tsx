import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { StorageBillingPage } from './StorageBillingPage';

export function storageBillingRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'storage-billing',
      validateSearch: validateListSearch,
      component: StorageBillingPage,
    }),
  ] as const;
}
