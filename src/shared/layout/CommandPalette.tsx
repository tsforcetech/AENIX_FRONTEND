import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NavGroup } from '@/app/navigation';

export interface PaletteAction {
  label: string;
  to: string;
  group: string;
  hint?: string;
}

/** ⌘K / Ctrl K command palette — jump to any module or quick action. */
export function CommandPalette({
  open,
  onClose,
  groups,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  actions: PaletteAction[];
}) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const all = useMemo<PaletteAction[]>(
    () => [
      ...actions,
      ...groups.flatMap((g) =>
        g.items.map((i) => ({ label: i.label, to: i.to, group: `Go to · ${g.label}` })),
      ),
    ],
    [groups, actions],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((a) => `${a.label} ${a.group}`.toLowerCase().includes(q)) : all;
  }, [all, query]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      setQuery('');
      setActive(0);
      el.showModal?.();
    }
    if (!open && el.open) el.close?.();
  }, [open]);

  const go = (a: PaletteAction | undefined) => {
    if (!a) return;
    onClose();
    void navigate({ to: a.to });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label="Command palette"
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-border-subtle bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      {open ? (
        <div>
          <div className="flex items-center gap-3 border-b border-border-subtle px-4">
            <Search aria-hidden="true" className="size-5 text-fg-muted" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(results[active]);
                }
              }}
              placeholder="Search modules and actions…"
              aria-label="Search modules and actions"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-activedescendant={results[active] ? `palette-${active}` : undefined}
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-muted"
            />
            <kbd className="rounded border border-border px-1.5 font-mono text-[11px] text-fg-muted">Esc</kbd>
          </div>
          <ul id="palette-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-body-s text-fg-muted">No matches</li>
            ) : null}
            {results.map((a, i) => (
              // Keyboard selection is handled by the combobox input (aria-activedescendant pattern).
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={`${a.group}-${a.to}-${a.label}`}
                id={`palette-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(a)}
                className={clsx(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5',
                  i === active && 'bg-surface-muted',
                )}
              >
                <span className="text-body-s font-medium">{a.label}</span>
                <span className="flex items-center gap-2 text-caption text-fg-muted">
                  {a.group}
                  {i === active ? <CornerDownLeft aria-hidden="true" className="size-3.5" /> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
