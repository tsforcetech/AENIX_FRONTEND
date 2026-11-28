/**
 * FLOW-003 WP-A — commercial reference data shared by quotations, sales orders and contracts.
 * PROTOTYPE ADAPTER (reads the in-memory store); the backend rate engine / settings API replace it.
 */
import { useQuery } from '@tanstack/react-query';
import { CURRENCIES, DEFAULT_RATES } from '@/domain/controls';
import type { Currency } from '@/domain/types';
import type { GridLine, GridServiceMeta } from '@/shared/ui/PriceLinesGrid';
import { BUSINESS_LOCALE } from '@/shared/utils/format';
import { PROTO_TODAY } from '@/prototype/seed';
import { latency, protoDb } from '@/prototype/store';
import { rateFor } from '@/shared/data/currency';
import { suggestSellingPrice, type Lane } from './pricing';

export { CURRENCIES, DEFAULT_RATES };

/** Prototype "today" (sample data date) used for rate validity and follow-ups. */
export const COMMERCIAL_TODAY = PROTO_TODAY;

function sellingSuggestion(serviceId: string, lane?: Lane, customerId?: string) {
  const db = protoDb.get();
  const svc = db.services.find((s) => s.id === serviceId);
  if (!svc) return undefined;
  return {
    svc,
    ...suggestSellingPrice({
      serviceId,
      customerId: customerId || undefined,
      onDate: PROTO_TODAY,
      lane,
      customerRates: db.customerRates,
      vendorRates: db.vendorRates,
      isDisbursement: svc.isDisbursement,
      toAed: (n, c) => n * rateFor(c),
    }),
  };
}

/**
 * C3 / MASTERS M2: suggestion for a price line, in the document currency.
 * Cost = cheapest vendor rate valid today (lane match preferred). Price, in order: the customer's
 * own selling rate → the standard price list → cost + 20%. `priceSource` says which was used.
 */
export function suggestLine(
  serviceId: string,
  lane?: Lane,
  exchangeRate = 1,
  opts?: { customerId?: string; currency?: Currency },
): Partial<GridLine> {
  const s = sellingSuggestion(serviceId, lane, opts?.customerId);
  if (!s) return {};
  const fx = exchangeRate > 0 ? exchangeRate : 1;
  const conv = (n: number) => Math.round((n / fx) * 100) / 100;
  const docCurrency = opts?.currency ?? 'AED';
  // A selling rate already in the document currency is used as it is (no round trip via AED).
  const unitPrice =
    s.rate && s.rate.currency === docCurrency
      ? s.rate.price
      : s.priceAed !== undefined
        ? conv(s.priceAed)
        : undefined;
  return {
    unit: s.rate?.unit || s.svc.unit,
    description: s.svc.name,
    unitCost: s.costAed !== undefined ? conv(s.costAed) : undefined,
    unitPrice,
    priceSource: unitPrice !== undefined ? s.source : undefined,
    minimumCharge: s.svc.minimumCharge ? conv(s.svc.minimumCharge) : undefined,
  };
}

/**
 * C2: list price per unit in AED that discounts are measured against — the customer's selling
 * rate, else the price list, else cost + 20% (undefined for disbursements or with no rate at all).
 */
export function rateCardPriceAed(serviceId: string, lane?: Lane, customerId?: string): number | undefined {
  const s = sellingSuggestion(serviceId, lane, customerId);
  if (!s || s.svc.isDisbursement) return undefined;
  return s.priceAed;
}

/** Service master flags by id, for the price-line grid (S5/S6/T8). */
export function useServiceMeta() {
  const q = useQuery({
    queryKey: ['services', 'meta'],
    queryFn: () =>
      latency(
        Object.fromEntries(
          protoDb.get().services.map((s): [string, GridServiceMeta & { mode: string }] => [
            s.id,
            {
              isDisbursement: s.isDisbursement,
              isSurcharge: s.isSurcharge,
              minimumCharge: s.minimumCharge,
              mode: s.mode,
            },
          ]),
        ),
        40,
      ),
  });
  const map = q.data ?? {};
  return (serviceId: string) => map[serviceId];
}

/** C10: company switches that change commercial screens. */
export function useCommercialSettings() {
  return useQuery({
    queryKey: ['settings', 'commercial'],
    queryFn: () => latency({ multiCurrency: !!protoDb.get().company.modules?.multiCurrency }, 40),
  });
}

/** Amount in the document currency (AED uses the business formatter style). */
export function formatInCurrency(amount: number, currency: Currency = 'AED'): string {
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(BUSINESS_LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
