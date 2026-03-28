import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-yellow-900/50 text-yellow-400',
  accepted:    'bg-blue-900/50 text-blue-400',
  in_progress: 'bg-blue-900/50 text-blue-400',
  completed:   'bg-green-900/50 text-green-400',
  validated:   'bg-green-900/50 text-green-400',
  cancelled:   'bg-white/10 text-gray-400',
  rejected:    'bg-red-900/50 text-red-400',
  disputed:    'bg-red-900/50 text-red-400',
};

export default function Bookings() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bookings', page, status],
    queryFn: () => api.get('/admin/bookings', {
      params: { page, limit: 20, status: status || undefined },
    }).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Réservations</h1>

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-[#1a2744] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="accepted">Acceptées</option>
          <option value="in_progress">En cours</option>
          <option value="completed">Terminées</option>
          <option value="disputed">En litige</option>
          <option value="cancelled">Annulées</option>
        </select>
      </div>

      <div className="bg-[#1a2744] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-left px-4 py-3 font-medium">Prestataire</th>
              <th className="text-left px-4 py-3 font-medium">Service</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-white/10">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
                  </td>
                </tr>
              ))
              : data?.data?.map((b: any) => (
                <tr key={b.id} className="border-b border-white/10/50 hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{b.client?.profile?.firstName ?? b.client?.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{b.provider?.firstName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{b.service?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] ?? 'bg-white/10 text-gray-400'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{data.meta.total} réservations</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-[#1a2744] hover:bg-white/10 disabled:opacity-40">←</button>
            <span>Page {page} / {data.meta.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.meta.totalPages} className="px-3 py-1 rounded bg-[#1a2744] hover:bg-white/10 disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  );
}
