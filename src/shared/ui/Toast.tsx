import { CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  title: string;
  body?: string;
}

const ToastContext = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-xl bg-surface-inverse p-4 text-fg-inverse shadow-2xl"
          >
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#4ade80]" />
            <div className="min-w-0 flex-1">
              <p className="text-body-s font-semibold">{t.title}</p>
              {t.body ? <p className="mt-0.5 text-caption opacity-80">{t.body}</p> : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
              className="opacity-70 hover:opacity-100"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
