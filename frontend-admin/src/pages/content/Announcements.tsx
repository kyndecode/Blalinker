import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import AccessDenied, { isForbidden } from '../../components/AccessDenied';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { LOCALES, STATUS_BADGE, STATUS_OPTIONS, SelectField, TextField, fieldErrors, useFocusFirstError } from '../../components/ui/Field';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

interface Announcement {
  id: string; message: string; linkUrl: string | null; linkLabel: string | null; level: string;
  locale: string | null; countryCode: string | null; status: string; startsAt: string | null; endsAt: string | null; sortOrder: number;
}
type Draft = { message: string; linkUrl: string; linkLabel: string; level: string; locale: string; countryCode: string; status: string; startsAt: string; endsAt: string };
const EMPTY: Draft = { message: '', linkUrl: '', linkLabel: '', level: 'info', locale: '', countryCode: '', status: 'draft', startsAt: '', endsAt: '' };

/** « 2026-11-25T10:00:00.000Z » ↔ champ datetime-local (heure locale du navigateur). */
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function isLive(a: Announcement) {
  const now = Date.now();
  return a.status === 'published' && (!a.startsAt || new Date(a.startsAt).getTime() <= now) && (!a.endsAt || new Date(a.endsAt).getTime() > now);
}

function Editor({ item, onClose }: { item: Announcement | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [d, setD] = useState<Draft>(EMPTY);
  const isNew = item === 'new';
  useEffect(() => {
    setD(item && item !== 'new'
      ? { message: item.message, linkUrl: item.linkUrl ?? '', linkLabel: item.linkLabel ?? '', level: item.level, locale: item.locale ?? '', countryCode: item.countryCode ?? '', status: item.status, startsAt: toLocalInput(item.startsAt), endsAt: toLocalInput(item.endsAt) }
      : EMPTY);
  }, [item]);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        message: d.message, level: d.level, status: d.status,
        linkUrl: d.linkUrl.trim() || null, linkLabel: d.linkLabel.trim() || null,
        locale: d.locale || null, countryCode: d.countryCode.trim().toUpperCase() || null,
        startsAt: fromLocalInput(d.startsAt), endsAt: fromLocalInput(d.endsAt),
      };
      return isNew ? api.post('/admin/content/announcements', body) : api.put(`/admin/content/announcements/${(item as Announcement).id}`, body);
    },
    onSuccess: () => { toast.success('Annonce enregistrée'); qc.invalidateQueries({ queryKey: ['admin-announcements'] }); onClose(); },
  });
  const errors = fieldErrors(save.error);
  useFocusFirstError(save.error);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal open={Boolean(item)} onClose={onClose} title={isNew ? 'Nouvelle annonce' : 'Modifier l’annonce'} size="lg">
      <form onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }} className="space-y-3" noValidate>
        <TextField label="Message" required value={d.message} onChange={set('message')} error={errors.message} maxLength={300} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Lien" value={d.linkUrl} onChange={set('linkUrl')} error={errors.linkUrl} hint="https://… ou chemin du site (/help)" />
          <TextField label="Texte du lien" value={d.linkLabel} onChange={set('linkLabel')} error={errors.linkLabel} maxLength={100} />
          <SelectField label="Style" value={d.level} onChange={set('level')}>
            <option value="info">Information</option><option value="warning">Avertissement</option><option value="success">Bonne nouvelle</option>
          </SelectField>
          <SelectField label="Statut" value={d.status} onChange={set('status')}>{STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</SelectField>
          <SelectField label="Langue" value={d.locale} onChange={set('locale')}>
            <option value="">Toutes</option>{LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </SelectField>
          <TextField label="Pays (code ISO)" value={d.countryCode} onChange={set('countryCode')} error={errors.countryCode} maxLength={2} hint="Vide = tous les pays" />
          <TextField label="Début de diffusion" type="datetime-local" value={d.startsAt} onChange={set('startsAt')} error={errors.startsAt} />
          <TextField label="Fin de diffusion" type="datetime-local" value={d.endsAt} onChange={set('endsAt')} error={errors.endsAt} />
        </div>
        {save.isError && !Object.keys(errors).length && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(save.error)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Annuler</button>
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Announcements() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const { data, isLoading, error } = useQuery<{ items: Announcement[] }>({
    queryKey: ['admin-announcements'],
    queryFn: () => api.get('/admin/content/announcements').then((r) => r.data),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/content/announcements/${id}`),
    onSuccess: () => { toast.success('Annonce supprimée'); setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-announcements'] }); },
  });
  if (isForbidden(error)) return <AccessDenied permission="Gérer les contenus" />;
  const items = data?.items ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Annonces et bannières</h1>
          <p className="text-sm text-gray-400">Affichées en haut du site pendant leur fenêtre de diffusion.</p>
        </div>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle annonce</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {!isLoading && items.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-400">Aucune annonce.</p>}
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="rounded-xl border border-white/10 bg-[#1a2744] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-white">{a.message}</p>
              <div className="flex gap-2">
                {isLive(a) && <span className="rounded-full bg-green-700 px-2 py-0.5 text-xs text-white">En ligne</span>}
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[a.status]?.cls ?? ''}`}>{STATUS_BADGE[a.status]?.label}</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {a.startsAt ? `du ${new Date(a.startsAt).toLocaleString('fr-FR')} ` : ''}{a.endsAt ? `au ${new Date(a.endsAt).toLocaleString('fr-FR')}` : a.startsAt ? '' : 'sans limite de durée'}
              {a.locale ? ` · ${a.locale.toUpperCase()}` : ''}{a.countryCode ? ` · ${a.countryCode}` : ''}
            </p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setEditing(a)} className="rounded-lg border border-white/15 px-3 py-1 text-xs">Modifier</button>
              <button onClick={() => { remove.reset(); setDeleting(a); }} className="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-300">Supprimer</button>
            </div>
          </li>
        ))}
      </ul>
      <Editor item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={Boolean(deleting)} danger title="Supprimer l’annonce" message={deleting?.message ?? ''} confirmLabel="Supprimer"
        busy={remove.isPending} error={remove.isError ? getApiErrorMessage(remove.error) : null}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}
