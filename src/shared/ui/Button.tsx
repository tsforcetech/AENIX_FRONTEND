import { Link, type LinkProps } from '@tanstack/react-router';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Busy state blocks repeat submission (double-submit guard) and is announced to AT. */
  busy?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg shadow-sm hover:bg-primary-hover',
  brand: 'bg-brand text-brand-fg shadow-sm hover:bg-brand-hover',
  secondary: 'border border-border bg-surface text-fg shadow-xs hover:bg-surface-muted',
  ghost: 'text-fg-secondary hover:bg-surface-muted hover:text-fg',
  danger: 'border border-danger/30 bg-surface text-danger hover:bg-danger-subtle',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-caption',
  md: 'h-10 gap-2 px-4 text-body-s',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return clsx(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4',
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled,
  className,
  children,
  type,
  icon,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  icon,
  children,
  ...rest
}: LinkProps & {
  variant?: Variant;
  size?: Size;
  className?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
