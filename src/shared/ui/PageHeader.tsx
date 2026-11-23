import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
  meta?: ReactNode;
}) {
  return (
    <header className="mb-6 space-y-3">
      {crumbs?.length ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-caption text-fg-muted">
            {crumbs.map((c, i) => (
              <li key={c.label} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight aria-hidden="true" className="size-3" /> : null}
                {c.to ? (
                  <Link to={c.to} className="hover:text-fg hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-fg">{title}</h1>
            {meta}
          </div>
          {description ? <p className="text-body-s text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
