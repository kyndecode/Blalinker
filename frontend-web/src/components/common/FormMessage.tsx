import { useEffect, useRef, type ReactNode } from 'react';

const TONES = {
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400',
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
} as const;

const ICONS = { error: '⚠', success: '✓', info: 'ℹ' } as const;

/**
 * Message général d'un formulaire (erreur, confirmation, information).
 * À son apparition, il défile à l'écran s'il n'est pas visible (bouton d'envoi en bas d'un long
 * formulaire, message en haut) et reçoit le focus ; il est annoncé aux lecteurs d'écran
 * (alert pour une erreur, status sinon). Une icône accompagne la couleur : le sens ne dépend
 * jamais de la seule couleur.
 */
export function FormMessage({ tone, children, className = '' }: {
  tone: keyof typeof TONES;
  children?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = children !== undefined && children !== null && children !== false && children !== '';

  useEffect(() => {
    const el = ref.current;
    if (!visible || !el) return;
    const rect = el.getBoundingClientRect();
    if ((rect.top < 80 || rect.bottom > window.innerHeight) && typeof el.scrollIntoView === 'function') {
      const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    }
    el.focus({ preventScroll: true });
  }, [visible, children]);

  if (!visible) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm outline-none ${TONES[tone]} ${className}`}
    >
      <span aria-hidden="true" className="font-bold leading-5">{ICONS[tone]}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
