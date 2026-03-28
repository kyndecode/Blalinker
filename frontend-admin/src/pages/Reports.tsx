import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const REASON_LABELS: Record<string, string> = {
  fraud: 'Fraude', inappropriate: 'Inapproprié', fake_profile: 'Faux profil',
  no_show: 'Absent', harassment: 'Harcèlement', other: 'Autre',
};

export default function Reports() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => api.get('/admin/reports', { params: { page: 1, limit: 20 } }).then((r) => r.data),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/reports/${id}`, { status: 'resolved' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Signalements</h1>
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Signalé</th>
              <th className="text-left px-4 py-3 font-medium">Raison</th>
              <th className="text-left px-4 py-3 font-medium">Statut</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-700"><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-700 rounded animate-pulse w-3/4" /></td></tr>
              ))
              : data?.data?.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-white">{r.reported?.email ?? r.reported?.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-orange-400">{REASON_LABELS[r.reason] ?? r.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'pending' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{new Date(r.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' && (
                      <button onClick={() => resolve.mutate(r.id)} className="text-xs text-green-400 hover:text-green-300 hover:underline">
                        Résoudre
                      </button>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
