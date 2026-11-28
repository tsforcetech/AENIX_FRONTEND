import { createRoute } from '@tanstack/react-router';
import { validateListSearch, type AppParentRoute, type ListSearch } from '@/app/routes-base';
import { VARIANCE_SOURCES } from './api';
import { VarianceDetailPage } from './VarianceDetailPage';
import { VariancesPage } from './VariancesPage';

export interface VarianceSearch extends ListSearch {
  source?: (typeof VARIANCE_SOURCES)[number];
  customerId?: string;
}

function validateVarianceSearch(s: Record<string, unknown>): VarianceSearch {
  return {
    ...validateListSearch(s),
    source: VARIANCE_SOURCES.find((x) => x === s.source),
    customerId: typeof s.customerId === 'string' && s.customerId ? s.customerId.slice(0, 40) : undefined,
  };
}

export function variancesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'variances',
      validateSearch: validateVarianceSearch,
      component: VariancesPage,
    }),
    createRoute({ getParentRoute: () => parent, path: 'variances/$id', component: VarianceDetailPage }),
  ] as const;
}
