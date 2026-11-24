import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import AccessDenied, { isForbidden } from '../../components/AccessDenied';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { CheckboxField, LOCALES, SelectField, TextField, fieldErrors } from '../../components/ui/Field';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

interface Country { code: string; name: string; dialCode: string; currency: string; defaultLocale: string; isActive: boolean; sortOrder: number }
const EMPTY: Country = { code: '', name: '', dialCode: '+', currency: 'XOF', defaultLocale: 'fr', isActive: false, sortOrder: 0 };

function Editor({ item, onClose }: { item: Country | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [d, setD] = useState<Country>(EMPTY);
  const isNew = item === 'new';
  useEffect(() => { setD(item && item !== 'new' ? item : EMPTY); }, [item]);
  const save = useMutation({
    mutationFn: () => {
      const { code, ...rest } = d;
      const body = { ...rest, sortOrder: Number(rest.sortOrder) || 0 };
      return (isNew ? api.post('/admin/countries', { code, ...body }) : api.put(`/admin/countries/${code}`, body)).then((r) => r.data);
    },
    onSuccess: () => { toast.success('Pays enregistré'); qc.invalidateQueries({ queryKey: ['admin-countries'] }); onClose(); },
  });
  const errors = fieldErrors(save.error);
  const set = (k: keyof Country) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={isNew ? 'Ajouter un pays' : `Modifier ${d.name}`}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Code ISO" required disabled={!isNew} value={d.code} onChange={(e) => setD((x) => ({ ...x, code: e.target.value.toUpperCase() }))} maxLength={2} error={errors.code} hint="2 lettres (ex. : CI)" />
          <TextField label="Nom" required value={d.name} onChange={set('name')} maxLength={100} error={errors.name} />
          <TextField label="Indicatif" required value={d.dialCode} onChange={set('dialCode')} maxLength={5} error={errors.dialCode} hint="Format +225" />
          <TextField label="Devise" required value={d.currency} onChange={(e) => setD((x) => ({ ...x, currency: e.target.value.toUpperCase() }))} maxLength={3} error={errors.currency} hint="ISO 4217 (ex. : XOF)" />
          <SelectField label="Langue par défaut" value={d.defaultLocale} onChange={set('defaultLocale')}>{LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</SelectField>
          <TextField label="Ordre d’affichage" type="number" min={0} value={d.sortOrder} onChange={set('sortOrder')} error={errors.sortOrder} />
        </div>
        <CheckboxField label="Pays actif" hint="Affiché sur le site (accueil, inscription, contact)." checked={d.isActive} onChange={(v) => setD((x) => ({ ...x, isActive: v }))} />
        {save.isError && !Object.keys(errors).length && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(save.error)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Annuler</button>
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Countries() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Country | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Country | null>(null);
  const { data, isLoading, error } = useQuery<{ items: Country[] }>({
    queryKey: ['admin-countries'],
    queryFn: () => api.get('/admin/countries').then((r) => r.data),
  });
  const remove = useMutation({
    mutationFn: (code: string) => api.delete(`/admin/countries/${code}`),
    onSuccess: () => { toast.success('Pays supprimé'); setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-countries'] }); },
  });
  if (isForbidden(error)) return <AccessDenied permission="Gérer les paramètres" />;
  const items = data?.items ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Pays desservis</h1>
          <p className="text-sm text-gray-400">Aucun pays n’est présupposé : seuls les pays actifs apparaissent sur le site.</p>
        </div>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter un pays</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1a2744]">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-b border-white/10 text-gray-400">
            <th scope="col" className="px-4 py-3 text-left font-medium">Pays</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Indicatif</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Devise</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Langue</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">État</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Chargement…</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucun pays configuré.</td></tr>}
            {items.map((c) => (
              <tr key={c.code} className="border-b border-white/5">
                <td className="px-4 py-3 text-white">{c.name} <span className="text-gray-500">({c.code})</span></td>
                <td className="px-4 py-3 text-gray-300">{c.dialCode}</td>
                <td className="px-4 py-3 text-gray-300">{c.currency}</td>
                <td className="px-4 py-3 uppercase text-gray-300">{c.defaultLocale}</td>
                <td className="px-4 py-3">{c.isActive ? <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-300">Actif</span> : <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-gray-300">Inactif</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(c)} className="mr-2 rounded-lg border border-white/15 px-3 py-1 text-xs">Modifier</button>
                  <button onClick={() => { remove.reset(); setDeleting(c); }} className="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-300">Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Editor item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={Boolean(deleting)} danger title="Supprimer le pays"
        message="Refusé si le pays est utilisé (paramètres, annonces, profils) : désactivez-le dans ce cas." confirmLabel="Supprimer"
        busy={remove.isPending} error={remove.isError ? getApiErrorMessage(remove.error) : null}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.code)} />
    </div>
  );
}
