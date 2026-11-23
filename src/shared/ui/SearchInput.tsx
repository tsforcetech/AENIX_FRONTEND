import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { inputClasses } from './Field';

/** Debounced search box; parent receives the settled value (server-side search). */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    // External value changed (e.g. back navigation): adopt it without an effect.
    setSynced(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 250);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <div className={clsx('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
      />
      <input
        type="search"
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        className={clsx(inputClasses, 'h-10 pl-9')}
      />
    </div>
  );
}
