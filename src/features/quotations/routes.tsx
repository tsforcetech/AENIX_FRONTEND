import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { NewQuotationPage } from './NewQuotationPage';
import { QuotationDetailPage } from './QuotationDetailPage';
import { QuotationsListPage } from './QuotationsListPage';

export function quotationsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'quotations',
      validateSearch: validateListSearch,
      component: QuotationsListPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: 'quotations/new',
      validateSearch: (s: Record<string, unknown>): { enquiryId?: string } => ({
        enquiryId: typeof s.enquiryId === 'string' ? s.enquiryId : undefined,
      }),
      component: NewQuotationPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'quotations/$id', component: QuotationDetailPage }),
  ] as const;
}
