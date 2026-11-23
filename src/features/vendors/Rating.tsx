import clsx from 'clsx';
import { Star } from 'lucide-react';

/** 1–5 star rating; the number is exposed as text for assistive tech. */
export function Rating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Rating ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={clsx('size-3.5', i <= value ? 'fill-fg-secondary text-fg-secondary' : 'text-border')}
          strokeWidth={1.8}
        />
      ))}
    </span>
  );
}
