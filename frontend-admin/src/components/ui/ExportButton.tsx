import { useState } from 'react';
import { Download } from 'lucide-react';
import api from '../../services/api';
import { useToast } from './Toast';
import { useMyPermissions } from '../AdminLayout';
import { getApiErrorMessage } from '../../utils/apiError';

/** Lecture d'un Blob en texte (FileReader : disponible dans tous les navigateurs). */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * Export CSV de la liste affichée (mêmes filtres). Visible seulement avec la permission
 * « exports.run » ; le serveur vérifie aussi la permission de lecture des données.
 */
export default function ExportButton({ dataset, params, label = 'Exporter (CSV)' }: {
  dataset: 'users' | 'bookings' | 'transactions' | 'reviews' | 'audit';
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  const { can } = useMyPermissions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!can('exports.run')) return null;

  const run = async () => {
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== ''));
      const res = await api.get(`/admin/exports/${dataset}`, { params: clean, responseType: 'blob' });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' });
      const disposition = String(res.headers?.['content-disposition'] ?? '');
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `bla-${dataset}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const rows = res.headers?.['x-export-rows'];
      const truncated = res.headers?.['x-export-truncated'];
      toast.success(truncated ? `Export limité à ${truncated} lignes : affinez les filtres.` : `Export téléchargé${rows ? ` (${rows} lignes)` : ''}.`);
    } catch (err) {
      // Réponse d'erreur reçue sous forme de Blob : on relit le message JSON.
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await readBlobText(data));
          toast.error(getApiErrorMessage({ response: { ...(err as { response: object }).response, data: parsed } }));
          return;
        } catch { /* message générique ci-dessous */ }
      }
      toast.error(getApiErrorMessage(err, 'Export impossible.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-50">
      <Download className="h-4 w-4" aria-hidden="true" /> {busy ? 'Export…' : label}
    </button>
  );
}
