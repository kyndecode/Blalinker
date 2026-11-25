import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ExportButton from '../components/ui/ExportButton';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { DateFilter, FilterBar, SelectFilter } from '../components/ui/Filters';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

interface TxRow {
  id: string; bookingId: string; amount: string; commission: string; netAmount: string; currency: string;
  method: string; status: string; paidAt: string | null; releasedAt: string | null; createdAt: string;
}

const TX_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-yellow-900/50 text-yellow-300' },
  processing: { label: 'En cours', cls: 'bg-blue-900/50 text-blue-300' },
  completed: { label: 'Payée', cls: 'bg-green-900/50 text-green-300' },
  failed: { label: 'Échec', cls: 'bg-red-900/50 text-red-300' },
  refunded: { label: 'Remboursée', cls: 'bg-white/10 text-gray-300' },
};
const METHODS: Record<string, string> = {
  wave: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money', mtn_momo: 'MTN MoMo', cash: 'Espèces', bank_transfer: 'Virement',
};
const money = (v: string | number, c: string) => `${Number(v).toLocaleString('fr-FR')} ${c}`;

export default function Transactions() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', method: '', from: '', to: '', sort: 'createdAt:desc' });
  const [refunding, setRefunding] = useState<TxRow | null>(null);
  const set = (k: keyof typeof filters) => (v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const { data, isLoading, error } = useQuery<{ data: TxRow[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['admin-transactions', page, filters],
    queryFn: () => api.get('/admin/transactions', { params: { page, limit: 20, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) } }).then((r) => r.data),
  });
  const refund = useMutation({
    mutationFn: (id: string) => api.post(`/admin/transactions/${id}/refund`),
    onSuccess: () => { toast.success('Remboursement enregistré'); setRefunding(null); qc.invalidateQueries({ queryKey: ['admin-transactions'] }); },
  });

  if (isForbidden(error)) return <AccessDenied permission="Voir paiements" />;
  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <ExportButton dataset="transactions" params={filters} />
      </div>
      <FilterBar>
        <SelectFilter label="Statut" value={filters.status} onChange={set('status')} options={[{ value: '', label: 'Tous' }, ...Object.entries(TX_STATUS).map(([value, s]) => ({ value, label: s.label }))]} />
        <SelectFilter label="Moyen" value={filters.method} onChange={set('method')} options={[{ value: '', label: 'Tous' }, ...Object.entries(METHODS).map(([value, label]) => ({ value, label }))]} />
        <DateFilter label="Du" value={filters.from} onChange={set('from')} />
        <DateFilter label="Au" value={filters.to} onChange={set('to')} />
        <SelectFilter label="Tri" value={filters.sort} onChange={set('sort')} options={[
          { value: 'createdAt:desc', label: 'Plus récentes' }, { value: 'amount:desc', label: 'Montant décroissant' }, { value: 'paidAt:desc', label: 'Paiement le plus récent' },
        ]} />
      </FilterBar>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      <div role="region" aria-label="Tableau : Transactions" tabIndex={0} className="relative overflow-x-auto rounded-xl border border-white/10 bg-[#1a2744] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-white/10 text-gray-400">
            <th scope="col" className="px-4 py-3 text-left font-medium">Référence</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Montant</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Commission</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Moyen</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Statut</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Date</th>
            <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Chargement…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucune transaction ne correspond.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-xs text-gray-300">{t.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-white">{money(t.amount, t.currency)}</td>
                <td className="px-4 py-3 text-gray-300">{money(t.commission, t.currency)}</td>
                <td className="px-4 py-3 text-gray-300">{METHODS[t.method] ?? t.method}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${TX_STATUS[t.status]?.cls ?? ''}`}>{TX_STATUS[t.status]?.label ?? t.status}</span>
                  {t.releasedAt && <span className="ml-1 text-xs text-gray-500">fonds libérés</span>}
                </td>
                <td className="px-4 py-3 text-gray-400">{new Date(t.createdAt).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3 text-right">
                  {t.status === 'completed' && !t.releasedAt && (
                    <button onClick={() => { refund.reset(); setRefunding(t); }} className="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10">Rembourser</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="transactions" onChange={setPage} />}
      <ConfirmDialog open={Boolean(refunding)} danger title="Rembourser ce paiement"
        message={refunding ? `${money(refunding.amount, refunding.currency)} : la réservation liée sera annulée. Action journalisée, réservée à la permission « Rembourser ».` : ''}
        confirmLabel="Rembourser" busy={refund.isPending} error={refund.isError ? getApiErrorMessage(refund.error) : null}
        onClose={() => setRefunding(null)} onConfirm={() => refunding && refund.mutate(refunding.id)} />
    </div>
  );
}
