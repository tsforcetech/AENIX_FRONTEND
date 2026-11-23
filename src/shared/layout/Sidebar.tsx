import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { NavGroup, NavItem } from '@/app/navigation';
import { Logo } from '@/shared/ui/Logo';

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      activeOptions={{ exact: item.to === '/portal' || item.to === '/vendor-portal' }}
      className={clsx(
        'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-body-s font-medium text-fg-secondary transition-colors',
        'hover:bg-surface-muted hover:text-fg',
        'data-[status=active]:bg-brand-subtle data-[status=active]:text-brand',
        collapsed && 'justify-center px-0',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -left-3 h-5 w-1 rounded-r-full bg-brand opacity-0 transition-opacity group-data-[status=active]:opacity-100"
      />
      <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />
      <span className={clsx(collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  );
}

export function Sidebar({
  groups,
  footerItems = [],
  collapsed,
  onToggle,
  onNavigate,
}: {
  groups: NavGroup[];
  footerItems?: NavItem[];
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={clsx('flex h-16 shrink-0 items-center gap-2 px-4', collapsed && 'justify-center px-2')}>
        {collapsed ? (
          <span className="grid size-9 place-items-center overflow-hidden rounded-lg">
            <Logo height={22} className="max-w-none -translate-x-[3px] [clip-path:inset(0_62%_0_0)]" />
          </span>
        ) : (
          <Link to="/home" aria-label="AENIX home" className="rounded-md">
            <Logo height={34} />
          </Link>
        )}
      </div>
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {groups.map((g) => (
          <div key={g.label}>
            <p
              className={clsx(
                'mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted',
                collapsed && 'sr-only',
              )}
            >
              {g.label}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink item={it} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-border-subtle px-3 py-3">
        {footerItems.map((it) => (
          <NavLink key={it.to} item={it} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={clsx(
              'flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-body-s font-medium text-fg-muted hover:bg-surface-muted hover:text-fg',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-[18px]" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-[18px]" />
            )}
            <span className={clsx(collapsed && 'sr-only')}>Collapse</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
