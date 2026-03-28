import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, CheckCircle, XCircle } from 'lucide-react';
import api from '../services/api';

interface Provider {
  id: string;
  user: { email: string | null; phone: string | null };
  firstName: string;
  lastName: string;
  city: string | null;
  isVerified: boolean;
  isAvailable: boolean;
  ratingAverage: number;
  ratingCount: number;
  createdAt: string;
}

export default function Providers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-providers', page, search],
    queryFn: () => api.get('/admin/providers', {
      params: { page, limit: 20, search: search || undefined },
    }).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Prestataires</h1>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher un prestataire..."
            className="w-full pl-9 pr-4 py-2 bg-[#1a2744] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      <div className="bg-[#1a2744] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Nom</th>
              <th className="text-left px-4 py-3 font-medium">Contact</th>
              <th className="text-left px-4 py-3 font-medium">Ville</th>
              <th className="text-left px-4 py-3 font-medium">Note</th>
              <th className="text-left px-4 py-3 font-medium">Vérifié</th>
              <th className="text-left px-4 py-3 font-medium">Inscription</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-white/10">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
                  </td>
                </tr>
              ))
              : data?.data?.map((p: Provider) => (
                <tr key={p.id} className="border-b border-white/10/50 hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{p.firstName} {p.lastName}</td>
                  <td className="px-4 py-3 text-gray-300">{p.user?.email ?? p.user?.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{p.city ?? '—'}</td>
                  <td className="px-4 py-3 text-yellow-400">★ {p.ratingAverage?.toFixed(1) ?? '—'} <span className="text-gray-500 text-xs">({p.ratingCount})</span></td>
                  <td className="px-4 py-3">
                    {p.isVerified
                      ? <CheckCircle className="w-4 h-4 text-green-400" />
                      : <XCircle className="w-4 h-4 text-gray-600" />}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{data.meta.total} prestataires</span>
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
