import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import AccessDenied, { isForbidden } from '../../components/AccessDenied';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/Toast';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

interface MediaAsset { id: string; url: string; alt: string | null; bytes: number | null; mimeType: string | null; createdAt: string }
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_BYTES = 5 * 1024 * 1024;

export default function Media() {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [alt, setAlt] = useState('');
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);

  const { data, isLoading, error } = useQuery<{ data: MediaAsset[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['admin-media', page],
    queryFn: () => api.get('/admin/media', { params: { page, limit: 24 } }).then((r) => r.data),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      if (alt.trim()) form.append('alt', alt.trim());
      return api.post('/admin/media', form);
    },
    onSuccess: () => { toast.success('Image ajoutée'); setAlt(''); qc.invalidateQueries({ queryKey: ['admin-media'] }); },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Échec du téléversement.')),
  });
  const updateAlt = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => api.patch(`/admin/media/${id}`, { alt: value.trim() || null }),
    onSuccess: () => { toast.success('Texte alternatif enregistré'); qc.invalidateQueries({ queryKey: ['admin-media'] }); },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/media/${id}`),
    onSuccess: () => { toast.success('Image retirée de la médiathèque'); setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-media'] }); },
  });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) { toast.error('Format non accepté : JPEG, PNG, WebP ou GIF.'); return; }
    if (file.size > MAX_BYTES) { toast.error('Image trop lourde (5 Mo maximum).'); return; }
    upload.mutate(file);
    if (input.current) input.current.value = '';
  };
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success('Adresse copiée'); } catch { toast.info(url); }
  };

  if (isForbidden(error)) return <AccessDenied permission="Gérer les contenus" />;
  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Médiathèque</h1>
        <p className="text-sm text-gray-400">Images publiques du site (pages, annonces, catégories). JPEG, PNG, WebP ou GIF, 5 Mo maximum.</p>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#1a2744] p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="media-alt" className="mb-1 block text-sm text-gray-200">Description de l’image (accessibilité)</label>
          <input id="media-alt" value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} placeholder="Ex. : Plombier réparant un évier"
            className="w-full rounded-lg border border-white/10 bg-[#0f1b33] px-3 py-2 text-sm text-white" />
        </div>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" id="media-file" onChange={(e) => onFile(e.target.files?.[0])} />
        <label htmlFor="media-file" className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white ${upload.isPending ? 'pointer-events-none opacity-50' : ''}`}>
          <Upload className="h-4 w-4" aria-hidden="true" /> {upload.isPending ? 'Envoi…' : 'Ajouter une image'}
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{getApiErrorMessage(error)}</p>}
      {isLoading && <p className="text-sm text-gray-400">Chargement…</p>}
      {!isLoading && items.length === 0 && <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-gray-400">Aucune image.</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((m) => (
          <li key={m.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#1a2744]">
            <img src={m.url} alt={m.alt ?? ''} className="h-36 w-full object-cover" loading="lazy" />
            <div className="space-y-2 p-3">
              <label htmlFor={`alt-${m.id}`} className="sr-only">Description</label>
              <input id={`alt-${m.id}`} defaultValue={m.alt ?? ''} maxLength={200} placeholder="Description"
                onBlur={(e) => { if (e.target.value !== (m.alt ?? '')) updateAlt.mutate({ id: m.id, value: e.target.value }); }}
                className="w-full rounded border border-white/10 bg-[#0f1b33] px-2 py-1 text-xs text-white" />
              <p className="text-[11px] text-gray-500">{m.bytes ? `${Math.round(m.bytes / 1024)} Ko · ` : ''}{new Date(m.createdAt).toLocaleDateString('fr-FR')}</p>
              <div className="flex gap-2">
                <button onClick={() => copy(m.url)} className="flex-1 rounded border border-white/15 px-2 py-1 text-xs">Copier l’adresse</button>
                <button onClick={() => { remove.reset(); setDeleting(m); }} className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-300">Retirer</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {data?.meta && <Pagination page={page} totalPages={data.meta.totalPages} total={data.meta.total} label="images" onChange={setPage} />}
      <ConfirmDialog open={Boolean(deleting)} danger title="Retirer l’image"
        message="L’image est retirée de la médiathèque (le fichier reste archivé). Refusé si elle est encore utilisée sur le site."
        confirmLabel="Retirer" busy={remove.isPending} error={remove.isError ? getApiErrorMessage(remove.error) : null}
        onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}
