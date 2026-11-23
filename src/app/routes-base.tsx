import { createRootRoute, createRoute } from '@tanstack/react-router';
import { RequireSession } from '@/shared/auth/RequireSession';
import { AppShell } from '@/shared/layout/AppShell';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { RootLayout } from './RootLayout';

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl px-4 py-16">
      <StatusMessage kind="empty" title="Page not found" description="The requested page does not exist." />
    </div>
  ),
});

/**
 * Every staff/portal screen mounts under this pathless, deny-by-default layout.
 * Without an authenticated session nothing below it renders.
 */
export const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  component: () => <RequireSession>{(principal) => <AppShell principal={principal} />}</RequireSession>,
});

export type AppParentRoute = typeof appLayoutRoute;

/** URL search state for list pages (page, status tab, search text). */
export interface ListSearch {
  page?: number;
  status?: string;
  q?: string;
}

export function validateListSearch(search: Record<string, unknown>): ListSearch {
  const page = Number(search.page);
  return {
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    status: typeof search.status === 'string' && search.status !== 'All' ? search.status : undefined,
    q: typeof search.q === 'string' && search.q.trim() ? search.q.slice(0, 100) : undefined,
  };
}
