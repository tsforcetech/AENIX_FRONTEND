import clsx from 'clsx';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((p) => /[A-Za-z]/.test(p[0] ?? ''))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'grid shrink-0 place-items-center rounded-full bg-surface-inverse font-semibold text-fg-inverse',
        size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-caption',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
