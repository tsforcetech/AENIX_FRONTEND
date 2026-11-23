import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { CollectionsListPage } from './CollectionsListPage';
import { NewCollectionPage } from './NewCollectionPage';

export interface NewCollectionSearch {
  invoiceId?: string;
  customerId?: string;
}

function validateNewCollectionSearch(s: Record<string, unknown>): NewCollectionSearch {
  return {
    invoiceId: typeof s.invoiceId === 'string' ? s.invoiceId.slice(0, 64) : undefined,
    customerId: typeof s.customerId === 'string' ? s.customerId.slice(0, 64) : undefined,
  };
}

export function collectionsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'collections',
      validateSearch: validateListSearch,
      component: CollectionsListPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'collections/new',
      validateSearch: validateNewCollectionSearch,
      component: NewCollectionPage,
    }),
  ] as const;
}
