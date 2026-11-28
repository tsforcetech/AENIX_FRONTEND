// ---- FLOW-003 WP-C ---- small form pieces shared by the transport / costing cards.
import { useId } from 'react';
import type { Attachment } from '@/domain/types';
import { toAttachment } from './api';

/** File picker that keeps metadata only (the backend stores the file). */
export function FileField({
  label,
  file,
  onFile,
  hint = 'PDF, image or Excel. Only the file name is kept in the prototype.',
}: {
  label: string;
  file?: Attachment;
  onFile: (a: Attachment | undefined) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-body-s font-medium">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv"
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          onFile(f ? toAttachment(f) : undefined);
        }}
        className="block w-full text-body-s file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-body-s file:font-medium hover:file:bg-surface-muted"
      />
      <p id={`${id}-hint`} className="text-caption text-fg-muted">
        {file ? `Selected: ${file.fileName} (${file.sizeKb} KB)` : hint}
      </p>
    </div>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center gap-2 text-body-s font-medium">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="size-4 accent-[var(--color-brand)]"
        />
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="pl-6 text-caption text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Please try again.';
}
