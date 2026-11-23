import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { SettingsPage } from './SettingsPage';

export function settingsRoutes(parent: AppParentRoute) {
  return [createRoute({ getParentRoute: () => parent, path: 'settings', component: SettingsPage })] as const;
}
