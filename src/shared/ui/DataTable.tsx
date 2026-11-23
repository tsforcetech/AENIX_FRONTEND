import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusMessage } from './StatusMessage';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  /** Hide below the md breakpoint to keep mobile tables readable. */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  error?: unknown;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  footer?: ReactNode;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  error,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  footer,
}: DataTableProps<T>) {
  if (error) {
    return (
      <div className="p-5">
        <StatusMessage
          kind="error"
          title="Could not load records"
          description="Please retry. If it persists, contact support with the time of the error."
        />
      </div>
    );
  }
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-body-s">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border-subtle bg-canvas/60">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={clsx(
                    'whitespace-nowrap px-4 py-2.5 text-caption font-medium uppercase tracking-wide text-fg-muted first:pl-5 last:pr-5',
                    c.align === 'right' && 'text-right',
                    c.hideOnMobile && 'hidden md:table-cell',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-busy={loading || undefined}>
            {loading && !rows
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b border-border-subtle last:border-0">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={clsx(
                          'px-4 py-4 first:pl-5 last:pr-5',
                          c.hideOnMobile && 'hidden md:table-cell',
                        )}
                      >
                        <div className="h-3.5 w-full max-w-32 animate-pulse rounded bg-surface-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={clsx(
                      'border-b border-border-subtle align-top transition-colors last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-canvas',
                      loading && 'opacity-60',
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={clsx(
                          'px-4 py-3.5 first:pl-5 last:pr-5',
                          c.align === 'right' && 'text-right tabular-nums',
                          c.hideOnMobile && 'hidden md:table-cell',
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-surface-muted text-fg-muted">
            <Inbox aria-hidden="true" className="size-5" />
          </span>
          <p className="font-medium text-fg">{emptyTitle}</p>
          {emptyDescription ? <p className="max-w-sm text-body-s text-fg-muted">{emptyDescription}</p> : null}
        </div>
      ) : null}
      {footer}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 text-caption text-fg-muted">
      <span className="tabular-nums">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="grid size-8 place-items-center rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-40"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <span className="px-2 tabular-nums text-fg">
          {page} / {pages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="grid size-8 place-items-center rounded-md border border-border bg-surface hover:bg-surface-muted disabled:opacity-40"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
