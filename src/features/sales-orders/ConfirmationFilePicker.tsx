import clsx from 'clsx';
import { Paperclip } from 'lucide-react';
import { useId } from 'react';
import { inputClasses } from '@/shared/ui/Field';

export interface PickedFile {
  fileName: string;
  sizeKb: number;
}

/**
 * FLOW-003 C4: customer's confirmation document (signed quotation, PO or email) for a sales order.
 * The prototype keeps the file name and size only; the backend stores the file.
 */
export function ConfirmationFilePicker({
  value,
  onChange,
  error,
  required,
}: {
  value?: PickedFile;
  onChange: (file: PickedFile | undefined) => void;
  error?: string;
  required?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-body-s font-medium text-fg">
        Customer confirmation document
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      <input
        id={id}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.msg,.eml,.doc,.docx"
        aria-describedby={error ? errId : hintId}
        aria-invalid={!!error || undefined}
        aria-required={required || undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          onChange(f ? { fileName: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) } : undefined);
        }}
        className={clsx(
          inputClasses,
          'h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-body-s file:font-medium file:text-fg',
        )}
      />
      {error ? (
        <p id={errId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : (
        <p id={hintId} className="flex items-center gap-1 text-caption text-fg-muted">
          <Paperclip aria-hidden="true" className="size-3.5" />
          {value
            ? `${value.fileName} · ${value.sizeKb} KB`
            : 'Signed quotation, customer PO or confirmation email — needed to confirm.'}
        </p>
      )}
    </div>
  );
}
