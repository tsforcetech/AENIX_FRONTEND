import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { ExpensesPage } from './ExpensesPage';

export function expensesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'expenses',
      validateSearch: validateListSearch,
      component: ExpensesPage,
    }),
  ] as const;
}
