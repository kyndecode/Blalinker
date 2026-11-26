import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import AccessDenied, { isForbidden } from '../../components/AccessDenied';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { LOCALES, STATUS_BADGE, STATUS_OPTIONS, SelectField, TextArea, TextField, fieldErrors } from '../../components/ui/Field';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

interface FaqItem { id: string; locale: string; category: string | null; question: string; answer: string; status: string; sortOrder: number }
type Draft = Omit<FaqItem, 'id' | 'category'> & { category: string };
const EMPTY: Draft = { locale: 'fr', category: '', question: '', answer: '', status: 'draft', sortOrder: 0 };

function FaqEditor({ item, onClose }: { item: FaqItem | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const isNew = item === 'new';
  useEffect(() => {
    setDraft(item && item !== 'new'
      ? { locale: item.locale, category: item.category ?? '', question: item.question, answer: item.answer, status: item.status, sortOrder: item.sortOrder }
      : EMPTY);
  }, [item]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...draft, category: draft.category.trim() || null, sortOrder: Number(draft.sortOrder) || 0 };
      return isNew ? api.post('/admin/content/faq', body) : api.put(`/admin/content/faq/${(item as FaqItem).id}`, body);
    },
    onSuccess: () => { toast.success('Question enregistrée'); qc.invalidateQueries({ queryKey: ['admin-faq'] }); onClose(); },
  });
  const errors = fieldErrors(save.error);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={isNew ? 'Nouvelle question' : 'Modifier la question'} size="lg">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Langue" value={draft.locale} onChange={set('locale')}>{LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</SelectField>
          <SelectField label="Statut" value={draft.status} onChange={set('status')}>{STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</SelectField>
          <TextField label="Ordre" type="number" min={0} value={draft.sortOrder} onChange={set('sortOrder')} error={errors.sortOrder} />
        </div>
        <TextField label="Rubrique" value={draft.category} onChange={set('category')} maxLength={100} hint="Facultatif (ex. : Paiement, Compte)" />
        <TextField label="Question" required value={draft.question} onChange={set('question')} error={errors.question} maxLength={300} />
        <TextArea label="Réponse" required rows={6} value={draft.answer} onChange={set('answer')} error={errors.answer} maxLength={5000}
          hint="Markdown restreint : **gras**, listes, [lien](https://…)." />
        {save.isError && !Object.keys(errors).length && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(save.error)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Annuler</button>
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Faq() {
  const qc = useQueryClient();
  const toast = useToast();
  const [locale, setLocale] = useState('fr');
  const [editing, setEditing] = useState<FaqItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<FaqItem | null>(null);
  const { data, isLoading, error } = useQuery<{ items: FaqItem[] }>({
    queryKey: ['admin-faq', locale],
    queryFn: () => api.get('/admin/content/faq', { params: { locale } }).then((r) => r.data),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/content/faq/${id}`),
    onSuccess: () => { toast.success('Question supprimée'); setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-faq'] }); },
  });
  if (isForbidden(error)) return <AccessDenied permission="Gérer les contenus" />;
  const items = data?.items ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Foire aux questions</h1>
          <p className="text-sm text-gray-400">Sans question publiée dans une langue, le site affiche sa FAQ intégrée.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Langue" value={locale} onChange={(e) => setLocale(e.target.value)} className="rounded-lg border border-white/10 bg-[#1a2744] px-3 py-2 text-sm text-white">
            {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter</button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {!isLoading && items.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-400">Aucune question dans cette langue.</p>}
      <ul className="space-y-2">
        {items.map((q) => (
          <li key={q.id} className="rounded-xl border border-white/10 bg-[#1a2744] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium text-white">{q.question}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[q.status]?.cls ?? ''}`}>{STATUS_BADGE[q.status]?.label}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-gray-300">{q.answer}</p>
            <p className="mt-1 text-xs text-gray-400">{q.category ? `${q.category} · ` : ''}ordre {q.sortOrder}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setEditing(q)} className="rounded-lg border border-white/15 px-3 py-1 text-xs">Modifier</button>
              <button onClick={() => { remove.reset(); setDeleting(q); }} className="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-300">Supprimer</button>
            </div>
          </li>
        ))}
      </ul>
      <FaqEditor item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={Boolean(deleting)} danger title="Supprimer la question" message={deleting?.question ?? ''} confirmLabel="Supprimer"
        busy={remove.isPending} error={remove.isError ? getApiErrorMessage(remove.error) : null}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}
