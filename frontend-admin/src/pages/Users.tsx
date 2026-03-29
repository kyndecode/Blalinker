import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Search, CheckCircle, XCircle, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';

interface User {
  id: string; phone: string | null; email: string | null;
  role: string; status: string; createdAt: string;
  profile: { firstName: string; lastName: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-900/50 text-green-400',
  pending:  'bg-yellow-900/50 text-yellow-400',
  banned:   'bg-red-900/50 text-red-400',
  suspended: 'bg-orange-900/50 text-orange-400',
  inactive: 'bg-white/10 text-gray-400',
};

export default function Users() {
  const qc = useQueryClient();
  const [page, setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search, status],
    queryFn:  () => api.get('/admin/users', {
      params: { page, limit: 20, search: search || undefined, status: status || undefined },
    }).then((r) => r.data),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: string }) =>
      api.put(`/admin/users/${id}/status`, { status: newStatus }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const verifyId = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/verify-id`, { approved: true }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>

      {/* Filtres */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher email / téléphone..."
            className="w-full pl-9 pr-4 py-2 bg-[#1a2744] border border-white/10 rounded-lg
                       text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-[#1a2744] border border-white/10 rounded-lg text-white text-sm
                     focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="active">Actifs</option>
          <option value="banned">Bannis</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#1a2744] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Utilisateur</th>
              <th className="text-left px-4 py-3 font-medium">Contact</th>
              <th className="text-left px-4 py-3 font-medium">Rôle</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
              <th className="text-left px-4 py-3 font-medium">Inscription</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-white/10">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
                  </td>
                </tr>
              ))
            ) : data?.data?.map((user: User) => (
              <tr key={user.id} className="border-b border-white/10/50 hover:bg-white/5">
                <td className="px-4 py-3 text-white">
                  {user.profile
                    ? `${user.profile.firstName} ${user.profile.lastName}`.trim() || '—'
                    : '—'
                  }
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {user.email ?? user.phone ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-400 capitalize">{user.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status] ?? ''}`}>
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      title="Vérifier l'identité"
                      onClick={() => verifyId.mutate(user.id)}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                    {user.status !== 'active' && (
                      <button
                        title="Activer"
                        onClick={() => updateStatus.mutate({ id: user.id, newStatus: 'active' })}
                        className="text-green-400 hover:text-green-300 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    {user.status !== 'banned' && (
                      <button
                        title="Bannir"
                        onClick={() => {
                          if (confirm('Bannir cet utilisateur ?')) {
                            updateStatus.mutate({ id: user.id, newStatus: 'banned' });
                          }
                        }}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.meta && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{data.meta.total} utilisateurs</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Page {page} / {data.meta.totalPages}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= data.meta.totalPages}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
