import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { CustomerApprovalsPage, CustomerInvoicesPage, CustomerPortalHome } from './CustomerPortalPages';
import { VendorAssignmentsPage, VendorBillsPage, VendorPortalHome } from './VendorPortalPages';

/** Portal routes. Party scope comes from the session only — no party ids in paths or search. */
export function portalRoutes(parent: AppParentRoute) {
  return [
    createRoute({ getParentRoute: () => parent, path: 'portal', component: CustomerPortalHome }),
    createRoute({ getParentRoute: () => parent, path: 'portal/approvals', component: CustomerApprovalsPage }),
    createRoute({ getParentRoute: () => parent, path: 'portal/invoices', component: CustomerInvoicesPage }),
    createRoute({ getParentRoute: () => parent, path: 'vendor-portal', component: VendorPortalHome }),
    createRoute({
      getParentRoute: () => parent,
      path: 'vendor-portal/assignments',
      component: VendorAssignmentsPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'vendor-portal/bills', component: VendorBillsPage }),
  ] as const;
}
