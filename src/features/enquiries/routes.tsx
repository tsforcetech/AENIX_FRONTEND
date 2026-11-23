import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { EnquiriesListPage } from './EnquiriesListPage';
import { EnquiryDetailPage } from './EnquiryDetailPage';
import { NewEnquiryPage } from './NewEnquiryPage';

export function enquiriesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'enquiries',
      validateSearch: validateListSearch,
      component: EnquiriesListPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'enquiries/new', component: NewEnquiryPage }),
    createRoute({ getParentRoute: () => parent, path: 'enquiries/$id', component: EnquiryDetailPage }),
  ] as const;
}
