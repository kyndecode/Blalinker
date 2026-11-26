import type { ReactNode } from 'react';
import Markdown from './Markdown';
import { usePublishedPage } from '../../hooks/useSiteContent';

/**
 * Page éditoriale administrable : affiche la version publiée depuis le back-office,
 * sinon le texte intégré au site (aucune page vide, aucune recompilation nécessaire).
 */
export default function ManagedPage({ slug, fallback }: { slug: string; fallback: ReactNode }) {
  const { data: page, isLoading } = usePublishedPage(slug);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10" aria-busy="true">
        <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (!page) return <>{fallback}</>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <article className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8" data-testid="managed-page">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{page.title}</h1>
        {page.summary && <p className="mt-2 text-gray-600 dark:text-gray-300">{page.summary}</p>}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Mis à jour le {new Date(page.updatedAt).toLocaleDateString('fr-FR')}
        </p>
        <Markdown source={page.body} className="mt-6" />
      </article>
    </div>
  );
}
