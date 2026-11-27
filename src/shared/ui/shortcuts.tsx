import { Keyboard } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

export interface Shortcut {
  keys: string[];
  label: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

/**
 * Form-level keyboard shortcuts for fast entry screens:
 * Ctrl/⌘+S save draft · Ctrl/⌘+Enter primary action · Alt+N add line · ? shortcut help.
 */
export function useFormShortcuts(handlers: {
  onSave?: () => void;
  onPrimary?: () => void;
  onAddLine?: () => void;
  onHelp?: () => void;
}) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      const mod = e.ctrlKey || e.metaKey;
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (mod && e.key.toLowerCase() === 's' && h.onSave) {
        e.preventDefault();
        h.onSave();
      } else if (mod && e.key === 'Enter' && h.onPrimary) {
        e.preventDefault();
        h.onPrimary();
      } else if (e.altKey && e.key.toLowerCase() === 'n' && h.onAddLine) {
        e.preventDefault();
        h.onAddLine();
      } else if (e.key === '?' && !typing && h.onHelp) {
        e.preventDefault();
        h.onHelp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-border bg-surface px-1.5 font-mono text-[11px] font-medium text-fg-secondary shadow-xs">
      {children}
    </kbd>
  );
}

export function ShortcutsButton({ shortcuts }: { shortcuts: Shortcut[] }) {
  const [open, setOpen] = useState(false);
  useFormShortcuts({ onHelp: () => setOpen(true) });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-caption font-medium text-fg-muted hover:bg-surface-muted hover:text-fg"
      >
        <Keyboard aria-hidden="true" className="size-4" /> Shortcuts <Kbd>?</Kbd>
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Keyboard shortcuts"
        description="Work through the form without the mouse."
      >
        <ul className="divide-y divide-border-subtle">
          {shortcuts.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 py-2.5 text-body-s">
              <span>{s.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 ? <span className="text-caption text-fg-muted">+</span> : null}
                    <Kbd>{k}</Kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

export const ENTRY_SHORTCUTS: Shortcut[] = [
  { keys: [MOD, 'S'], label: 'Save draft' },
  { keys: [MOD, 'Enter'], label: 'Submit / confirm' },
  { keys: ['Alt', 'N'], label: 'Add a price line' },
  { keys: ['Enter'], label: 'Next line (adds one on the last line)' },
  { keys: ['↑'], label: 'Line above (same column)' },
  { keys: ['↓'], label: 'Line below (same column)' },
  { keys: [MOD, 'Delete'], label: 'Remove the current line' },
  { keys: ['Type'], label: 'Search customers and services, then Enter or Tab to pick' },
  { keys: ['?'], label: 'Show this help' },
];

/** Bottom-sticky bar keeping totals and actions in view while entering lines. */
export function StickyActionBar({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-border-subtle bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_rgb(26_26_26/0.06)] backdrop-blur lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">{summary}</div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
