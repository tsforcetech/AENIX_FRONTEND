import type { ReactNode } from 'react';
import { SearchInput } from './SearchInput';
import { Tabs, type TabItem } from './Tabs';

/** Status tabs + search + optional extra filters, all bound to URL search state by the page. */
export function ListToolbar({
  tabs,
  status,
  onStatus,
  search,
  onSearch,
  searchPlaceholder,
  extra,
}: {
  tabs?: TabItem[];
  status?: string;
  onStatus?: (s: string) => void;
  search: string;
  onSearch: (q: string) => void;
  searchPlaceholder?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-4 px-5 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder={searchPlaceholder}
          className="w-full sm:max-w-xs"
        />
        {extra}
      </div>
      {tabs && onStatus ? (
        <Tabs items={tabs} value={status ?? 'All'} onChange={onStatus} label="Filter by status" />
      ) : (
        <div className="border-b border-border-subtle" />
      )}
    </div>
  );
}

export function statusTabs(statuses: readonly string[], counts?: Record<string, number>): TabItem[] {
  return ['All', ...statuses].map((s) => ({
    value: s,
    label: s,
    count: counts?.[s] ?? (counts ? 0 : undefined),
  }));
}
