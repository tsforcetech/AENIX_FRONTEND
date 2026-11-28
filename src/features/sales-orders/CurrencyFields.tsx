import type { Currency } from '@/domain/types';
import { SelectField, TextField } from '@/shared/ui/Field';
import { activeCurrencies, rateFor } from '@/shared/data/currency';

/**
 * FLOW-003 C10 / MASTERS M2: document currency (Currencies master) + exchange rate to AED (shown only when the company's
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
  // MASTERS M2: active currencies from the Currencies master (keeps a saved, now-inactive code).
  const active = activeCurrencies();
  const codes = active.includes(currency) ? active : [...active, currency];
  return (
    <>
      <SelectField
        label="Currency"
        hint="Prices on the lines are in this currency"
        options={codes.map((c) => ({ value: c, label: c }))}
        value={currency}
        onChange={(e) => {
          const c = e.target.value as Currency;
          onChange({ currency: c, rate: String(rateFor(c)) });
        }}
      />
      {currency !== 'AED' ? (
        <TextField
          label={`Exchange rate (1 ${currency} = AED)`}
          inputMode="decimal"
          required
          hint={`Rate in the Currencies master: ${rateFor(currency)} — finance sets the daily rate`}
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
