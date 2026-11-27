import { ModulePlaceholder } from '@/shared/ui/ModulePlaceholder';
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
    createRoute({
      getParentRoute: () => parent,
      path: 'vendor-bills/new',
      validateSearch: (s: Record<string, unknown>): { purchaseOrderId?: string } => ({
        purchaseOrderId:
          typeof s.purchaseOrderId === 'string' && s.purchaseOrderId
            ? s.purchaseOrderId.slice(0, 64)
            : undefined,
      }),
      component: () => <ModulePlaceholder title="Record vendor invoice" />,
    }),
    createRoute({ getParentRoute: () => parent, path: 'vendor-bills/$id', component: VendorBillDetailPage }),
  ] as const;
}
