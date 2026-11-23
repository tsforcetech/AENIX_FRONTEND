import { Outlet } from '@tanstack/react-router';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  customerPortalNavigation,
  settingsNav,
  staffNavigation,
  vendorPortalNavigation,
} from '@/app/navigation';
import type { SessionPrincipal } from '@/shared/auth/session';
import { CommandPalette, type PaletteAction } from './CommandPalette';
import { PrototypeBanner } from './PrototypeBanner';
import { Sidebar } from './Sidebar';
import { Topbar, type QuickCreate } from './Topbar';

const staffQuickCreate: QuickCreate[] = [
  { label: 'New enquiry', to: '/enquiries/new' },
  { label: 'New quotation', to: '/quotations/new' },
  { label: 'New sales order', to: '/sales-orders/new' },
  { label: 'New work order', to: '/work-orders/new' },
  { label: 'Record collection', to: '/collections/new' },
];

export function AppShell({ principal }: { principal: SessionPrincipal }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const groups =
    principal.actorType === 'customer'
      ? customerPortalNavigation
      : principal.actorType === 'vendor'
        ? vendorPortalNavigation
        : staffNavigation;
  const quickCreate = principal.actorType === 'staff' ? staffQuickCreate : [];
  const paletteActions: PaletteAction[] = quickCreate.map((q) => ({
    label: q.label,
    to: q.to,
    group: 'Create',
  }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <PrototypeBanner />
      <div className="flex flex-1">
        <aside
          className={clsx(
            'sticky top-0 hidden h-dvh shrink-0 border-r border-border-subtle bg-surface transition-[width] duration-200 lg:block',
            collapsed ? 'w-[72px]' : 'w-64',
          )}
        >
          <Sidebar
            groups={groups}
            footerItems={principal.actorType === 'staff' ? [settingsNav] : []}
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
          />
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-2xl">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-4 rounded-md p-1.5 text-fg-muted hover:bg-surface-muted"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
              <Sidebar
                groups={groups}
                footerItems={principal.actorType === 'staff' ? [settingsNav] : []}
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            principal={principal}
            onOpenMenu={() => setMobileOpen(true)}
            onOpenPalette={() => setPaletteOpen(true)}
            quickCreate={quickCreate}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 outline-none lg:px-8 lg:py-8"
          >
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        groups={groups}
        actions={paletteActions}
      />
    </div>
  );
}
