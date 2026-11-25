import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import ExportButton from '../components/ui/ExportButton';
import Pagination from '../components/ui/Pagination';
import { DateFilter, FilterBar, SearchInput, SelectFilter } from '../components/ui/Filters';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

interface Person { email: string | null; firstName: string; lastName: string }
interface BookingRow {
  id: string; status: string; amount: string | null; currency: string; scheduledAt: string | null; createdAt: string;
  client: Person; provider: Person; service: { name: string } | null;
}

export const BOOKING_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-yellow-900/50 text-yellow-300' },
  accepted: { label: 'Acceptée', cls: 'bg-blue-900/50 text-blue-300' },
  in_progress: { label: 'En cours', cls: 'bg-blue-900/50 text-blue-300' },
  completed: { label: 'Terminée', cls: 'bg-green-900/50 text-green-300' },
  validated: { label: 'Validée', cls: 'bg-green-900/50 text-green-300' },
  rejected: { label: 'Refusée', cls: 'bg-red-900/50 text-red-300' },
  cancelled: { label: 'Annulée', cls: 'bg-white/10 text-gray-300' },
  disputed: { label: 'En litige', cls: 'bg-orange-900/50 text-orange-300' },
};

const who = (p: Person) => `${p.firstName} ${p.lastName}`.trim() || p.email || '-';

export default function Bookings() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '', sort: 'createdAt:desc' });
  const set = (k: keyof typeof filters) => (v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const params = { ...filters, page: String(page), limit: '20' };

  const { data, isLoading, error } = useQuery<{ data: BookingRow[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['admin-bookings', params],
    queryFn: () => api.get('/admin/bookings', { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)) }).then((r) => r.data),
  });

  if (isForbidden(error)) return <AccessDenied permission="Voir réservations" />;
  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Réservations</h1>
        <ExportButton dataset="bookings" params={filters} />
      </div>
      <FilterBar>
        <SearchInput value={filters.search} onChange={set('search')} placeholder="Client, prestataire, service…" />
        <SelectFilter label="Statut" value={filters.status} onChange={set('status')}
          options={[{ value: '', label: 'Tous' }, ...Object.entries(BOOKING_STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
        <DateFilter label="Du" value={filters.from} onChange={set('from')} />
        <DateFilter label="Au" value={filters.to} onChange={set('to')} />
        <SelectFilter label="Tri" value={filters.sort} onChange={set('sort')} options={[
          { value: 'createdAt:desc', label: 'Plus récentes' }, { value: 'createdAt:asc', label: 'Plus anciennes' },
          { value: 'scheduledAt:asc', label: 'Date prévue' }, { value: 'amount:desc', label: 'Montant décroissant' },
        ]} />
      </FilterBar>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      <div role="region" aria-label="Tableau : Réservations" tabIndex={0} className="relative overflow-x-auto rounded-xl border border-white/10 bg-[#1a2744] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-white/10 text-gray-400">
            <th scope="col" className="px-4 py-3 text-left font-medium">Service</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Client</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Prestataire</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Montant</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Statut</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Créée</th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Chargement…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucune réservation ne correspond.</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 text-white">{b.service?.name ?? '-'}</td>
                <td className="px-4 py-3 text-gray-300">{who(b.client)}</td>
                <td className="px-4 py-3 text-gray-300">{who(b.provider)}</td>
                <td className="px-4 py-3 text-gray-300">{b.amount ? `${Number(b.amount).toLocaleString('fr-FR')} ${b.currency}` : '-'}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${BOOKING_STATUS[b.status]?.cls ?? ''}`}>{BOOKING_STATUS[b.status]?.label ?? b.status}</span></td>
                <td className="px-4 py-3 text-gray-400">{new Date(b.createdAt).toLocaleDateString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="réservations" onChange={setPage} />}
    </div>
  );
}
