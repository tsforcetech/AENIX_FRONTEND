import type { Currency } from '@/domain/types';
import { SelectField, TextField } from '@/shared/ui/Field';
import { CURRENCIES, DEFAULT_RATES } from './commercial-api';

/**
 * FLOW-003 C10: document currency + exchange rate to AED (shown only when the company's
 * multi-currency module is on). Balances and ledgers stay in AED.
 */
export function CurrencyFields({
  currency,
  rate,
  onChange,
  rateError,
}: {
  currency: Currency;
  rate: string;
  onChange: (next: { currency: Currency; rate: string }) => void;
  rateError?: string;
}) {
  return (
    <>
      <SelectField
        label="Currency"
        hint="Prices on the lines are in this currency"
        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        value={currency}
        onChange={(e) => {
          const c = e.target.value as Currency;
          onChange({ currency: c, rate: String(DEFAULT_RATES[c]) });
        }}
      />
      {currency !== 'AED' ? (
        <TextField
          label={`Exchange rate (1 ${currency} = AED)`}
          inputMode="decimal"
          required
          hint={`Reference rate ${DEFAULT_RATES[currency]} — finance sets the daily rate`}
          error={rateError}
          value={rate}
          onChange={(e) => onChange({ currency, rate: e.target.value })}
        />
      ) : null}
    </>
  );
}

/** Validates the rate text; returns the error message or undefined. */
export function rateError(currency: Currency, rate: string): string | undefined {
  if (currency === 'AED') return undefined;
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 && n < 1000 ? undefined : 'Enter a rate above 0';
}
