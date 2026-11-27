/** Business locale defaults: English UI, UAE dirham, Asia/Dubai time zone. */
export const BUSINESS_LOCALE = 'en-AE';
export const BUSINESS_TIME_ZONE = 'Asia/Dubai';
export const BUSINESS_CURRENCY = 'AED';

const moneyFormatter = new Intl.NumberFormat(BUSINESS_LOCALE, {
  style: 'currency',
  currency: BUSINESS_CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Display-only formatting. Amounts arrive from the API as decimal strings so the browser never
 * performs financial arithmetic on binary floats; calculation authority stays server-side.
 */
export function formatMoney(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return Number.isFinite(n) ? moneyFormatter.format(n) : '—';
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(BUSINESS_LOCALE, {
    dateStyle: 'medium',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(d);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(BUSINESS_LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(d);
}

const compact = new Intl.NumberFormat(BUSINESS_LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

/** Compact AED for KPI tiles, e.g. "AED 436K". */
export function formatMoneyCompact(amount: number): string {
  return `${BUSINESS_CURRENCY} ${compact.format(amount)}`;
}

export function formatNumber(n: number, fractionDigits?: number): string {
  return new Intl.NumberFormat(
    BUSINESS_LOCALE,
    fractionDigits === undefined
      ? undefined
      : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits },
  ).format(n);
}

export function formatRelative(iso: string, nowIso?: string): string {
  const diff = (Date.parse(nowIso ?? new Date().toISOString()) - Date.parse(iso)) / 60000;
  if (diff < 1) return 'just now';
  if (diff < 60) return `${Math.round(diff)} min ago`;
  if (diff < 1440) return `${Math.round(diff / 60)} h ago`;
  if (diff < 10080) return `${Math.round(diff / 1440)} d ago`;
  return formatDate(iso);
}
