import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute, type ListSearch } from '@/app/routes-base';
import type { Expense } from '@/domain/types';
import { ExpensesPage } from './ExpensesPage';

export interface ExpensesSearch extends ListSearch {
  paidFrom?: Expense['paidFrom'];
  accountId?: string;
}

const PAID_FROM: Expense['paidFrom'][] = ['Bank', 'Petty cash', 'Credit card'];

function validateExpensesSearch(s: Record<string, unknown>): ExpensesSearch {
  return {
    ...validateListSearch(s),
    paidFrom: PAID_FROM.find((p) => p === s.paidFrom),
    accountId: typeof s.accountId === 'string' && s.accountId ? s.accountId.slice(0, 64) : undefined,
  };
}

export function expensesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'expenses',
      validateSearch: validateExpensesSearch,
      component: ExpensesPage,
    }),
  ] as const;
}
