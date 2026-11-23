import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { ServicesPage } from './ServicesPage';

export function servicesRoutes(parent: AppParentRoute) {
  return [createRoute({ getParentRoute: () => parent, path: 'services', component: ServicesPage })] as const;
}
