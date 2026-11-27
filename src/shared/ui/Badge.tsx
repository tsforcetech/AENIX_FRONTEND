import clsx from 'clsx';
import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'dark';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-fg-secondary ring-border',
  brand: 'bg-brand-subtle text-brand ring-brand/20',
  success: 'bg-success-subtle text-success ring-success/20',
  warning: 'bg-warning-subtle text-warning ring-warning/25',
  danger: 'bg-danger-subtle text-danger ring-danger/20',
  info: 'bg-info-subtle text-info ring-info/20',
  dark: 'bg-surface-inverse text-fg-inverse ring-transparent',
};

const dots: Record<Tone, string> = {
  neutral: 'bg-fg-disabled',
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  dark: 'bg-fg-inverse',
};

export function Badge({
  tone = 'neutral',
  children,
  dot = true,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden="true" className={clsx('size-1.5 rounded-full', dots[tone])} /> : null}
      {children}
    </span>
  );
}

/** Status → tone. Status text is always shown, so meaning never relies on colour alone. */
const statusTone: Record<string, Tone> = {
  New: 'info',
  Quoting: 'warning',
  Quoted: 'info',
  Won: 'success',
  Lost: 'neutral',
  Draft: 'neutral',
  'Pending approval': 'warning',
  Sent: 'info',
  Accepted: 'success',
  Rejected: 'danger',
  Expired: 'neutral',
  Active: 'success',
  Expiring: 'warning',
  Confirmed: 'info',
  'In progress': 'brand',
  'In transit': 'brand',
  Delivered: 'success',
  Completed: 'success',
  Cancelled: 'neutral',
  Posted: 'info',
  'Partially paid': 'warning',
  Paid: 'success',
  Overdue: 'danger',
  Approved: 'info',
  Unallocated: 'warning',
  Allocated: 'success',
  'PDC pending': 'warning',
  Bounced: 'danger',
  Invoiced: 'success',
  Reversed: 'neutral',
  'On hold': 'warning',
  Inactive: 'neutral',
  Requested: 'warning',
  Normal: 'neutral',
  High: 'warning',
  Urgent: 'danger',
  Receipt: 'success',
  Dispatch: 'brand',
  Transfer: 'info',
  Adjustment: 'warning',
  'Sent to warehouse': 'info',
  Uploaded: 'info',
  Verified: 'success',
  'Variance raised': 'danger',
  Open: 'warning',
  'Sent to vendor': 'info',
  Closed: 'success',
  Match: 'success',
  Short: 'danger',
  Excess: 'warning',
  'Not received': 'danger',
  'Not expected': 'warning',
  Damaged: 'danger',
  Transport: 'neutral',
  Warehouse: 'neutral',
  'Direct service': 'neutral',
  'Sales order': 'info',
  Issued: 'info',
  Billed: 'success',
  Advance: 'info',
  'PDC issued': 'warning',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? 'neutral'}>{status}</Badge>;
}
