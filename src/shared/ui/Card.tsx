import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('rounded-xl border border-border-subtle bg-surface shadow-card', className)}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-6 text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-body-s text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('p-5', className)} {...rest} />;
}
