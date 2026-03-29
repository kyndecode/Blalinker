import { useTranslation } from 'react-i18next';

const TERMS_SECTION_KEYS = [
  'scope',
  'account',
  'booking',
  'payment',
  'ratings',
  'liability',
  'termination',
  'law',
] as const;

export default function TermsPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          {t('terms.title')}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('terms.updated_at')}</p>

        <div className="mt-8 space-y-6">
          {TERMS_SECTION_KEYS.map((key) => (
            <section key={key} className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t(`terms.sections.${key}.title`)}
              </h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                {t(`terms.sections.${key}.text`)}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
