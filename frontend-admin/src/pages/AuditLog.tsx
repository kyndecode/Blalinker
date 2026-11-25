import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import ExportButton from '../components/ui/ExportButton';
import Pagination from '../components/ui/Pagination';
import { DateFilter, FilterBar, SearchInput, SelectFilter } from '../components/ui/Filters';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

interface AuditRow {
  id: string; action: string; entity: string | null; entityId: string | null; ipAddress: string | null; createdAt: string;
  user: { email: string | null; adminTitle: string | null } | null;
}

const ENTITIES = ['user', 'booking', 'review', 'report', 'category', 'content_page', 'faq_item', 'announcement', 'site_setting', 'country', 'media_asset', 'contact_request', 'export'];

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: '', entity: '', from: '', to: '' });
  const set = (k: keyof typeof filters) => (v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const { data, isLoading, error } = useQuery<{ data: AuditRow[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['audit', page, filters],
    queryFn: () => api.get('/admin/audit', { params: { page, limit: 30, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) } }).then((r) => r.data),
    retry: false,
  });

  if (isForbidden(error)) return <AccessDenied permission="Journal d'audit" />;
  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Journal d'audit</h1>
          <p className="mt-0.5 text-sm text-white/50">Traçabilité des actions sensibles et des connexions (qui, quoi, quand, IP).</p>
        </div>
        <ExportButton dataset="audit" params={filters} />
      </div>
      <FilterBar>
        <SearchInput value={filters.action} onChange={set('action')} label="Action" placeholder="Action (ex. : auth.login, admin.export)" />
        <SelectFilter label="Entité" value={filters.entity} onChange={set('entity')} options={[{ value: '', label: 'Toutes' }, ...ENTITIES.map((e) => ({ value: e, label: e }))]} />
        <DateFilter label="Du" value={filters.from} onChange={set('from')} />
        <DateFilter label="Au" value={filters.to} onChange={set('to')} />
      </FilterBar>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      <div role="region" aria-label="Tableau : Journal d'audit" tabIndex={0} className="relative overflow-x-auto rounded-xl border border-white/10 bg-[#1a2744] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-white/10 text-gray-400">
            <th scope="col" className="px-4 py-3 text-left font-medium">Date</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Auteur</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Action</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Cible</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">IP</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-white/40">Chargement…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-white/40">Aucune action ne correspond.</td></tr>}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="whitespace-nowrap px-4 py-3 text-gray-400">{new Date(row.createdAt).toLocaleString('fr-FR')}</td>
                <td className="px-4 py-3 text-gray-300">{row.user?.email ?? '—'}{row.user?.adminTitle ? <span className="block text-xs text-gray-500">{row.user.adminTitle}</span> : null}</td>
                <td className="px-4 py-3"><span className="font-mono text-xs text-green-400">{row.action}</span></td>
                <td className="px-4 py-3 text-xs text-gray-400">{row.entity ? `${row.entity}${row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}` : '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{row.ipAddress ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="entrées" onChange={setPage} />}
    </div>
  );
}
