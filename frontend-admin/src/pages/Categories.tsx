import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import AccessDenied, { isForbidden } from '../components/AccessDenied';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { CheckboxField, SelectField, TextArea, TextField, fieldErrors } from '../components/ui/Field';
import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

interface Category {
  id: string; name: string; slug: string; description: string | null; iconUrl: string | null;
  isActive: boolean; sortOrder: number; parentId: string | null; _count?: { services: number };
}
type Draft = { name: string; slug: string; description: string; iconUrl: string; isActive: boolean; sortOrder: number; parentId: string };
const EMPTY: Draft = { name: '', slug: '', description: '', iconUrl: '', isActive: true, sortOrder: 0, parentId: '' };

/** « Électricité générale » → « electricite-generale » */
export function slugify(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

function Icon({ value, name }: { value: string | null; name: string }) {
  return value && /^https:\/\//i.test(value)
    ? <img src={value} alt="" className="h-10 w-10 rounded-lg object-cover" />
    : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-xl" aria-hidden="true">{value || name.charAt(0)}</div>;
}

function Editor({ item, all, onClose }: { item: Category | 'new' | null; all: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [d, setD] = useState<Draft>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const isNew = item === 'new';
  useEffect(() => {
    setSlugTouched(!isNew);
    setD(item && item !== 'new'
      ? { name: item.name, slug: item.slug, description: item.description ?? '', iconUrl: item.iconUrl ?? '', isActive: item.isActive, sortOrder: item.sortOrder, parentId: item.parentId ?? '' }
      : EMPTY);
  }, [item, isNew]);
  // Parents possibles : catégories de premier niveau, autres que celle-ci.
  const parents = all.filter((c) => !c.parentId && (item === 'new' || c.id !== item?.id));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: d.name, slug: d.slug, description: d.description.trim() || undefined, iconUrl: d.iconUrl.trim() || undefined,
        isActive: d.isActive, sortOrder: Number(d.sortOrder) || 0, parentId: d.parentId || null,
      };
      return isNew ? api.post('/admin/categories', body) : api.put(`/admin/categories/${(item as Category).id}`, body);
    },
    onSuccess: () => { toast.success('Catégorie enregistrée'); qc.invalidateQueries({ queryKey: ['admin-categories'] }); onClose(); },
  });
  const errors = fieldErrors(save.error);
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={isNew ? 'Nouvelle catégorie' : 'Modifier la catégorie'}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <TextField label="Nom" required value={d.name} maxLength={100} error={errors.name}
          onChange={(e) => { const name = e.target.value; setD((x) => ({ ...x, name, slug: slugTouched ? x.slug : slugify(name) })); }} />
        <TextField label="Identifiant (adresse)" required value={d.slug} maxLength={100} error={errors.slug} hint="minuscules, chiffres, tirets"
          onChange={(e) => { setSlugTouched(true); setD((x) => ({ ...x, slug: e.target.value })); }} />
        <TextArea label="Description" rows={2} value={d.description} maxLength={1000} error={errors.description} onChange={(e) => setD((x) => ({ ...x, description: e.target.value }))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Icône" value={d.iconUrl} error={errors.iconUrl} hint="Émoji ou adresse https:// (médiathèque)" onChange={(e) => setD((x) => ({ ...x, iconUrl: e.target.value }))} />
          <TextField label="Ordre" type="number" min={0} value={d.sortOrder} error={errors.sortOrder} onChange={(e) => setD((x) => ({ ...x, sortOrder: Number(e.target.value) }))} />
        </div>
        <SelectField label="Catégorie parente" value={d.parentId} error={errors.parentId} onChange={(e) => setD((x) => ({ ...x, parentId: e.target.value }))}>
          <option value="">Aucune (premier niveau)</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </SelectField>
        <CheckboxField label="Active" hint="Une catégorie inactive disparaît du site sans être supprimée." checked={d.isActive} onChange={(v) => setD((x) => ({ ...x, isActive: v }))} />
        {save.isError && !Object.keys(errors).length && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(save.error)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Annuler</button>
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Categories() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const { data, isLoading, error } = useQuery<Category[] | { data: Category[] }>({
    queryKey: ['admin-categories'],
    queryFn: () => api.get('/admin/categories').then((r) => r.data),
  });
  const categories = useMemo(() => (Array.isArray(data) ? data : data?.data ?? []), [data]);
  const tree = useMemo(() => {
    const roots = categories.filter((c) => !c.parentId);
    return roots.map((root) => ({ root, children: categories.filter((c) => c.parentId === root.id) }));
  }, [categories]);

  const toggle = useMutation({
    mutationFn: (c: Category) => api.put(`/admin/categories/${c.id}`, { isActive: !c.isActive }),
    onSuccess: () => { toast.success('Catégorie mise à jour'); qc.invalidateQueries({ queryKey: ['admin-categories'] }); },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/categories/${id}`),
    onSuccess: () => { toast.success('Catégorie supprimée'); setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-categories'] }); },
  });

  if (isForbidden(error)) return <AccessDenied permission="Gérer catégories" />;

  const row = (c: Category, child = false) => (
    <li key={c.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#1a2744] p-3 ${child ? 'ml-6 sm:ml-10' : ''}`}>
      <Icon value={c.iconUrl} name={c.name} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">{c.name} {!c.isActive && <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal text-gray-300">Inactive</span>}</p>
        <p className="text-xs text-gray-400">/{c.slug} · {c._count?.services ?? 0} prestation(s) · ordre {c.sortOrder}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setEditing(c)} aria-label={`Modifier ${c.name}`} className="rounded-lg border border-white/15 px-3 py-1 text-xs">Modifier</button>
        <button onClick={() => toggle.mutate(c)} className="rounded-lg border border-white/15 px-3 py-1 text-xs">{c.isActive ? 'Désactiver' : 'Activer'}</button>
        <button onClick={() => { remove.reset(); setDeleting(c); }} aria-label={`Supprimer ${c.name}`} className="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-300">Supprimer</button>
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Catégories</h1>
          <p className="text-sm text-gray-400">Les catégories actives de premier niveau apparaissent sur l’accueil du site.</p>
        </div>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle catégorie</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {!isLoading && categories.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-400">Aucune catégorie pour le moment.</p>}
      <ul className="space-y-2">
        {tree.map(({ root, children }) => [row(root), ...children.map((c) => row(c, true))])}
      </ul>
      <Editor item={editing} all={categories} onClose={() => setEditing(null)} />
      <ConfirmDialog open={Boolean(deleting)} danger title={`Supprimer « ${deleting?.name ?? ''} »`}
        message="Refusé si des prestations ou des sous-catégories l’utilisent : désactivez-la dans ce cas." confirmLabel="Supprimer"
        busy={remove.isPending} error={remove.isError ? getApiErrorMessage(remove.error) : null}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}
