import { createRoute } from '@tanstack/react-router';
import type { AppParentRoute } from '@/app/routes-base';
import { SettingsPage } from './SettingsPage';
import { SETTINGS_TABS, type SettingsTab } from './system';

function validateSettingsSearch(search: Record<string, unknown>): { tab?: SettingsTab } {
  const tab = search.tab;
  return typeof tab === 'string' && (SETTINGS_TABS as readonly string[]).includes(tab) && tab !== 'users'
    ? { tab: tab as SettingsTab }
    : {};
}

export function settingsRoutes(parent: AppParentRoute) {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: 'settings',
      validateSearch: validateSettingsSearch,
      component: SettingsPage,
    }),
  ] as const;
}
