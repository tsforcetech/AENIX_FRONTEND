import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Accessible modal built on the native <dialog> (focus trap + Esc handled by the browser). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={(e) => {
        // Ignore close events bubbling up from a nested dialog (e.g. an import dialog inside a form dialog).
        if (e.target !== e.currentTarget) return;
        onClose();
      }}
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl border border-border-subtle bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]`}
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
            <div>
              <h2 id={titleId} className="text-[17px] font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-body-s text-fg-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-border-subtle bg-canvas/60 px-6 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
