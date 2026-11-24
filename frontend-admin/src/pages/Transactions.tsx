import { useState } from 'react';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { RotateCcw } from 'lucide-react';

export default function Transactions() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-transactions', page],
    queryFn: () => api.get('/admin/transactions', { params: { page, limit: 20 } }).then((r) => r.data),
  });

  const refund = useMutation({
    mutationFn: (id: string) => api.post(`/admin/transactions/${id}/refund`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-transactions'] }),
    onError: (e: unknown) => alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Remboursement impossible'),
  });

  if (isForbidden(error)) return <AccessDenied permission="Voir paiements" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Transactions</h1>
      <div className="bg-[#1a2744] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Référence</th>
              <th className="text-left px-4 py-3 font-medium">Montant</th>
              <th className="text-left px-4 py-3 font-medium">Méthode</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-white/10">
                  <td colSpan={6} className="px-4 py-3"><div className="h-4 bg-white/10 rounded animate-pulse w-3/4" /></td>
                </tr>
              ))
              : data?.data?.map((t: any) => (
                <tr key={t.id} className="border-b border-white/10/50 hover:bg-white/5">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{t.externalRef ?? t.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-white font-semibold">{t.amount?.toLocaleString('fr-FR')} XOF</td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{t.method?.replace('_', ' ') ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.status === 'completed' ? 'bg-green-900/50 text-green-400' : t.status === 'failed' ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{new Date(t.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3 text-right">
                    {t.status === 'completed' && (
                      <button
                        title="Rembourser"
                        onClick={() => { if (confirm('Rembourser ce paiement et annuler la réservation ?')) refund.mutate(t.id); }}
                        className="text-red-400 hover:text-red-300 inline-flex"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
      {data?.meta && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{data.meta.total} transactions</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-[#1a2744] hover:bg-white/10 disabled:opacity-40">←</button>
            <span>Page {page} / {data.meta.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.meta.totalPages} className="px-3 py-1 rounded bg-[#1a2744] hover:bg-white/10 disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  );
}
