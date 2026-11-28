import { useId, type ComponentProps } from 'react';
import type { ReasonKind } from '@/domain/types';
import { useMasterOptions, useReasonOptions } from '@/features/masters/lookups';
import { TextField } from '@/shared/ui/Field';

/**
 * MASTERS M2: text inputs that suggest entries from a master (Places, Reasons) with a native
 * <datalist>. Free text is still allowed — the master only offers suggestions.
 */
type TextFieldProps = ComponentProps<typeof TextField>;

function SuggestField({ options, ...props }: TextFieldProps & { options: string[] }) {
  const listId = useId();
  return (
    <>
      <TextField list={listId} autoComplete="off" {...props} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

/** Origin / destination / location input with suggestions from the Places master. */
export function PlaceField(props: TextFieldProps) {
  const places = useMasterOptions('places');
  return <SuggestField options={(places.data ?? []).map((o) => o.label)} {...props} />;
}

/**
 * Payment terms from the master as select options (value = days). Terms with the same days are
 * merged ("Advance / Cash on delivery"); a current value missing from the master is kept.
 */
export function usePaymentTermOptions(current?: number | string) {
  const terms = useMasterOptions('paymentTerms');
  const byDays = new Map<string, string[]>();
  for (const o of terms.data ?? []) byDays.set(o.value, [...(byDays.get(o.value) ?? []), o.label]);
  const options = [...byDays.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([value, labels]) => ({ value, label: labels.join(' / ') }));
  const cur = current === undefined || current === '' ? undefined : String(current);
  if (cur !== undefined && terms.data && !byDays.has(cur))
    options.push({ value: cur, label: `${cur} days (not in the master)` });
  return { options, isLoading: terms.isLoading };
}

/** Reason input with suggestions from the Reasons master for one kind. */
export function ReasonField({ kind, ...props }: TextFieldProps & { kind: ReasonKind }) {
  const reasons = useReasonOptions(kind);
  return (
    <SuggestField
      hint="Pick a reason from the list or type your own"
      options={(reasons.data ?? []).map((o) => o.label)}
      {...props}
    />
  );
}
