import clsx from 'clsx';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { inputClasses } from './Field';

export interface ComboOption {
  value: string;
  label: string;
  /** Secondary text shown under the label (and searched). */
  hint?: string;
  /** Extra search terms (codes, synonyms). */
  keywords?: string;
}

/**
 * Type-ahead picker (WAI-ARIA 1.2 combobox). Type to filter, ↑/↓ to move, Enter or Tab to pick,
 * Esc to close. When the list is closed, Enter/↑/↓ bubble to the parent (e.g. a line grid).
 * The popup is position:fixed so it is never clipped by scrolling table containers.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Type to search…',
  ariaLabel,
  id,
  invalid,
  describedBy,
  className,
  inputProps,
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  inputProps?: Record<string, string | number | undefined>;
}) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null); // null = show selected label
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase();
    if (!q) return options;
    const words = q.split(/\s+/);
    return options.filter((o) => {
      const hay = `${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [options, query]);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;
    const place = () => {
      const r = inputRef.current!.getBoundingClientRect();
      setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 260) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const pick = (o: ComboOption | undefined) => {
    if (o) onChange(o.value);
    setQuery(null);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && (open || e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (!open) setOpen(true);
      else setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      e.stopPropagation();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      e.stopPropagation();
      pick(filtered[active]);
    } else if (e.key === 'Tab' && open && query) {
      pick(filtered[active]); // typing then Tab picks the highlighted match and moves on
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setQuery(null);
      setOpen(false);
    }
  };

  return (
    <div className={clsx('relative', className)}>
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={selected ? undefined : placeholder}
        value={query ?? selected?.label ?? ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Allow option mousedown to run first.
          setTimeout(() => {
            setOpen(false);
            setQuery(null);
          }, 120);
        }}
        onKeyDown={onKeyDown}
        className={clsx(inputClasses, 'h-9 pr-8')}
        {...inputProps}
      />
      <ChevronsUpDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
      />
      {open && rect ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? 'Options'}
          style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width }}
          className="z-50 max-h-72 overflow-y-auto rounded-xl border border-border-subtle bg-surface p-1 shadow-2xl"
        >
          {filtered.length === 0 ? <li className="px-3 py-2 text-body-s text-fg-muted">No matches</li> : null}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                'flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-body-s',
                i === active && 'bg-surface-muted',
              )}
            >
              <Check
                aria-hidden="true"
                className={clsx('mt-0.5 size-4 shrink-0', o.value === value ? 'text-brand' : 'invisible')}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{o.label}</span>
                {o.hint ? <span className="block truncate text-caption text-fg-muted">{o.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
