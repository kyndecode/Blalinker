import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastKind, string> = {
  success: 'border-green-500/40 bg-green-900/90 text-green-100',
  error: 'border-red-500/40 bg-red-900/90 text-red-100',
  info: 'border-blue-500/40 bg-blue-900/90 text-blue-100',
};

/** Retours d'action (succès / échec) annoncés aux lecteurs d'écran (aria-live). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = next.current++;
    setItems((list) => [...list.slice(-3), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl ${STYLES[t.kind]}`}>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Fermer le message" className="opacity-70 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Hors fournisseur (tests isolés), les messages sont ignorés sans erreur. */
const NOOP: ToastApi = { success: () => undefined, error: () => undefined, info: () => undefined };

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}
