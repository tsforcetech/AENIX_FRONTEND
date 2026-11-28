import { DEFAULT_RATES } from '@/domain/controls';
import { protoDb } from '@/prototype/store';

/**
 * Current rate to AED for a currency, from the Currencies master (PROTOTYPE ADAPTER).
 * Falls back to the reference rates, then 1, so a missing code never breaks a total.
 */
export function rateFor(code: string | undefined): number {
  if (!code || code === 'AED') return 1;
  const m = protoDb.get().currencies.find((c) => c.code === code && c.active);
  return m?.rateToAed ?? DEFAULT_RATES[code] ?? 1;
}

/** Active currency codes from the master (AED first). */
export function activeCurrencies(): string[] {
  const list = protoDb
    .get()
    .currencies.filter((c) => c.active)
    .map((c) => c.code);
  return list.length ? ['AED', ...list.filter((c) => c !== 'AED')] : Object.keys(DEFAULT_RATES);
}
