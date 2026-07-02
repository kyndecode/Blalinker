import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';

interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { email: string | null; adminTitle: string | null } | null;
}

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', page, action],
    queryFn: () => api.get('/admin/audit', { params: { page, limit: 30, action: action || undefined } }).then((r) => r.data),
    retry: false,
  });

  if ((error as { response?: { status?: number } })?.response?.status === 403) {
    return <div className="text-center py-20 text-white/60"><ScrollText className="w-10 h-10 mx-auto mb-3 text-white/30" />Accès réservé (permission « Journal d'audit »).</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Journal d'audit</h1>
        <p className="text-white/40 text-sm mt-0.5">Traçabilité des actions sensibles (qui, quoi, quand, IP).</p>
      </div>

      <input
        value={action}
        onChange={(e) => { setAction(e.target.value); setPage(1); }}
        placeholder="Filtrer par action (ex: admin.user.status)"
        className="input max-w-sm"
      />

      <div className="bg-[#1a2744] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Auteur</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Cible</th>
              <th className="text-left px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-white/40">Chargement…</td></tr>
            ) : data?.data?.length ? data.data.map((row: AuditRow) => (
              <tr key={row.id} className="border-b border-white/10 hover:bg-white/5">
                <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{new Date(row.createdAt).toLocaleString('fr-FR')}</td>
                <td className="px-4 py-3 text-gray-300">{row.user?.email ?? '—'}</td>
                <td className="px-4 py-3"><span className="font-mono text-xs text-green-400">{row.action}</span></td>
                <td className="px-4 py-3 text-gray-400 text-xs">{row.entity ? `${row.entity}${row.entityId ? ' · ' + row.entityId.slice(0, 8) : ''}` : '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{row.ipAddress ?? '—'}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-white/40">Aucune action enregistrée.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{data.meta.total} entrées</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-white/10 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span>Page {page} / {data.meta.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.meta.totalPages} className="p-1 rounded hover:bg-white/10 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
