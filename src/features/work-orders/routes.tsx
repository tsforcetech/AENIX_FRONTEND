import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { NewWorkOrderPage } from './NewWorkOrderPage';
import { WorkOrderDetailPage } from './WorkOrderDetailPage';
import { WorkOrdersListPage } from './WorkOrdersListPage';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export function workOrdersRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'work-orders',
      validateSearch: validateListSearch,
      component: WorkOrdersListPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'work-orders/new',
      validateSearch: (s: Record<string, unknown>) => ({
        customerId: str(s.customerId),
        quotationId: str(s.quotationId),
        contractId: str(s.contractId),
        salesOrderId: str(s.salesOrderId),
      }),
      component: NewWorkOrderPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'work-orders/$id', component: WorkOrderDetailPage }),
  ] as const;
}
