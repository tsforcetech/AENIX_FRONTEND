/**
 * List query conventions used by every screen. Mirrors the REQUESTED server-side paging
 * contract (API-DEP-04/05): the UI never loads a full table, it asks for one page.
 */
export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sort?: string; // "field" or "-field"
  [filter: string]: string | number | undefined;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Optional counts per status for tab badges. */
  counts?: Record<string, number>;
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

/** Prototype-only in-memory paging/filter/sort (the real API does this server-side). */
export function paginate<T>(
  rows: T[],
  params: ListParams,
  opts: { searchText: (row: T) => string; status?: (row: T) => string },
): Page<T> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, params.pageSize ?? DEFAULT_PAGE_SIZE);
  const q = params.search?.trim().toLowerCase();
  let filtered = q ? rows.filter((r) => opts.searchText(r).toLowerCase().includes(q)) : rows;
  const counts: Record<string, number> = { All: filtered.length };
  if (opts.status) {
    for (const r of filtered) {
      const s = opts.status(r);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    if (params.status && params.status !== 'All')
      filtered = filtered.filter((r) => opts.status!(r) === params.status);
  }
  if (params.sort) {
    const desc = params.sort.startsWith('-');
    const key = (desc ? params.sort.slice(1) : params.sort) as keyof T;
    filtered = [...filtered].sort((a, b) => {
      const av = a[key] as unknown as string | number;
      const bv = b[key] as unknown as string | number;
      return (av > bv ? 1 : av < bv ? -1 : 0) * (desc ? -1 : 1);
    });
  }
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, counts };
}
