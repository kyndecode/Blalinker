import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Transactions() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-transactions', page],
    queryFn: () => api.get('/admin/transactions', { params: { page, limit: 20 } }).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Transactions</h1>
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Référence</th>
              <th className="text-left px-4 py-3 font-medium">Montant</th>
              <th className="text-left px-4 py-3 font-medium">Méthode</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-700">
                  <td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-700 rounded animate-pulse w-3/4" /></td>
                </tr>
              ))
              : data?.data?.map((t: any) => (
                <tr key={t.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{t.externalRef ?? t.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-white font-semibold">{t.amount?.toLocaleString('fr-FR')} XOF</td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{t.method?.replace('_', ' ') ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.status === 'completed' ? 'bg-green-900/50 text-green-400' : t.status === 'failed' ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{new Date(t.createdAt).toLocaleDateString('fr-FR')}</td>
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
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">←</button>
            <span>Page {page} / {data.meta.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.meta.totalPages} className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">→</button>
          </div>
        </div>
      )}
    </div>
  );
}
