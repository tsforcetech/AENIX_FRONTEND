import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { ModulePlaceholder } from '@/shared/ui/ModulePlaceholder';

export function salesOrdersRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'sales-orders',
      component: () => <ModulePlaceholder title="Sales orders" />,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'sales-orders/new',
      validateSearch: (s: Record<string, unknown>) => ({
        quotationId: typeof s.quotationId === 'string' ? s.quotationId : undefined,
        enquiryId: typeof s.enquiryId === 'string' ? s.enquiryId : undefined,
        contractId: typeof s.contractId === 'string' ? s.contractId : undefined,
        customerId: typeof s.customerId === 'string' ? s.customerId : undefined,
      }),
      component: () => <ModulePlaceholder title="New sales order" />,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'sales-orders/$id',
      component: () => <ModulePlaceholder title="Sales order" />,
    }),
  ] as const;
}
