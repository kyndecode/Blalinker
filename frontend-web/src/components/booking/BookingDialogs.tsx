import { useRef, useState, type FormEvent } from 'react';
import { Modal } from '../common/Modal';

const fieldClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1';

interface BaseDialogProps {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  error?: string | null;
}

function DialogError({ error }: { error?: string | null }) {
  return error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null;
}

function DialogButtons({ onClose, busy, disabled, submitLabel, danger }: { onClose: () => void; busy?: boolean; disabled?: boolean; submitLabel: string; danger?: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
        Retour
      </button>
      <button
        type="submit"
        disabled={busy || disabled}
        aria-busy={busy}
        className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-700 hover:bg-green-800'}`}
      >
        {busy ? 'Envoi…' : submitLabel}
      </button>
    </div>
  );
}

/** Confirmation simple d'une action (accepter, démarrer, terminer, valider…). */
export function ConfirmDialog({
  open, onClose, busy, error, title, message, confirmLabel, danger, onConfirm,
}: BaseDialogProps & { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={message}>
      <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }} className="space-y-3">
        <DialogError error={error} />
        <DialogButtons onClose={onClose} busy={busy} submitLabel={confirmLabel} danger={danger} />
      </form>
    </Modal>
  );
}

/** Annulation avec motif facultatif (transmis à l'autre partie). */
export function CancelDialog({ open, onClose, busy, error, onSubmit }: BaseDialogProps & { onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Annuler la réservation" description="L'autre partie sera prévenue. Cette action est définitive.">
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(reason.trim()); }} className="space-y-3">
        <div>
          <label htmlFor="cancel-reason" className={labelClass}>Motif (facultatif)</label>
          <textarea id="cancel-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
          <p className="mt-1 text-xs text-gray-500">{reason.length}/500</p>
        </div>
        <DialogError error={error} />
        <DialogButtons onClose={onClose} busy={busy} submitLabel="Annuler la réservation" danger />
      </form>
    </Modal>
  );
}

export const DISPUTE_REASONS: Array<{ value: string; label: string }> = [
  { value: 'no_show', label: 'Le prestataire ne s’est pas présenté' },
  { value: 'other', label: 'Travail non conforme ou inachevé' },
  { value: 'fraud', label: 'Tentative de fraude' },
  { value: 'harassment', label: 'Comportement inapproprié' },
  { value: 'inappropriate', label: 'Autre comportement problématique' },
];

/** Le client signale un problème : la mission passe en litige, l'équipe tranche. */
export function DisputeDialog({ open, onClose, busy, error, onSubmit }: BaseDialogProps & { onSubmit: (v: { reason: string; description: string }) => void }) {
  const [reason, setReason] = useState('other');
  const [description, setDescription] = useState('');
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [tried, setTried] = useState(false);
  const length = description.trim().length;
  // Bouton toujours actif : un envoi incomplet explique quoi faire et place le focus sur le champ.
  const descriptionError = (tried || length > 0) && length < 10
    ? (length === 0 ? 'Décrivez ce qui s’est passé (10 caractères minimum).' : `Encore ${10 - length} caractère(s) : 10 caractères minimum.`)
    : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (length < 10) { setTried(true); descriptionRef.current?.focus(); return; }
    onSubmit({ reason, description: description.trim() });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Signaler un problème"
      description="La mission sera mise en litige : l'équipe BLA examine la situation avant toute validation. Les fonds éventuels restent bloqués."
    >
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="dispute-reason" className={labelClass}>Nature du problème</label>
          <select id="dispute-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass}>
            {DISPUTE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="dispute-description" className={labelClass}>Que s’est-il passé ?</label>
          <textarea
            id="dispute-description"
            rows={4}
            maxLength={1000}
            ref={descriptionRef}
            required
            aria-invalid={Boolean(descriptionError)}
            aria-describedby="dispute-help"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={fieldClass}
          />
          <p id="dispute-help" role={descriptionError ? 'alert' : undefined} className={`mt-1 text-xs ${descriptionError ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {descriptionError ?? 'Décrivez les faits (10 caractères minimum).'}
          </p>
        </div>
        <DialogError error={error} />
        <DialogButtons onClose={onClose} busy={busy} submitLabel="Envoyer le signalement" danger />
      </form>
    </Modal>
  );
}

/** Note de 1 à 5 et commentaire facultatif ; publié après modération. */
export function ReviewDialog({ open, onClose, busy, error, onSubmit }: BaseDialogProps & { onSubmit: (v: { rating: number; comment: string }) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  const firstStarRef = useRef<HTMLButtonElement>(null);
  const ratingError = tried && rating === 0 ? 'Choisissez une note de 1 à 5 étoiles.' : null;
  return (
    <Modal open={open} onClose={onClose} title="Noter la prestation" description="Votre avis sera publié après vérification par notre équipe.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (rating === 0) { setTried(true); firstStarRef.current?.focus(); return; }
          onSubmit({ rating, comment: comment.trim() });
        }}
        className="space-y-3"
      >
        <fieldset>
          <legend className={labelClass}>Votre note</legend>
          <div className="flex gap-1" role="radiogroup" aria-label="Note sur 5" aria-invalid={Boolean(ratingError)} aria-describedby={ratingError ? 'review-rating-error' : undefined}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                ref={n === 1 ? firstStarRef : undefined}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} sur 5`}
                onClick={() => setRating(n)}
                className={`text-3xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded ${n <= rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
              >
                ★
              </button>
            ))}
          </div>
          {ratingError && <p id="review-rating-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{ratingError}</p>}
        </fieldset>
        <div>
          <label htmlFor="review-comment" className={labelClass}>Commentaire (facultatif)</label>
          <textarea id="review-comment" rows={4} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className={fieldClass} />
          <p className="mt-1 text-xs text-gray-500">{comment.length}/1000</p>
        </div>
        <DialogError error={error} />
        <DialogButtons onClose={onClose} busy={busy} submitLabel="Envoyer mon avis" />
      </form>
    </Modal>
  );
}
