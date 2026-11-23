import clsx from 'clsx';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export const inputClasses =
  'block w-full rounded-lg border border-border bg-surface px-3 text-body-s text-fg shadow-xs placeholder:text-fg-muted ' +
  'transition-colors hover:border-border-strong focus:border-fg focus:outline-none focus:ring-4 focus:ring-fg/5 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/10';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
  labelAside?: ReactNode;
}

export function FieldShell({
  label,
  error,
  hint,
  required,
  className,
  children,
  labelAside,
}: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={clsx('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-body-s font-medium text-fg">
          {label}
          {required ? (
            <span aria-hidden="true" className="ml-0.5 text-brand">
              *
            </span>
          ) : null}
        </label>
        {labelAside}
      </div>
      {children({ id, describedBy })}
      {hint && !error ? (
        <p id={hintId} className="text-caption text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Common = { label: string; error?: string; hint?: ReactNode; className?: string; labelAside?: ReactNode };

export function TextField({
  label,
  error,
  hint,
  className,
  labelAside,
  ref,
  ...rest
}: Common & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={rest.required}
      className={className}
      labelAside={labelAside}
    >
      {({ id, describedBy }) => (
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={clsx(inputClasses, 'h-10')}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  options,
  placeholder,
  ref,
  ...rest
}: Common &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: { value: string; label: string }[];
    placeholder?: string;
    ref?: Ref<HTMLSelectElement>;
  }) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={rest.required} className={className}>
      {({ id, describedBy }) => (
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={clsx(inputClasses, 'h-10 pr-8')}
          {...rest}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  className,
  ref,
  ...rest
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={rest.required} className={className}>
      {({ id, describedBy }) => (
        <textarea
          ref={ref}
          id={id}
          rows={3}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={clsx(inputClasses, 'py-2')}
          {...rest}
        />
      )}
    </FieldShell>
  );
}
