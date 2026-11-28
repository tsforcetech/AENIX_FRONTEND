import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { inputClasses, TextField } from '@/shared/ui/Field';
import { useFormShortcuts } from '@/shared/ui/shortcuts';
import { StatusMessage } from '@/shared/ui/StatusMessage';
import { useToast } from '@/shared/ui/Toast';
import { RATE_DATE_DEFAULT, useMasterRows, useUpdateRates } from './api';

/** Update several rates to AED at once (one rate date). The AED base row is never re-rated. */
export function CurrencyRatesDialog({ onClose }: { onClose: () => void }) {
  const { data } = useMasterRows('currencies');
  const update = useUpdateRates();
  const toast = useToast();
  const list = (data ?? []).filter((r) => r.row.active && !r.row.base);
  const [date, setDate] = useState(RATE_DATE_DEFAULT);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const valueOf = (id: string, current: unknown) => rates[id] ?? String(current ?? '');

  const submit = () => {
    setError(undefined);
    update.mutate(
      { rates: list.map((r) => ({ id: r.row.id, rate: Number(valueOf(r.row.id, r.row.rateToAed)) })), date },
      {
        onSuccess: (n) => {
          toast({ title: n ? `${n} rate${n === 1 ? '' : 's'} updated` : 'No rate changed' });
          onClose();
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Not saved'),
      },
    );
  };
  useFormShortcuts({ onPrimary: submit });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Update rates"
      description="AED for 1 unit of each currency. AED is the base currency and always 1."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rates-form" busy={update.isPending} disabled={!list.length}>
            Save rates
          </Button>
        </>
      }
    >
      <form
        id="rates-form"
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Rate date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {!data ? (
          <StatusMessage kind="loading" title="Loading currencies…" />
        ) : list.length === 0 ? (
          <StatusMessage kind="empty" title="No other active currency" />
        ) : (
          <table className="w-full text-left text-body-s">
            <caption className="sr-only">Rates to AED</caption>
            <thead>
              <tr className="border-b border-border-subtle">
                <th scope="col" className="py-2 text-caption font-medium text-fg-muted">
                  Currency
                </th>
                <th scope="col" className="py-2 text-caption font-medium text-fg-muted">
                  Last rate
                </th>
                <th scope="col" className="py-2 text-right text-caption font-medium text-fg-muted">
                  New rate to AED
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const code = String(r.row.code);
                return (
                  <tr key={r.row.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2">
                      <span className="font-mono font-medium">{code}</span>{' '}
                      <span className="text-fg-muted">{String(r.row.name)}</span>
                    </td>
                    <td className="py-2 tabular-nums text-fg-muted">
                      {String(r.row.rateToAed)} · {String(r.row.rateDate)}
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        aria-label={`New rate to AED for ${code}`}
                        value={valueOf(r.row.id, r.row.rateToAed)}
                        onChange={(e) => setRates((x) => ({ ...x, [r.row.id]: e.target.value }))}
                        className={`${inputClasses} ml-auto h-9 w-32 text-right tabular-nums`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {error ? <StatusMessage kind="error" title="Not saved" description={error} /> : null}
      </form>
    </Dialog>
  );
}
