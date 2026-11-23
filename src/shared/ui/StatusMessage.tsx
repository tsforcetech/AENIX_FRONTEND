import clsx from 'clsx';
import type { ReactNode } from 'react';

export type StatusKind = 'loading' | 'empty' | 'error' | 'denied';

interface StatusMessageProps {
  kind: StatusKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

const tone: Record<StatusKind, string> = {
  loading: 'border-border bg-surface',
  empty: 'border-border bg-surface',
  error: 'border-danger/30 bg-danger-subtle',
  denied: 'border-warning/30 bg-warning-subtle',
};

/** Standard loading / empty / error / permission-denied state required on every screen. */
export function StatusMessage({ kind, title, description, action }: StatusMessageProps) {
  const isAlert = kind === 'error' || kind === 'denied';
  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
      aria-busy={kind === 'loading' || undefined}
      data-kind={kind}
      className={clsx('rounded-md border p-4', tone[kind])}
    >
      <p className="text-body-s font-semibold">{title}</p>
      {description ? <div className="mt-1 text-body-s text-fg-muted">{description}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
