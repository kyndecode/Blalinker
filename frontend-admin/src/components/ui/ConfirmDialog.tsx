import { useEffect, useState, type ReactNode } from 'react';
import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  /** Champ « motif » : absent, facultatif ou obligatoire (longueur minimale). */
  reason?: { label: string; required?: boolean; minLength?: number; maxLength?: number; placeholder?: string };
}

/**
 * Confirmation des actions sensibles (suspension, suppression, refus…).
 * Le motif, s'il est demandé, est transmis au serveur et journalisé.
 */
export default function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onClose, danger, busy, error, reason,
}: ConfirmDialogProps) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  const min = reason?.required ? reason.minLength ?? 1 : 0;
  const tooShort = text.trim().length < min;

  return (
    <Modal open={open} onClose={onClose} title={title} description={message}>
      <form onSubmit={(e) => { e.preventDefault(); if (!tooShort) onConfirm(text.trim()); }} className="space-y-3">
        {reason && (
          <div>
            <label htmlFor="confirm-reason" className="mb-1 block text-sm font-medium text-gray-200">
              {reason.label}{reason.required ? '' : ' (facultatif)'}
            </label>
            <textarea
              id="confirm-reason"
              rows={3}
              maxLength={reason.maxLength ?? 500}
              value={text}
              placeholder={reason.placeholder}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={reason.required && text.length > 0 && tooShort}
              className="w-full rounded-lg border border-white/10 bg-[#0f1b33] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {reason.required && min > 1 && <p className="mt-1 text-xs text-gray-400">{min} caractères minimum.</p>}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-white/15 py-2 text-sm text-gray-200 hover:bg-white/5">Annuler</button>
          <button
            type="submit"
            disabled={busy || tooShort}
            aria-busy={busy}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {busy ? 'Traitement…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
