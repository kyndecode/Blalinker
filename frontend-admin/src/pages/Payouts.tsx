import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { getApiErrorMessage } from '../utils/apiError';
import { Check, X, BadgeCheck, ChevronLeft, ChevronRight } from 'lucide-react';

interface Payout {
  id: string;
  amount: number;
  currency: string;
  method: string | null;
  destination: string | null;
  status: string;
  reference: string | null;
  createdAt: string;
  provider: { email: string | null; profile: { firstName: string; lastName: string } | null } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-900/50 text-yellow-400',
  approved: 'bg-blue-900/50 text-blue-400',
  paid: 'bg-green-900/50 text-green-400',
  rejected: 'bg-red-900/50 text-red-400',
};

export default function Payouts() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const toast = useToast();
  const [pending, setPending] = useState<{ id: string; action: 'paid' | 'rejected' } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-payouts', page, status],
    queryFn: () => api.get('/admin/payouts', { params: { page, limit: 20, status: status || undefined } }).then((r) => r.data),
    retry: false,
  });

  const process = useMutation({
    mutationFn: ({ id, action, reference }: { id: string; action: string; reference?: string }) =>
      api.patch(`/admin/payouts/${id}`, { action, reference }),
    onSuccess: () => { toast.success('Retrait mis à jour'); setPending(null); qc.invalidateQueries({ queryKey: ['admin-payouts'] }); },
    onError: (e: unknown) => toast.error(getApiErrorMessage(e, 'Action impossible')),
  });

  if ((error as { response?: { status?: number } })?.response?.status === 403) {
    return <div className="text-center py-20 text-white/60">Accès réservé (permission « Voir paiements »).</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Retraits prestataires</h1>
        <p className="text-white/40 text-sm mt-0.5">Traitez les demandes de retrait (approuver, marquer payé, rejeter).</p>
      </div>

      <select
        aria-label="Filtrer par statut"
        value={status}
        onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        className="px-3 py-2 bg-[#1a2744] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="">Tous les statuts</option>
        <option value="pending">En attente</option>
        <option value="approved">Approuvés</option>
        <option value="paid">Payés</option>
        <option value="rejected">Rejetés</option>
      </select>

      <div role="region" aria-label="Tableau : Demandes de retrait" tabIndex={0} className="relative bg-[#1a2744] rounded-xl border border-white/10 overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Prestataire</th>
              <th className="text-left px-4 py-3 font-medium">Montant</th>
              <th className="text-left px-4 py-3 font-medium">Méthode / Destination</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-white/40">Chargement…</td></tr>
            ) : data?.data?.length ? data.data.map((p: Payout) => (
              <tr key={p.id} className="border-b border-white/10 hover:bg-white/5">
                <td className="px-4 py-3">
                  <div className="text-white">{p.provider?.profile ? `${p.provider.profile.firstName} ${p.provider.profile.lastName}`.trim() : '—'}</div>
                  <div className="text-white/40 text-xs">{p.provider?.email}</div>
                </td>
                <td className="px-4 py-3 text-white font-semibold">{Number(p.amount).toLocaleString('fr-FR')} {p.currency}</td>
                <td className="px-4 py-3 text-gray-400">
                  <span className="capitalize">{p.method?.replace('_', ' ') ?? '—'}</span>
                  {p.destination && <div className="text-white/40 text-xs">{p.destination}</div>}
                </td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] ?? 'bg-white/10 text-gray-400'}`}>{p.status}</span></td>
                <td className="px-4 py-3 text-gray-400">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    {p.status === 'pending' && (
                      <button title="Approuver" aria-label="Approuver le retrait" onClick={() => process.mutate({ id: p.id, action: 'approved' })} className="text-blue-400 hover:text-blue-300"><Check className="w-4 h-4" /></button>
                    )}
                    {(p.status === 'pending' || p.status === 'approved') && (
                      <>
                        <button title="Marquer payé" aria-label="Marquer le retrait comme payé" onClick={() => setPending({ id: p.id, action: 'paid' })} className="text-green-400 hover:text-green-300"><BadgeCheck className="w-4 h-4" /></button>
                        <button title="Rejeter" aria-label="Rejeter le retrait" onClick={() => setPending({ id: p.id, action: 'rejected' })} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-white/40">Aucune demande de retrait.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{data.meta.total} retraits</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Page précédente" className="p-1 rounded hover:bg-white/10 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span>Page {page} / {data.meta.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.meta.totalPages} aria-label="Page suivante" className="p-1 rounded hover:bg-white/10 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
          <ConfirmDialog
        open={pending?.action === 'paid'}
        title="Marquer le retrait comme payé"
        message="Confirmez que le versement a été effectué au prestataire."
        confirmLabel="Confirmer le versement"
        reason={{ label: 'Référence du versement', placeholder: 'Ex. : référence Wave / virement' }}
        busy={process.isPending}
        onClose={() => setPending(null)}
        onConfirm={(reference) => pending && process.mutate({ id: pending.id, action: 'paid', reference: reference || undefined })}
      />
      <ConfirmDialog
        open={pending?.action === 'rejected'}
        danger
        title="Rejeter le retrait"
        message="Les fonds redeviennent disponibles sur le solde du prestataire."
        confirmLabel="Rejeter"
        busy={process.isPending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && process.mutate({ id: pending.id, action: 'rejected' })}
      />
    </div>
  );
}
