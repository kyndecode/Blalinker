import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  description?: ReactNode;
  size?: 'md' | 'lg';
}

/** Fenêtre modale accessible (role="dialog", Échap, focus initial puis restitué). */
export default function Modal({ open, title, onClose, children, description, size = 'md' }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>('textarea, input, select, button:not([data-modal-close])');
    (first ?? panelRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#1a2744] p-5 text-white shadow-2xl focus:outline-none`}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button type="button" data-modal-close onClick={onClose} aria-label="Fermer" className="rounded p-1 text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500">✕</button>
        </div>
        {description && <div id={descId} className="mb-4 text-sm text-gray-300">{description}</div>}
        {children}
      </div>
    </div>
  );
}
