import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { ServicesPage } from './ServicesPage';

export type ServicesTab = 'services' | 'buying' | 'selling';

export interface ServicesSearch {
  tab?: ServicesTab;
  /** Selling rates: '' = all, 'list' = standard price list, otherwise a customer id. */
  customerId?: string;
  /** Buying rates: filter by vendor. */
  vendorId?: string;
}

export function validateServicesSearch(s: Record<string, unknown>): ServicesSearch {
  const tab = s.tab === 'buying' || s.tab === 'selling' ? s.tab : undefined;
  const id = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,60}$/.test(v) ? v : undefined);
  return { tab, customerId: id(s.customerId), vendorId: id(s.vendorId) };
}

export function servicesRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'services',
      validateSearch: validateServicesSearch,
      component: ServicesPage,
    }),
  ] as const;
}
