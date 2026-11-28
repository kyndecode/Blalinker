import { useEffect, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const base = 'w-full rounded-lg border bg-[#0f1b33] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-60';
const border = (error?: string) => (error ? 'border-red-500/70' : 'border-white/10');

interface Common { label: string; error?: string; hint?: ReactNode; required?: boolean }

function Wrapper({ id, label, error, hint, required, children }: Common & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-200">
        {label}{required && <span className="ml-0.5 text-red-400" aria-hidden="true">*</span>}
      </label>
      {children}
      {error
        ? <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-400">{error}</p>
        : hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function TextField({ label, error, hint, required, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required}>
      <input id={id} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`${base} ${border(error)}`} {...props} />
    </Wrapper>
  );
}

export function TextArea({ label, error, hint, required, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required}>
      <textarea id={id} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`${base} ${border(error)}`} {...props} />
    </Wrapper>
  );
}

export function SelectField({ label, error, hint, required, children, ...props }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required}>
      <select id={id} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={`${base} ${border(error)}`} {...props}>{children}</select>
    </Wrapper>
  );
}

export function CheckboxField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-green-600" />
      <label htmlFor={id} className="text-sm text-gray-200">{label}{hint && <span className="block text-xs text-gray-400">{hint}</span>}</label>
    </div>
  );
}

/** Erreurs de validation du serveur (422) indexées par champ. */
export function fieldErrors(error: unknown): Record<string, string> {
  const errors = (error as { response?: { data?: { errors?: unknown } } } | null)?.response?.data?.errors;
  const out: Record<string, string> = {};
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    for (const [field, list] of Object.entries(errors as Record<string, unknown>)) {
      const first = Array.isArray(list) ? list.find((x) => typeof x === 'string') : list;
      if (typeof first === 'string') out[field] = first;
    }
  }
  return out;
}

export const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'published', label: 'Publié' },
  { value: 'unpublished', label: 'Non publié' },
] as const;

export const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-white/10 text-gray-300' },
  published: { label: 'Publié', cls: 'bg-green-900/50 text-green-300' },
  unpublished: { label: 'Non publié', cls: 'bg-orange-900/50 text-orange-300' },
};

export const LOCALES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
] as const;

/**
 * Après un enregistrement refusé : le premier champ signalé (dans la fenêtre ouverte, sinon dans
 * la page) défile à l'écran et reçoit le focus, pour corriger sans chercher. Sans champ signalé
 * (erreur générale), rien ne bouge : le message s'affiche à côté du bouton.
 */
export function useFocusFirstError(error: unknown): void {
  useEffect(() => {
    if (!error) return undefined;
    const frame = requestAnimationFrame(() => {
      const scope = document.querySelector('[role="dialog"]') ?? document;
      const el = scope.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (!el) return;
      el.scrollIntoView?.({ block: 'center' });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);
}
