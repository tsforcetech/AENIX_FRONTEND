import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { NewPaymentPage } from './NewPaymentPage';
import { PaymentsListPage } from './PaymentsListPage';
import { PaymentVoucherPage } from './PaymentVoucherPage';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export function paymentsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'payments',
      validateSearch: validateListSearch,
      component: PaymentsListPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'payments/new',
      validateSearch: (s: Record<string, unknown>): { vendorId?: string; billId?: string } => ({
        vendorId: str(s.vendorId),
        billId: str(s.billId),
      }),
      component: NewPaymentPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'payments/$id', component: PaymentVoucherPage }),
  ] as const;
}
