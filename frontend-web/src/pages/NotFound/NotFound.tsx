import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <p className="text-6xl font-extrabold text-green-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('notFound.title', 'Page introuvable')}
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {t('notFound.description', "La page que vous recherchez n'existe pas ou a été déplacée.")}
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
      >
        {t('notFound.backHome', "Retour à l'accueil")}
      </Link>
    </div>
  );
}
