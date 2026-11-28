import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute } from '@/app/routes-base';
import { VariancesPage } from './VariancesPage';

export function variancesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'variances',
      validateSearch: validateListSearch,
      component: VariancesPage,
    }),
  ] as const;
}
