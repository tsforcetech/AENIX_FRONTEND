/** Report tabs (URL `?tab=`). */
export const REPORT_TABS = [
  { value: 'revenue', label: 'Revenue & margin' },
  { value: 'profit', label: 'Job profitability' },
  { value: 'customers', label: 'Top customers' },
  { value: 'lanes', label: 'Jobs by type & lanes' },
  { value: 'vendors', label: 'Vendor performance' },
  { value: 'occupancy', label: 'Warehouse occupancy' },
  { value: 'ageing', label: 'Receivables ageing' },
  { value: 'pdc', label: 'PDC maturity' },
  { value: 'balances', label: 'Customer balances' },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]['value'];

export function validateReportsSearch(search: Record<string, unknown>): { tab?: ReportTab } {
  const t = search.tab;
  return typeof t === 'string' && t !== 'revenue' && REPORT_TABS.some((x) => x.value === t)
    ? { tab: t as ReportTab }
    : {};
}
