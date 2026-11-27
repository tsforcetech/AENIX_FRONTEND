import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { validateTypedListSearch, type TypedListSearch } from './commercial-ui';
import { NewSalesOrderPage } from './NewSalesOrderPage';
import { SalesOrderDetailPage } from './SalesOrderDetailPage';
import { SalesOrdersListPage } from './SalesOrdersListPage';

export function salesOrdersRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'sales-orders',
      validateSearch: (s: Record<string, unknown>): TypedListSearch & { billing?: 'not-invoiced' } => ({
        ...validateTypedListSearch(s),
        billing: s.billing === 'not-invoiced' ? 'not-invoiced' : undefined,
      }),
      component: SalesOrdersListPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'sales-orders/new',
      validateSearch: (
        s: Record<string, unknown>,
      ): { quotationId?: string; enquiryId?: string; contractId?: string; customerId?: string } => ({
        quotationId: typeof s.quotationId === 'string' ? s.quotationId : undefined,
        enquiryId: typeof s.enquiryId === 'string' ? s.enquiryId : undefined,
        contractId: typeof s.contractId === 'string' ? s.contractId : undefined,
        customerId: typeof s.customerId === 'string' ? s.customerId : undefined,
      }),
      component: NewSalesOrderPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'sales-orders/$id', component: SalesOrderDetailPage }),
  ] as const;
}
