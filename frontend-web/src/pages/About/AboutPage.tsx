import { useTranslation } from 'react-i18next';

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          {t('about.title')}
        </h1>
        <p className="mt-3 text-gray-600 dark:text-gray-300 leading-relaxed">
          {t('about.intro')}
        </p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('about.founder')}</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">Jean Yves Kpangban</p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Data Engineer / Analytics</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('about.education')}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              Université de Tours (France)<br />
              École informatique Sup de Vinci Nantes
            </p>
          </div>
        </div>

        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('about.mission_title')}</h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{t('about.mission_text')}</p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('about.values_title')}</h2>
          <ul className="list-disc pl-5 text-gray-600 dark:text-gray-300 space-y-2">
            <li>{t('about.values_1')}</li>
            <li>{t('about.values_2')}</li>
            <li>{t('about.values_3')}</li>
            <li>{t('about.values_4')}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
