import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied, { isForbidden } from '../../components/AccessDenied';
import { useToast } from '../../components/ui/Toast';
import { LOCALES } from '../../components/ui/Field';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

type Kind = 'email' | 'phone' | 'text' | 'url' | 'localized' | 'country';
interface CatalogEntry { key: string; label: string; group: string; kind: Kind }
interface SettingRow { id: string; key: string; scope: string; value: unknown; updatedAt: string }
interface Country { code: string; name: string; isActive: boolean }

type LocalizedValue = Partial<Record<'fr' | 'en' | 'wo', string>>;

function SettingEditor({ entry, scope, row }: { entry: CatalogEntry; scope: string; row?: SettingRow }) {
  const qc = useQueryClient();
  const toast = useToast();
  const initial = row?.value;
  const [text, setText] = useState(typeof initial === 'string' ? initial : '');
  const [loc, setLoc] = useState<LocalizedValue>(initial && typeof initial === 'object' ? initial as LocalizedValue : {});
  useEffect(() => {
    setText(typeof initial === 'string' ? initial : '');
    setLoc(initial && typeof initial === 'object' ? initial as LocalizedValue : {});
  }, [initial, scope]);

  const save = useMutation({
    mutationFn: () => {
      const value = entry.kind === 'localized'
        ? Object.fromEntries(Object.entries(loc).filter(([, v]) => v && v.trim()))
        : text.trim();
      return api.put('/admin/settings', { key: entry.key, scope, value });
    },
    onSuccess: () => { toast.success(`« ${entry.label} » enregistré`); qc.invalidateQueries({ queryKey: ['admin-settings'] }); },
  });
  const reset = useMutation({
    mutationFn: () => api.delete(`/admin/settings/${encodeURIComponent(entry.key)}`, { params: { scope } }),
    onSuccess: () => { toast.success('Valeur par défaut rétablie'); qc.invalidateQueries({ queryKey: ['admin-settings'] }); },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
  const id = `setting-${entry.key.replace(/\W/g, '-')}`;
  const inputType = entry.kind === 'email' ? 'email' : entry.kind === 'url' ? 'url' : entry.kind === 'phone' ? 'tel' : 'text';

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="rounded-lg border border-white/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={entry.kind === 'localized' ? `${id}-fr` : id} className="text-sm font-medium text-gray-100">{entry.label}</label>
        <span className="text-[11px] text-gray-500">{row ? `modifié le ${new Date(row.updatedAt).toLocaleDateString('fr-FR')}` : scope === 'global' ? 'valeur intégrée au site' : 'valeur globale'}</span>
      </div>
      {entry.kind === 'localized' ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {LOCALES.map((l) => (
            <div key={l.value}>
              <label htmlFor={`${id}-${l.value}`} className="text-xs text-gray-400">{l.label}</label>
              <input id={`${id}-${l.value}`} value={loc[l.value] ?? ''} onChange={(e) => setLoc((v) => ({ ...v, [l.value]: e.target.value }))}
                className="w-full rounded border border-white/10 bg-[#0f1b33] px-2 py-1.5 text-sm text-white" />
            </div>
          ))}
        </div>
      ) : (
        <input id={id} type={inputType} value={text} onChange={(e) => setText(entry.kind === 'country' ? e.target.value.toUpperCase() : e.target.value)}
          maxLength={entry.kind === 'country' ? 2 : 500} placeholder={entry.kind === 'url' ? 'https://…' : entry.kind === 'country' ? 'Code ISO (ex. : CI)' : ''}
          className="mt-2 w-full rounded border border-white/10 bg-[#0f1b33] px-2 py-1.5 text-sm text-white" />
      )}
      {save.isError && <p role="alert" className="mt-1 text-xs text-red-400">{getApiErrorMessage(save.error)}</p>}
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={save.isPending} className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">{save.isPending ? '…' : 'Enregistrer'}</button>
        {row && <button type="button" onClick={() => reset.mutate()} disabled={reset.isPending} className="rounded border border-white/15 px-3 py-1 text-xs">Revenir à la valeur par défaut</button>}
      </div>
    </form>
  );
}

export default function Settings() {
  const [scope, setScope] = useState('global');
  const { data, isLoading, error } = useQuery<{ catalog: CatalogEntry[]; items: SettingRow[] }>({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings').then((r) => r.data),
  });
  const { data: countries } = useQuery<{ items: Country[] }>({
    queryKey: ['admin-countries'],
    queryFn: () => api.get('/admin/countries').then((r) => r.data),
  });
  const groups = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const e of data?.catalog ?? []) map.set(e.group, [...(map.get(e.group) ?? []), e]);
    return [...map.entries()];
  }, [data]);

  if (isForbidden(error)) return <AccessDenied permission="Gérer les paramètres" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Paramètres du site</h1>
          <p className="text-sm text-gray-400">Valeurs publiques affichées sur le site, sans recompilation. Une valeur par pays remplace la valeur globale.</p>
        </div>
        <label className="text-sm text-gray-300">
          Portée{' '}
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="ml-1 rounded-lg border border-white/10 bg-[#1a2744] px-3 py-2 text-sm text-white">
            <option value="global">Tous les pays (global)</option>
            {(countries?.items ?? []).map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code}){c.isActive ? '' : ' — inactif'}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {groups.map(([group, entries]) => (
        <section key={group} aria-labelledby={`grp-${group}`} className="space-y-2 rounded-xl border border-white/10 bg-[#1a2744] p-4">
          <h2 id={`grp-${group}`} className="font-semibold text-white">{group}</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {entries.map((entry) => (
              <SettingEditor key={`${entry.key}-${scope}`} entry={entry} scope={scope}
                row={data?.items.find((r) => r.key === entry.key && r.scope === scope)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
