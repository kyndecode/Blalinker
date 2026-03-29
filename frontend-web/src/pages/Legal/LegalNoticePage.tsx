import { useTranslation } from 'react-i18next';

export default function LegalNoticePage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          {t('legal_notice.title')}
        </h1>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('legal_notice.editor_title')}</h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{t('legal_notice.editor_text')}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('legal_notice.hosting_title')}</h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{t('legal_notice.hosting_text')}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('legal_notice.ip_title')}</h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{t('legal_notice.ip_text')}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('legal_notice.liability_title')}</h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{t('legal_notice.liability_text')}</p>
        </section>
      </div>
    </div>
  );
}
