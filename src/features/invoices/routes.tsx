import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { InvoiceDetailPage } from './InvoiceDetailPage';
import { InvoicesListPage } from './InvoicesListPage';

export function invoicesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'invoices',
      validateSearch: validateListSearch,
      component: InvoicesListPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'invoices/$id', component: InvoiceDetailPage }),
  ] as const;
}
