import { Link, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { Bell, ChevronDown, LogOut, Menu, Plus, Search } from 'lucide-react';
import { signOut, type SessionPrincipal } from '@/shared/auth/session';
import { Avatar } from '@/shared/ui/Avatar';
import { formatRelative } from '@/shared/utils/format';
import { protoDb, useProtoDb } from '@/prototype/store';
import { PROTO_TODAY } from '@/prototype/seed';
import { usePopover } from './usePopover';

export interface QuickCreate {
  label: string;
  to: string;
}

function Notifications({ principal }: { principal: SessionPrincipal }) {
  const { open, setOpen, ref } = usePopover();
  const all = useProtoDb((db) => db.notifications);
  // Prototype notifications are internal staff events: portal users must never see them.
  const items = principal.actorType === 'staff' ? all : [];
  const unread = items.filter((n) => !n.read).length;
  const markAll = () =>
    protoDb.update((db) => ({ ...db, notifications: db.notifications.map((n) => ({ ...n, read: true })) }));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative grid size-10 place-items-center rounded-lg text-fg-secondary hover:bg-surface-muted hover:text-fg"
      >
        <Bell aria-hidden="true" className="size-5" strokeWidth={1.8} />
        {unread ? (
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 size-2 rounded-full bg-brand ring-2 ring-surface"
          />
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <p className="text-body-s font-semibold">Notifications</p>
            <button
              type="button"
              onClick={markAll}
              className="text-caption font-medium text-brand hover:underline"
            >
              Mark all as read
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-body-s text-fg-muted">No notifications</p>
          ) : null}
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  to={n.href ?? '/home'}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 border-b border-border-subtle px-4 py-3 last:border-0 hover:bg-canvas"
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      n.read ? 'bg-transparent' : 'bg-brand',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-body-s font-medium text-fg">{n.title}</span>
                    <span className="block text-caption text-fg-muted">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-fg-muted">
                      {formatRelative(n.at, `${PROTO_TODAY}T18:00:00+04:00`)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CreateMenu({ items }: { items: QuickCreate[] }) {
  const { open, setOpen, ref } = usePopover();
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-body-s font-medium text-brand-fg shadow-sm hover:bg-brand-hover"
      >
        <Plus aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only">Create</span>
        <ChevronDown aria-hidden="true" className="hidden size-3.5 opacity-80 sm:block" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-border-subtle bg-surface p-1.5 shadow-2xl"
        >
          {items.map((it) => (
            <Link
              key={it.to}
              role="menuitem"
              to={it.to}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-body-s text-fg hover:bg-surface-muted"
            >
              {it.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ principal }: { principal: SessionPrincipal }) {
  const { open, setOpen, ref } = usePopover();
  const navigate = useNavigate();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-muted"
      >
        <span className="sr-only">Account menu:</span>
        <Avatar name={principal.displayName} />
        <span className="hidden text-left lg:block">
          <span className="block text-body-s font-medium leading-4 text-fg">{principal.displayName}</span>
          <span className="block max-w-44 truncate text-[11px] text-fg-muted">{principal.role}</span>
        </span>
        <ChevronDown aria-hidden="true" className="hidden size-3.5 text-fg-muted lg:block" />
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-border-subtle bg-surface p-1.5 shadow-2xl">
          <div className="px-3 py-2">
            <p className="text-body-s font-medium">{principal.displayName}</p>
            <p className="truncate text-caption text-fg-muted">{principal.email}</p>
          </div>
          <div className="my-1 h-px bg-border-subtle" />
          <button
            type="button"
            onClick={() => {
              signOut();
              void navigate({ to: '/login' });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-body-s text-fg hover:bg-surface-muted"
          >
            <LogOut aria-hidden="true" className="size-4" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Topbar({
  principal,
  onOpenMenu,
  onOpenPalette,
  quickCreate,
}: {
  principal: SessionPrincipal;
  onOpenMenu: () => void;
  onOpenPalette: () => void;
  quickCreate: QuickCreate[];
}) {
  return (
    <div className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border-subtle bg-surface/85 px-4 backdrop-blur-md lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="grid size-10 place-items-center rounded-lg text-fg-secondary hover:bg-surface-muted lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-lg border border-border bg-canvas px-3 text-body-s text-fg-muted transition-colors hover:border-border-strong"
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="flex-1 truncate text-left">
          Search<span className="hidden sm:inline"> or jump to…</span>
        </span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 font-mono text-[11px] sm:inline">
          Ctrl K
        </kbd>
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <CreateMenu items={quickCreate} />
        <Notifications principal={principal} />
        <UserMenu principal={principal} />
      </div>
    </div>
  );
}
