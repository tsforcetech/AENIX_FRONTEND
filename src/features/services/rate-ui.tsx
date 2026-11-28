import { X } from 'lucide-react';
import { useMasterOptions } from '@/features/masters/lookups';
import { Badge, type Tone } from '@/shared/ui/Badge';
import { SelectField } from '@/shared/ui/Field';
import type { ImportResult } from './api';
import type { RateStatus } from './rates';

const tone: Record<RateStatus, Tone> = { Current: 'success', Future: 'info', Expired: 'neutral' };

export function RateStatusBadge({ status }: { status: RateStatus }) {
  return <Badge tone={tone[status]}>{status}</Badge>;
}

/** Unit picker from the Units of measure master (keeps a saved unit that is not in the master). */
export function UnitSelect({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (unit: string) => void;
}) {
  const units = useMasterOptions('unitsOfMeasure');
  const options = [...(units.data ?? [])];
  if (value && !options.some((o) => o.value === value))
    options.push({ value, label: `${value} (not in the master)` });
  return (
    <SelectField
      label="Unit"
      required
      placeholder="Select unit"
      options={options}
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Result of an Excel import: rows added and the rows skipped with the reason. */
export function ImportResultNote({ result, onDismiss }: { result: ImportResult; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="mt-3 rounded-lg border border-border-subtle bg-canvas p-3 text-body-s text-fg-secondary"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-fg">
          {result.added} rate(s) imported
          {result.skipped.length ? ` · ${result.skipped.length} row(s) skipped` : ''}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close import result"
          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {result.skipped.length ? (
        <div role="region" aria-label="Skipped rows" tabIndex={0} className="mt-2 max-h-40 overflow-y-auto">
          <ul className="list-disc space-y-1 pl-5 text-caption">
            {result.skipped.slice(0, 50).map((s) => (
              <li key={s.row}>
                Row {s.row}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
