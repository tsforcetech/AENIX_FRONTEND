import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { validateTypedListSearch, type TypedListSearch } from '@/features/sales-orders/commercial-ui';
import { EnquiriesListPage } from './EnquiriesListPage';
import { EnquiryDetailPage } from './EnquiryDetailPage';
import { NewEnquiryPage } from './NewEnquiryPage';

export function enquiriesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'enquiries',
      validateSearch: (s: Record<string, unknown>): TypedListSearch & { view?: 'list' } => ({
        ...validateTypedListSearch(s),
        // Board is the default view; only `list` is kept in the URL.
        view: s.view === 'list' ? 'list' : undefined,
      }),
      component: EnquiriesListPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'enquiries/new', component: NewEnquiryPage }),
    createRoute({ getParentRoute: () => parent, path: 'enquiries/$id', component: EnquiryDetailPage }),
  ] as const;
}
