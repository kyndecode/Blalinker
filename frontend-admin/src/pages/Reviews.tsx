import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Reviews() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: () => api.get('/admin/reviews', { params: { page: 1, limit: 20 } }).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Avis</h1>
      <div className="bg-[#1a2744] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-left px-4 py-3 font-medium">Prestataire</th>
              <th className="text-left px-4 py-3 font-medium">Note</th>
              <th className="text-left px-4 py-3 font-medium">Commentaire</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-white/10"><td colSpan={5} className="px-4 py-3"><div className="h-4 bg-white/10 rounded animate-pulse w-3/4" /></td></tr>
              ))
              : data?.data?.map((r: any) => (
                <tr key={r.id} className="border-b border-white/10/50 hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{r.client?.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{r.provider?.firstName ?? '—'}</td>
                  <td className="px-4 py-3 text-yellow-400 font-semibold">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</td>
                  <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{r.comment ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(r.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
