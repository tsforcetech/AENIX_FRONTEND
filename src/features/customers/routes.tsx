import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { CustomerDetailPage } from './CustomerDetailPage';
import { CustomersListPage } from './CustomersListPage';
import { NewCustomerPage } from './NewCustomerPage';

export function customersRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'customers',
      validateSearch: validateListSearch,
      component: CustomersListPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'customers/new', component: NewCustomerPage }),
    createRoute({ getParentRoute: () => parent, path: 'customers/$id', component: CustomerDetailPage }),
  ] as const;
}
