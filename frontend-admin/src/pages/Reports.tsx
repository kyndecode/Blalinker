import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';
interface Person { email?: string | null; phone?: string | null; role?: string; profile?: { firstName?: string; lastName?: string } | null }
interface AdminReport {
  id: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
  reporter: Person;
  reported: Person;
  booking?: { id: string; status: string; amount?: string | null; currency?: string; transaction?: { status: string } | null } | null;
}

const REASON_LABELS: Record<string, string> = {
  fraud: 'Fraude', inappropriate: 'Comportement inapproprié', fake_profile: 'Faux profil',
  no_show: 'Absence', harassment: 'Harcèlement', other: 'Autre',
};
const STATUS_LABELS: Record<ReportStatus, { label: string; cls: string }> = {
  pending: { label: 'Nouveau', cls: 'bg-red-900/50 text-red-300' },
  reviewed: { label: 'En examen', cls: 'bg-yellow-900/50 text-yellow-300' },
  resolved: { label: 'Résolu', cls: 'bg-green-900/50 text-green-300' },
  dismissed: { label: 'Classé sans suite', cls: 'bg-white/10 text-gray-300' },
};
const BOOKING_LABELS: Record<string, string> = {
  pending: 'en attente', accepted: 'acceptée', in_progress: 'en cours', completed: 'terminée', validated: 'validée',
  cancelled: 'annulée', rejected: 'refusée', disputed: 'EN LITIGE',
};

const who = (p: Person) => {
  const n = `${p.profile?.firstName ?? ''} ${p.profile?.lastName ?? ''}`.trim();
  return `${n || '-'}${p.email ? ` (${p.email})` : ''}`;
};

function DisputeDialog({ report, onClose }: { report: AdminReport | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [outcome, setOutcome] = useState<'validate' | 'cancel'>('validate');
  const [note, setNote] = useState('');
  const paid = report?.booking?.transaction?.status === 'completed' || report?.booking?.transaction?.status === 'processing';
  const resolve = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${report!.booking!.id}/resolve-dispute`, { outcome, note: note.trim() }).then((r) => r.data),
    onSuccess: (res) => {
      toast.success(res?.refundRequired
        ? `${res.message}. Réservation payée : effectuez le remboursement depuis « Paiements ».`
        : res?.message ?? 'Litige traité');
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      setNote('');
      onClose();
    },
  });
  return (
    <Modal
      open={Boolean(report)}
      onClose={onClose}
      title="Arbitrer le litige"
      description={<>Les deux parties sont prévenues de la décision. Réservation {paid ? <strong>payée</strong> : 'non payée'}.</>}
    >
      <form onSubmit={(e) => { e.preventDefault(); if (note.trim().length >= 5) resolve.mutate(); }} className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-gray-200">Décision</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="outcome" checked={outcome === 'validate'} onChange={() => setOutcome('validate')} className="mt-1" />
            <span>Mission réalisée : valider{paid ? ' et libérer les fonds au prestataire' : ''}</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="outcome" checked={outcome === 'cancel'} onChange={() => setOutcome('cancel')} className="mt-1" />
            <span>Mission non réalisée : annuler{paid ? ' (remboursement à effectuer ensuite)' : ''}</span>
          </label>
        </fieldset>
        <div>
          <label htmlFor="dispute-note" className="mb-1 block text-sm font-medium text-gray-200">Justification (journalisée)</label>
          <textarea id="dispute-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#0f1b33] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          <p className="mt-1 text-xs text-gray-400">5 caractères minimum.</p>
        </div>
        {resolve.isError && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(resolve.error)}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-white/15 py-2 text-sm">Annuler</button>
          <button type="submit" disabled={resolve.isPending || note.trim().length < 5} className="flex-1 rounded-lg bg-green-700 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {resolve.isPending ? 'Traitement…' : 'Confirmer la décision'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Reports() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<ReportStatus | ''>('pending');
  const [page, setPage] = useState(1);
  const [dismissing, setDismissing] = useState<AdminReport | null>(null);
  const [arbitrating, setArbitrating] = useState<AdminReport | null>(null);

  const { data, isLoading, error } = useQuery<{ data: AdminReport[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['admin-reports', status, page],
    queryFn: () => api.get('/admin/reports', { params: { page, limit: 20, status: status || undefined } }).then((r) => r.data),
  });

  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ReportStatus }) => api.patch(`/admin/reports/${id}`, { status: next }),
    onSuccess: (_r, vars) => {
      toast.success(`Signalement : ${STATUS_LABELS[vars.next].label.toLowerCase()}`);
      setDismissing(null);
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  if (isForbidden(error)) return <AccessDenied permission="Gérer signalements" />;
  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Signalements et litiges</h1>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          Statut
          <select value={status} onChange={(e) => { setStatus(e.target.value as ReportStatus | ''); setPage(1); }}
            className="rounded-lg border border-white/10 bg-[#1a2744] px-3 py-2 text-sm text-white">
            <option value="pending">Nouveaux</option>
            <option value="reviewed">En examen</option>
            <option value="resolved">Résolus</option>
            <option value="dismissed">Classés sans suite</option>
            <option value="">Tous</option>
          </select>
        </label>
      </div>

      {error && !isForbidden(error) && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}

      <div className="space-y-3">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-white/5" />)}
        {!isLoading && rows.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-400">Aucun signalement dans cette catégorie.</p>}
        {rows.map((r) => {
          const disputed = r.booking?.status === 'disputed';
          const open = r.status === 'pending' || r.status === 'reviewed';
          return (
            <article key={r.id} className={`rounded-xl border bg-[#1a2744] p-4 ${disputed ? 'border-orange-500/50' : 'border-white/10'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="text-white"><span className="text-gray-400">Signalé :</span> {who(r.reported)}</p>
                  <p className="text-gray-300"><span className="text-gray-400">Par :</span> {who(r.reporter)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-orange-900/40 px-2 py-0.5 text-xs text-orange-300">{REASON_LABELS[r.reason] ?? r.reason}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABELS[r.status].cls}`}>{STATUS_LABELS[r.status].label}</span>
                </div>
              </div>
              {r.description && <p className="mt-3 whitespace-pre-line text-sm text-gray-200">{r.description}</p>}
              <p className="mt-2 text-xs text-gray-400">
                {new Date(r.createdAt).toLocaleString('fr-FR')}
                {r.booking && <> · Réservation {BOOKING_LABELS[r.booking.status] ?? r.booking.status}{r.booking.amount ? ` · ${Number(r.booking.amount).toLocaleString('fr-FR')} ${r.booking.currency ?? 'XOF'}` : ''}{r.booking.transaction ? ` · paiement ${r.booking.transaction.status}` : ''}</>}
              </p>
              {open && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {disputed && (
                    <button onClick={() => setArbitrating(r)} className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">Arbitrer le litige</button>
                  )}
                  {r.status === 'pending' && (
                    <button onClick={() => update.mutate({ id: r.id, next: 'reviewed' })} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5">Prendre en charge</button>
                  )}
                  {!disputed && (
                    <>
                      <button onClick={() => update.mutate({ id: r.id, next: 'resolved' })} className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800">Marquer résolu</button>
                      <button onClick={() => setDismissing(r)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5">Classer sans suite</button>
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="signalements" onChange={setPage} />}

      <ConfirmDialog
        open={Boolean(dismissing)}
        title="Classer sans suite"
        message="L'auteur du signalement est informé que son signalement est classé sans suite."
        confirmLabel="Classer"
        busy={update.isPending}
        onClose={() => setDismissing(null)}
        onConfirm={() => dismissing && update.mutate({ id: dismissing.id, next: 'dismissed' })}
      />
      <DisputeDialog report={arbitrating} onClose={() => setArbitrating(null)} />
    </div>
  );
}
