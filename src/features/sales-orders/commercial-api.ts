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
import { cheapestValidRate, rateCardPrice } from './pricing';

export { CURRENCIES, DEFAULT_RATES };

/** Prototype "today" (sample data date) used for rate validity and follow-ups. */
export const COMMERCIAL_TODAY = PROTO_TODAY;

/**
 * C3: rate-card suggestion for a price line, in the document currency.
 * Cost = cheapest vendor rate valid today (lane match preferred); price = cost + 20%.
 */
export function suggestLine(
  serviceId: string,
  lane?: { origin?: string; destination?: string },
  exchangeRate = 1,
): Partial<GridLine> {
  const db = protoDb.get();
  const svc = db.services.find((s) => s.id === serviceId);
  if (!svc) return {};
  const cost = cheapestValidRate(db.vendorRates, serviceId, PROTO_TODAY, lane);
  const fx = exchangeRate > 0 ? exchangeRate : 1;
  const conv = (n: number) => Math.round((n / fx) * 100) / 100;
  return {
    unit: svc.unit,
    description: svc.name,
    unitCost: cost !== undefined ? conv(cost) : undefined,
    // Disbursements are rebilled at cost (no markup).
    unitPrice: cost !== undefined ? conv(svc.isDisbursement ? cost : rateCardPrice(cost)) : undefined,
    minimumCharge: svc.minimumCharge ? conv(svc.minimumCharge) : undefined,
  };
}

/** C2: rate-card price per unit in AED (undefined when the service has no valid vendor rate). */
export function rateCardPriceAed(
  serviceId: string,
  lane?: { origin?: string; destination?: string },
): number | undefined {
  const db = protoDb.get();
  const svc = db.services.find((s) => s.id === serviceId);
  if (!svc || svc.isDisbursement) return undefined;
  const cost = cheapestValidRate(db.vendorRates, serviceId, PROTO_TODAY, lane);
  return cost !== undefined ? rateCardPrice(cost) : undefined;
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
