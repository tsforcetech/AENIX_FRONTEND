import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { InvoiceDetailPage } from './InvoiceDetailPage';
import { InvoicesListPage } from './InvoicesListPage';
import { NewInvoicePage } from './NewInvoicePage';

export function invoicesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'invoices',
      validateSearch: validateListSearch,
      component: InvoicesListPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'invoices/new',
      validateSearch: (s: Record<string, unknown>): { customerId?: string; salesOrderId?: string } => ({
        customerId: typeof s.customerId === 'string' && s.customerId ? s.customerId.slice(0, 64) : undefined,
        salesOrderId:
          typeof s.salesOrderId === 'string' && s.salesOrderId ? s.salesOrderId.slice(0, 64) : undefined,
      }),
      component: NewInvoicePage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'invoices/$id', component: InvoiceDetailPage }),
  ] as const;
}
