import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import ExportButton from '../components/ui/ExportButton';
import { useToast } from '../components/ui/Toast';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

type Moderation = 'pending' | 'published' | 'rejected';
interface Person { email?: string | null; firstName?: string; lastName?: string }
interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  response: string | null;
  flagReason: string | null;
  createdAt: string;
  moderation: Moderation;
  client: Person;
  provider: Person;
  booking?: { id: string; status: string; service?: { title?: string } | null } | null;
}
interface ReviewPage { data: AdminReview[]; meta: { total: number; totalPages: number } }

const TABS: Array<{ value: Moderation | ''; label: string }> = [
  { value: 'pending', label: 'À modérer' },
  { value: 'published', label: 'Publiés' },
  { value: 'rejected', label: 'Refusés' },
  { value: '', label: 'Tous' },
];

const BADGES: Record<Moderation, { label: string; cls: string }> = {
  pending: { label: 'À modérer', cls: 'bg-yellow-900/50 text-yellow-300' },
  published: { label: 'Publié', cls: 'bg-green-900/50 text-green-300' },
  rejected: { label: 'Refusé', cls: 'bg-white/10 text-gray-300' },
};

const name = (p: Person) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email || '-';

type PendingAction = { kind: 'reject' | 'delete'; review: AdminReview } | null;

export default function Reviews() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<Moderation | ''>('pending');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingAction>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkRejecting, setBulkRejecting] = useState(false);

  const { data, isLoading, error } = useQuery<ReviewPage>({
    queryKey: ['admin-reviews', status, page],
    queryFn: () => api.get('/admin/reviews', { params: { page, limit: 20, status: status || undefined } }).then((r) => r.data),
  });

  const done = (message: string) => {
    toast.success(message);
    setPending(null);
    qc.invalidateQueries({ queryKey: ['admin-reviews'] });
    qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.put(`/admin/reviews/${id}/approve`).then((r) => r.data),
    onSuccess: (res) => done(res?.message ?? 'Avis publié'),
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.put(`/admin/reviews/${id}/reject`, { reason }).then((r) => r.data),
    onSuccess: (res) => done(res?.message ?? 'Avis refusé'),
  });
  const bulk = useMutation({
    mutationFn: (body: { action: 'approve' | 'reject'; reason?: string }) => api.post('/admin/reviews/bulk', { ids: selected, ...body }).then((r) => r.data),
    onSuccess: (res: { updated: number; skipped: number }) => {
      setSelected([]);
      done(`${res.updated} avis traité(s)${res.skipped ? `, ${res.skipped} déjà dans cet état` : ''}`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reviews/${id}`).then((r) => r.data),
    onSuccess: () => done('Avis supprimé définitivement'),
  });

  if (isForbidden(error)) return <AccessDenied permission="Modérer les avis" />;

  const rows = data?.data ?? [];
  const actionError = reject.isError ? getApiErrorMessage(reject.error) : remove.isError ? getApiErrorMessage(remove.error) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Avis</h1>
          <ExportButton dataset="reviews" label="CSV" />
        </div>
        <div role="tablist" aria-label="Filtrer par statut" className="flex flex-wrap gap-1 rounded-lg bg-[#1a2744] p-1">
          {TABS.map((t) => (
            <button
              key={t.value || 'all'}
              role="tab"
              aria-selected={status === t.value}
              onClick={() => { setStatus(t.value); setPage(1); setSelected([]); }}
              className={`rounded-md px-3 py-1.5 text-sm ${status === t.value ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && !isForbidden(error) && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#1a2744] px-4 py-2 text-sm">
          <label className="flex items-center gap-2 text-gray-200">
            <input type="checkbox" className="h-4 w-4 accent-green-600"
              checked={rows.length > 0 && rows.every((r) => selected.includes(r.id))}
              onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])} />
            Tout sélectionner
          </label>
          <span className="text-gray-400" aria-live="polite">{selected.length} sélectionné(s)</span>
          {selected.length > 0 && (
            <>
              <button onClick={() => bulk.mutate({ action: 'approve' })} disabled={bulk.isPending} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Publier la sélection</button>
              <button onClick={() => { bulk.reset(); setBulkRejecting(true); }} className="rounded-lg border border-orange-500/40 px-3 py-1 text-xs font-semibold text-orange-300">Refuser la sélection</button>
            </>
          )}
        </div>
      )}

      <div className="space-y-3">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-white/5" />)}
        {!isLoading && rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-400">Aucun avis dans cette catégorie.</p>
        )}
        {rows.map((r) => (
          <article key={r.id} className="rounded-xl border border-white/10 bg-[#1a2744] p-4" aria-label={`Avis de ${name(r.client)}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-green-600" aria-label={`Sélectionner l’avis de ${name(r.client)}`}
                  checked={selected.includes(r.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} />
                <div className="min-w-0">
                <p className="text-sm text-white">
                  <span className="font-medium">{name(r.client)}</span>
                  <span className="text-gray-400"> sur </span>
                  <span className="font-medium">{name(r.provider)}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {r.booking?.service?.title ?? 'Prestation'} · {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400" aria-label={`${r.rating} sur 5`}>{'★'.repeat(r.rating)}<span className="text-gray-600">{'★'.repeat(5 - r.rating)}</span></span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGES[r.moderation].cls}`}>{BADGES[r.moderation].label}</span>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm text-gray-200">{r.comment || <span className="italic text-gray-500">Sans commentaire</span>}</p>
            {r.response && <p className="mt-2 border-l-2 border-green-500 pl-3 text-sm text-gray-300">Réponse du prestataire : {r.response}</p>}
            {r.moderation === 'rejected' && r.flagReason && <p className="mt-2 text-xs text-gray-400">Motif du refus : {r.flagReason}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.moderation !== 'published' && (
                <button onClick={() => approve.mutate(r.id)} disabled={approve.isPending} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                  Publier
                </button>
              )}
              {r.moderation !== 'rejected' && (
                <button onClick={() => { reject.reset(); setPending({ kind: 'reject', review: r }); }} className="rounded-lg border border-orange-500/40 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-500/10">
                  {r.moderation === 'published' ? 'Dépublier' : 'Refuser'}
                </button>
              )}
              <button onClick={() => { remove.reset(); setPending({ kind: 'delete', review: r }); }} className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10">
                Supprimer
              </button>
            </div>
          </article>
        ))}
      </div>

      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="avis" onChange={setPage} />}

      <ConfirmDialog
        open={pending?.kind === 'reject'}
        title={pending?.review.moderation === 'published' ? 'Dépublier cet avis' : 'Refuser cet avis'}
        message="L'avis est masqué mais conservé. Son auteur est prévenu avec le motif ; la note du prestataire est recalculée."
        confirmLabel={pending?.review.moderation === 'published' ? 'Dépublier' : 'Refuser'}
        reason={{ label: 'Motif communiqué à l’auteur', required: true, minLength: 5 }}
        busy={reject.isPending}
        error={pending?.kind === 'reject' ? actionError : null}
        onClose={() => setPending(null)}
        onConfirm={(reason) => pending && reject.mutate({ id: pending.review.id, reason })}
      />
      <ConfirmDialog
        open={bulkRejecting}
        title={`Refuser ${selected.length} avis`}
        message="Les avis sont masqués (conservés), leurs auteurs prévenus avec le motif, les notes recalculées."
        confirmLabel="Refuser la sélection"
        reason={{ label: 'Motif communiqué aux auteurs', required: true, minLength: 5 }}
        busy={bulk.isPending}
        onClose={() => setBulkRejecting(false)}
        onConfirm={(reason) => bulk.mutate({ action: 'reject', reason }, { onSuccess: () => setBulkRejecting(false) })}
      />
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        danger
        title="Supprimer définitivement"
        message="Cette suppression est irréversible (elle reste tracée au journal d'audit). Préférez « Refuser » pour masquer un avis en le conservant."
        confirmLabel="Supprimer"
        busy={remove.isPending}
        error={pending?.kind === 'delete' ? actionError : null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && remove.mutate(pending.review.id)}
      />
    </div>
  );
}
