import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

interface OwnReview {
  id: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  response: string | null;
  status: 'pending' | 'published' | 'rejected';
  createdAt: string;
  reviewerName: string;
  booking?: { id: string; service?: { title?: string } | null } | null;
}

const STATUS: Record<OwnReview['status'], { label: string; cls: string }> = {
  pending:   { label: 'En vérification', cls: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300' },
  published: { label: 'Publié', cls: 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300' },
  rejected:  { label: 'Non publié', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
};

function RespondForm({ review }: { review: OwnReview }) {
  const qc = useQueryClient();
  const [text, setText] = useState(review.response ?? '');
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: () => api.put(`/reviews/${review.id}/respond`, { response: text.trim() }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['my-reviews'] });
    },
  });
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-xs text-green-700 dark:text-green-400 hover:underline">
        {review.response ? 'Modifier ma réponse' : 'Répondre publiquement'}
      </button>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) save.mutate(); }} className="mt-2 space-y-2">
      <label htmlFor={`resp-${review.id}`} className="sr-only">Votre réponse</label>
      <textarea id={`resp-${review.id}`} rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white" />
      {save.isError && <p role="alert" className="text-xs text-red-600">{getApiErrorMessage(save.error)}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={save.isPending || !text.trim()} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
          {save.isPending ? 'Envoi…' : 'Publier la réponse'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs">Annuler</button>
      </div>
    </form>
  );
}

/** Avis reçus (prestataire) ou donnés (client), avec leur statut de modération. */
export default function MyReviews({ isProvider }: { isProvider: boolean }) {
  const { data, isLoading, isError } = useQuery<{ data: OwnReview[] }>({
    queryKey: ['my-reviews'],
    queryFn: () => api.get('/reviews/me', { params: { limit: 5 } }).then((r) => r.data),
  });
  const reviews = data?.data ?? [];

  return (
    <section aria-labelledby="my-reviews-title" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
      <h2 id="my-reviews-title" className="text-base font-semibold text-gray-900 dark:text-white mb-3">
        {isProvider ? 'Avis reçus' : 'Mes avis'}
      </h2>
      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {isError && <p className="text-sm text-red-600">Avis indisponibles pour le moment.</p>}
      {!isLoading && !isError && reviews.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isProvider ? 'Aucun avis pour le moment.' : 'Vous pourrez noter une prestation une fois la mission terminée.'}
        </p>
      )}
      <ul className="space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-yellow-500" aria-label={`${r.rating} sur 5`}>{'★'.repeat(r.rating)}<span className="text-gray-300 dark:text-gray-600">{'★'.repeat(5 - r.rating)}</span></span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {isProvider ? r.reviewerName : <Link to={`/bookings/${r.bookingId}`} className="hover:underline">{r.booking?.service?.title ?? 'Réservation'}</Link>}
              {' · '}{new Date(r.createdAt).toLocaleDateString('fr-FR')}
            </p>
            {r.comment && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{r.comment}</p>}
            {r.response && <p className="mt-2 border-l-2 border-green-500 pl-3 text-sm text-gray-600 dark:text-gray-400"><span className="font-medium">Réponse :</span> {r.response}</p>}
            {isProvider && r.status === 'published' && <RespondForm review={r} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
