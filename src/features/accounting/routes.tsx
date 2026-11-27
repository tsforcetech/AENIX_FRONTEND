import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute, type ListSearch } from '@/app/routes-base';
import { AccountingPage } from './AccountingPage';
import { JournalDetailPage } from './JournalDetailPage';

export interface AccountingSearch extends ListSearch {
  view?: 'trial-balance' | 'accounts';
}

function validateAccountingSearch(s: Record<string, unknown>): AccountingSearch {
  return {
    ...validateListSearch(s),
    view: s.view === 'trial-balance' || s.view === 'accounts' ? s.view : undefined,
  };
}

export function accountingRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'accounting',
      validateSearch: validateAccountingSearch,
      component: AccountingPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'accounting/$id', component: JournalDetailPage }),
  ] as const;
}
