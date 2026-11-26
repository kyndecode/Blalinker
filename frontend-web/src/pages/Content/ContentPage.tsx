import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ManagedPage from '../../components/content/ManagedPage';

/** Page libre publiée depuis l'administration : /page/:slug */
export default function ContentPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  return (
    <ManagedPage
      key={slug}
      slug={slug}
      fallback={(
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('content_page.not_found_title')}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">{t('content_page.not_found_text')}</p>
          <Link to="/" className="mt-6 inline-block text-green-700 dark:text-green-400 hover:underline">{t('content_page.back_home')}</Link>
        </div>
      )}
    />
  );
}
