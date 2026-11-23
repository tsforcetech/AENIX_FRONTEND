import clsx from 'clsx';
import { formatMoney } from '@/shared/utils/format';

export function Money({
  amount,
  className,
  muted,
}: {
  amount: number | string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span className={clsx('tabular-nums', muted && 'text-fg-muted', className)}>{formatMoney(amount)}</span>
  );
}

export function DocRef({ children, className }: { children: string; className?: string }) {
  return <span className={clsx('font-mono text-[13px] font-medium text-brand', className)}>{children}</span>;
}
