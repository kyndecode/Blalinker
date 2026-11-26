import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Texte d'aide sous le titre (relié par aria-describedby). */
  description?: string;
}

/**
 * Fenêtre modale accessible : role="dialog", titre relié, Échap pour fermer,
 * focus placé dans la fenêtre puis rendu à l'élément d'origine.
 */
export function Modal({ open, title, onClose, children, description }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('input, textarea, select, button:not([data-modal-close])');
    (first ?? panel)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button
            type="button"
            data-modal-close
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        {description && <p id={descId} className="text-sm text-gray-600 dark:text-gray-300 mb-4">{description}</p>}
        {children}
      </div>
    </div>
  );
}
