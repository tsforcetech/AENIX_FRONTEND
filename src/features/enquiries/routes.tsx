import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { validateTypedListSearch } from '@/features/sales-orders/commercial-ui';
import { EnquiriesListPage } from './EnquiriesListPage';
import { EnquiryDetailPage } from './EnquiryDetailPage';
import { NewEnquiryPage } from './NewEnquiryPage';

export function enquiriesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'enquiries',
      validateSearch: validateTypedListSearch,
      component: EnquiriesListPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'enquiries/new', component: NewEnquiryPage }),
    createRoute({ getParentRoute: () => parent, path: 'enquiries/$id', component: EnquiryDetailPage }),
  ] as const;
}
