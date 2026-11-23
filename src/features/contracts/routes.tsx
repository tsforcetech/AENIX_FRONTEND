import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { ContractDetailPage } from './ContractDetailPage';
import { ContractsListPage } from './ContractsListPage';

export function contractsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'contracts',
      validateSearch: validateListSearch,
      component: ContractsListPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'contracts/$id', component: ContractDetailPage }),
  ] as const;
}
