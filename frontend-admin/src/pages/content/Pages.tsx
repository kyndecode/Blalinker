import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import AccessDenied, { isForbidden } from '../../components/AccessDenied';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/Toast';
import { LOCALES, STATUS_BADGE, STATUS_OPTIONS, SelectField, TextArea, TextField, fieldErrors } from '../../components/ui/Field';
import Markdown from '../../components/content/Markdown';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

interface PageRow { id: string; slug: string; locale: string; title: string; status: string; publishedAt: string | null; updatedAt: string }
interface PageFull extends PageRow { summary: string | null; body: string }
type Draft = { slug: string; locale: string; title: string; summary: string; body: string; status: string };

/** Pages reliées à une adresse fixe du site (les autres sont servies sur /page/:slug). */
export const RESERVED_SLUGS: Record<string, string> = {
  'legal-notice': 'Mentions légales (/legal-notice)',
  privacy: 'Confidentialité (/privacy)',
  terms: 'Conditions générales (/terms)',
  about: 'À propos (/about)',
};

const EMPTY: Draft = { slug: '', locale: 'fr', title: '', summary: '', body: '', status: 'draft' };

function PageEditor({ pageId, onClose }: { pageId: string | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const isNew = pageId === 'new';

  const { data: existing, isLoading } = useQuery<PageFull>({
    queryKey: ['admin-page', pageId],
    queryFn: () => api.get(`/admin/content/pages/${pageId}`).then((r) => r.data),
    enabled: Boolean(pageId) && !isNew,
  });
  useEffect(() => {
    if (isNew) setDraft(EMPTY);
    else if (existing) setDraft({ slug: existing.slug, locale: existing.locale, title: existing.title, summary: existing.summary ?? '', body: existing.body, status: existing.status });
    setTab('edit');
  }, [existing, isNew, pageId]);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...draft, summary: draft.summary.trim() || null };
      return isNew ? api.post('/admin/content/pages', body) : api.put(`/admin/content/pages/${pageId}`, body);
    },
    onSuccess: () => {
      toast.success(draft.status === 'published' ? 'Page enregistrée et publiée' : 'Page enregistrée');
      qc.invalidateQueries({ queryKey: ['admin-pages'] });
      qc.invalidateQueries({ queryKey: ['admin-page'] });
      onClose();
    },
  });
  const errors = fieldErrors(save.error);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  return (
    <Modal open={Boolean(pageId)} onClose={onClose} title={isNew ? 'Nouvelle page' : 'Modifier la page'} size="lg">
      {!isNew && isLoading ? <p className="text-sm text-gray-400">Chargement…</p> : (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Identifiant (adresse)" required value={draft.slug} onChange={set('slug')} error={errors.slug}
              hint={RESERVED_SLUGS[draft.slug] ?? (draft.slug ? `/page/${draft.slug}` : 'minuscules, chiffres, tirets')} />
            <SelectField label="Langue" value={draft.locale} onChange={set('locale')} error={errors.locale}>
              {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </SelectField>
            <SelectField label="Statut" value={draft.status} onChange={set('status')} error={errors.status}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SelectField>
          </div>
          <TextField label="Titre" required value={draft.title} onChange={set('title')} error={errors.title} maxLength={200} />
          <TextField label="Résumé" value={draft.summary} onChange={set('summary')} error={errors.summary} maxLength={500} />
          <div role="tablist" aria-label="Édition ou aperçu" className="flex gap-1">
            {(['edit', 'preview'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-xs ${tab === t ? 'bg-green-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}>
                {t === 'edit' ? 'Rédaction' : 'Aperçu'}
              </button>
            ))}
          </div>
          {tab === 'edit' ? (
            <TextArea label="Contenu" required rows={14} value={draft.body} onChange={set('body')} error={errors.body} maxLength={50_000}
              hint="## Titre, - liste, **gras**, *italique*, [lien](https://… ou /chemin), ![image](https://…). Le HTML n’est pas interprété." />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-white/10 bg-[#0f1b33] p-4" data-testid="page-preview">
              <h1 className="text-xl font-bold">{draft.title || 'Sans titre'}</h1>
              {draft.summary && <p className="mt-1 text-gray-300">{draft.summary}</p>}
              <Markdown source={draft.body} className="mt-4" />
            </div>
          )}
          {save.isError && !Object.keys(errors).length && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(save.error)}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Annuler</button>
            <button type="submit" disabled={save.isPending} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function Pages() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PageRow | null>(null);

  const { data, isLoading, error } = useQuery<{ data: PageRow[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['admin-pages', page],
    queryFn: () => api.get('/admin/content/pages', { params: { page, limit: 20 } }).then((r) => r.data),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/content/pages/${id}`),
    onSuccess: () => { toast.success('Page supprimée (contenu conservé au journal d’audit)'); setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-pages'] }); },
  });

  if (isForbidden(error)) return <AccessDenied permission="Gérer les contenus" />;
  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Pages du site</h1>
          <p className="text-sm text-gray-400">Sans page publiée, le site affiche son texte intégré.</p>
        </div>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
          <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle page
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1a2744]">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-white/10 text-gray-400">
            <th scope="col" className="px-4 py-3 text-left font-medium">Titre</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Adresse</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Langue</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Statut</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Modifiée</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Chargement…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucune page : le site utilise ses textes intégrés.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 text-white">{p.title}</td>
                <td className="px-4 py-3 text-gray-300">{RESERVED_SLUGS[p.slug] ?? `/page/${p.slug}`}</td>
                <td className="px-4 py-3 uppercase text-gray-300">{p.locale}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[p.status]?.cls ?? ''}`}>{STATUS_BADGE[p.status]?.label ?? p.status}</span></td>
                <td className="px-4 py-3 text-gray-400">{new Date(p.updatedAt).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(p.id)} aria-label={`Modifier ${p.title}`} className="mr-2 rounded-lg border border-white/15 px-3 py-1 text-xs">Modifier</button>
                  <button onClick={() => { remove.reset(); setDeleting(p); }} aria-label={`Supprimer ${p.title}`} className="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-300">Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="pages" onChange={setPage} />}
      <PageEditor pageId={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={Boolean(deleting)} danger title="Supprimer la page"
        message={`« ${deleting?.title ?? ''} » ne sera plus servie ; le site reviendra à son texte intégré s'il en a un. Le contenu reste au journal d'audit.`}
        confirmLabel="Supprimer" busy={remove.isPending} error={remove.isError ? getApiErrorMessage(remove.error) : null}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}
