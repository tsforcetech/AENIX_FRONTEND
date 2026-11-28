import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { CollectionsListPage } from './CollectionsListPage';
import { FollowUpPage } from './FollowUpPage';
import { NewCollectionPage } from './NewCollectionPage';
import { PdcRegisterPage } from './PdcRegisterPage';

export interface NewCollectionSearch {
  invoiceId?: string;
  customerId?: string;
  salesOrderId?: string;
}

function validateNewCollectionSearch(s: Record<string, unknown>): NewCollectionSearch {
  return {
    invoiceId: typeof s.invoiceId === 'string' ? s.invoiceId.slice(0, 64) : undefined,
    customerId: typeof s.customerId === 'string' ? s.customerId.slice(0, 64) : undefined,
    salesOrderId: typeof s.salesOrderId === 'string' ? s.salesOrderId.slice(0, 64) : undefined,
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
    createRoute({ getParentRoute: () => parent, path: 'collections/pdc', component: PdcRegisterPage }),
    createRoute({ getParentRoute: () => parent, path: 'collections/follow-up', component: FollowUpPage }),
  ] as const;
}
