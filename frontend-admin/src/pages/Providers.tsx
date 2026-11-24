import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import Pagination from '../components/ui/Pagination';
import { FilterBar, SearchInput, SelectFilter } from '../components/ui/Filters';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

interface ProviderRow {
  id: string; email: string | null; phone: string | null; status: string; createdAt: string; lastLoginAt: string | null;
  profile: { firstName: string; lastName: string; city: string | null; idVerified: boolean } | null;
  providerProfile: { isAvailable: boolean; ratingAverage: string | number; ratingCount: number; completedJobs: number } | null;
}

const STATUS: Record<string, string> = { active: 'Actif', pending: 'En attente', suspended: 'Suspendu', banned: 'Banni' };

export default function Providers() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '', verified: '', sort: 'createdAt:desc' });
  const set = (k: keyof typeof filters) => (v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const { data, isLoading, error } = useQuery<{ data: ProviderRow[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['admin-providers', page, filters],
    queryFn: () => api.get('/admin/providers', { params: { page, limit: 20, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) } }).then((r) => r.data),
  });

  if (isForbidden(error)) return <AccessDenied permission="Voir prestataires" />;
  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Prestataires</h1>
        <p className="text-sm text-gray-400">Vérification d’identité et changements de statut : fiche de l’utilisateur (page Utilisateurs).</p>
      </div>
      <FilterBar>
        <SearchInput value={filters.search} onChange={set('search')} placeholder="Nom, e-mail, téléphone…" />
        <SelectFilter label="Statut" value={filters.status} onChange={set('status')} options={[{ value: '', label: 'Tous' }, ...Object.entries(STATUS).map(([value, label]) => ({ value, label }))]} />
        <SelectFilter label="Identité" value={filters.verified} onChange={set('verified')} options={[{ value: '', label: 'Toutes' }, { value: 'true', label: 'Vérifiée' }, { value: 'false', label: 'Non vérifiée' }]} />
        <SelectFilter label="Tri" value={filters.sort} onChange={set('sort')} options={[{ value: 'createdAt:desc', label: 'Inscription récente' }, { value: 'lastLoginAt:desc', label: 'Connexion récente' }]} />
      </FilterBar>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1a2744]">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-white/10 text-gray-400">
            <th scope="col" className="px-4 py-3 text-left font-medium">Nom</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Contact</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Ville</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Note</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Missions</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Identité</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Statut</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Chargement…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun prestataire ne correspond.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 text-white">{p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : '—'}</td>
                <td className="px-4 py-3 text-gray-300">{p.email ?? p.phone ?? '—'}</td>
                <td className="px-4 py-3 text-gray-300">{p.profile?.city ?? '—'}</td>
                <td className="px-4 py-3 text-gray-300">{p.providerProfile && p.providerProfile.ratingCount > 0 ? `${Number(p.providerProfile.ratingAverage).toFixed(1)} (${p.providerProfile.ratingCount})` : '—'}</td>
                <td className="px-4 py-3 text-gray-300">{p.providerProfile?.completedJobs ?? 0}</td>
                <td className="px-4 py-3">{p.profile?.idVerified ? <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Vérifiée</span> : <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-gray-300">Non vérifiée</span>}</td>
                <td className="px-4 py-3 text-gray-300">{STATUS[p.status] ?? p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="prestataires" onChange={setPage} />}
    </div>
  );
}
