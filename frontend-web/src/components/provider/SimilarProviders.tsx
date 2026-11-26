import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

interface Similar { id: string; firstName: string | null; lastName: string | null; businessName: string | null; avatarUrl: string | null; city: string | null; ratingAverage: number; ratingCount: number; sameCity: boolean }

/** Recommandations réelles : prestataires des mêmes catégories (même ville en premier). Masqué s'il n'y en a pas. */
export default function SimilarProviders({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery<Similar[]>({
    queryKey: ['similar-providers', providerId],
    queryFn: () => api.get(`/providers/${providerId}/similar`).then((r) => (Array.isArray(r.data?.items) ? r.data.items : [])),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  if (!data || data.length === 0) return null;
  return (
    <section aria-labelledby="similar-title" className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
      <h2 id="similar-title" className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">{t('provider_page.similar_title')}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.map((p) => {
          const name = p.businessName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || t('provider_page.provider_fallback');
          return (
            <li key={p.id}>
              <Link to={`/provider/${p.id}`} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3 hover:border-green-300 dark:hover:border-green-700">
                {p.avatarUrl
                  ? <img src={p.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" />
                  : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40 text-sm font-bold text-green-700 dark:text-green-300" aria-hidden="true">{name.charAt(0)}</span>}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{name}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {p.city ?? ''}{p.ratingCount > 0 ? ` · ★ ${p.ratingAverage.toFixed(1)} (${p.ratingCount})` : ''}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
