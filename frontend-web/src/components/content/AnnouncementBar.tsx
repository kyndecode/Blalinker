import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { useContentLocale } from '../../hooks/useSiteContent';
import { safeHref } from './Markdown';

interface Announcement { id: string; message: string; linkUrl: string | null; linkLabel: string | null; level: 'info' | 'warning' | 'success'; updatedAt: string }

const STYLES: Record<Announcement['level'], string> = {
  info: 'bg-blue-600 text-white',
  warning: 'bg-amber-500 text-gray-900',
  success: 'bg-green-600 text-white',
};
const STORAGE_KEY = 'bla:dismissed-announcements';

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Bannière d'annonce publiée depuis l'administration ; masquable (mémorisé sur cet appareil). */
export default function AnnouncementBar() {
  const locale = useContentLocale();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const { data } = useQuery<Announcement[]>({
    queryKey: ['site-announcements', locale],
    queryFn: () => api.get('/site/announcements', { params: { locale } }).then((r) => (Array.isArray(r.data?.items) ? r.data.items : [])),
    staleTime: 60_000,
    retry: 0,
  });

  // Une modification de l'annonce (updatedAt) la fait réapparaître.
  const current = (data ?? []).find((a) => !dismissed.includes(`${a.id}:${a.updatedAt}`));
  if (!current) return null;

  const link = current.linkUrl ? safeHref(current.linkUrl) : null;
  const dismiss = () => {
    const next = [...dismissed, `${current.id}:${current.updatedAt}`].slice(-20);
    setDismissed(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  };

  return (
    <div role="region" aria-label="Annonce" className={`${STYLES[current.level] ?? STYLES.info} px-4 py-2 text-sm`}>
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <p className="flex-1 text-center">
          {current.message}
          {link && (
            link.internal
              ? <> <Link to={link.href} className="font-semibold underline">{current.linkLabel || 'En savoir plus'}</Link></>
              : <> <a href={link.href} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{current.linkLabel || 'En savoir plus'}</a></>
          )}
        </p>
        <button onClick={dismiss} aria-label="Masquer l’annonce" className="shrink-0 rounded px-1 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">✕</button>
      </div>
    </div>
  );
}
