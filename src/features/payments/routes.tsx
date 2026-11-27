import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { ModulePlaceholder } from '@/shared/ui/ModulePlaceholder';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export function paymentsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'payments',
      validateSearch: validateListSearch,
      component: () => <ModulePlaceholder title="Payments" />,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'payments/new',
      validateSearch: (s: Record<string, unknown>): { vendorId?: string; billId?: string } => ({
        vendorId: str(s.vendorId),
        billId: str(s.billId),
      }),
      component: () => <ModulePlaceholder title="New payment" />,
    }),
  ] as const;
}
