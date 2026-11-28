import { createMemoryHistory, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { LoginPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { enquiriesRoutes } from '@/features/enquiries/routes';
import { quotationsRoutes } from '@/features/quotations/routes';
import { salesOrdersRoutes } from '@/features/sales-orders/routes';
import { purchaseOrdersRoutes } from '@/features/purchase-orders/routes';
import { paymentsRoutes } from '@/features/payments/routes';
import { contractsRoutes } from '@/features/contracts/routes';
import { workOrdersRoutes } from '@/features/work-orders/routes';
import { warehouseRoutes } from '@/features/warehouse/routes';
import { storageBillingRoutes } from '@/features/storage-billing/routes';
import { invoicesRoutes } from '@/features/invoices/routes';
import { vendorBillsRoutes } from '@/features/vendor-bills/routes';
import { collectionsRoutes } from '@/features/collections/routes';
import { accountingRoutes } from '@/features/accounting/routes';
import { customersRoutes } from '@/features/customers/routes';
import { vendorsRoutes } from '@/features/vendors/routes';
import { servicesRoutes } from '@/features/services/routes';
import { reportsRoutes } from '@/features/reports/routes';
import { settingsRoutes } from '@/features/settings/routes';
import { portalRoutes } from '@/features/portal/routes';
import { fleetRoutes } from '@/features/fleet/routes';
import { approvalsRoutes } from '@/features/approvals/routes';
import { auditRoutes } from '@/features/audit/routes';
import { variancesRoutes } from '@/features/variances/routes';
import { expensesRoutes } from '@/features/expenses/routes';
import { fixedAssetsRoutes } from '@/features/fixed-assets/routes';
import { appLayoutRoute, rootRoute } from './routes-base';

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/home' });
  },
});

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: 'login', component: LoginPage });
const homeRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: 'home', component: HomePage });

const p = appLayoutRoute;
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  appLayoutRoute.addChildren([
    homeRoute,
    ...enquiriesRoutes(p),
    ...quotationsRoutes(p),
    ...salesOrdersRoutes(p),
    ...purchaseOrdersRoutes(p),
    ...paymentsRoutes(p),
    ...contractsRoutes(p),
    ...workOrdersRoutes(p),
    ...warehouseRoutes(p),
    ...storageBillingRoutes(p),
    ...invoicesRoutes(p),
    ...vendorBillsRoutes(p),
    ...collectionsRoutes(p),
    ...accountingRoutes(p),
    ...customersRoutes(p),
    ...vendorsRoutes(p),
    ...servicesRoutes(p),
    ...reportsRoutes(p),
    ...settingsRoutes(p),
    ...portalRoutes(p),
    ...fleetRoutes(p),
    ...approvalsRoutes(p),
    ...auditRoutes(p),
    ...variancesRoutes(p),
    ...expensesRoutes(p),
    ...fixedAssetsRoutes(p),
  ]),
]);

// The shareable single-file preview runs in a sandboxed frame whose URL is not the app's, so it routes in memory.
const history =
  import.meta.env.VITE_ROUTER_HISTORY === 'memory'
    ? createMemoryHistory({ initialEntries: ['/login'] })
    : undefined;

export const router = createRouter({ routeTree, history, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
