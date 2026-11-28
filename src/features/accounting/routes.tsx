import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute, type ListSearch } from '@/app/routes-base';
import { AccountingPage } from './AccountingPage';
import { AccrualsPage } from './AccrualsPage';
import { BankReconciliationPage } from './BankReconciliationPage';
import { JournalDetailPage } from './JournalDetailPage';
import { PeriodClosePage } from './PeriodClosePage';
import { VatReturnPage } from './VatReturnPage';

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
    createRoute({ getParentRoute: () => parent, path: 'accounting/accruals', component: AccrualsPage }),
    createRoute({
      getParentRoute: () => parent,
      path: 'accounting/bank-reconciliation',
      component: BankReconciliationPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'accounting/vat-return', component: VatReturnPage }),
    createRoute({
      getParentRoute: () => parent,
      path: 'accounting/period-close',
      component: PeriodClosePage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'accounting/$id', component: JournalDetailPage }),
  ] as const;
}
