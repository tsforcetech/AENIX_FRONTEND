import clsx from 'clsx';
import logoUrl from '@/assets/aenix-logo.png';

/** Authentic AENIX logo (owner-supplied, from the Figma UI reference). Do not recolour or redraw. */
export function Logo({ className, height = 40 }: { className?: string; height?: number }) {
  return (
    <img
      src={logoUrl}
      alt="AENIX"
      height={height}
      style={{ height, width: 'auto' }}
      className={clsx('block max-w-none shrink-0 self-start object-contain', className)}
    />
  );
}
