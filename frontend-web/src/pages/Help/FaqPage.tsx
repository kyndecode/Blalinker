import { useTranslation } from 'react-i18next';

const FAQ_KEYS = [
  'q1',
  'q2',
  'q3',
  'q4',
  'q5',
  'q6',
  'q7',
  'q8',
  'q9',
  'q10',
] as const;

export default function FaqPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          {t('faq.title')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {t('faq.subtitle')}
        </p>

        <div className="mt-8 space-y-4">
          {FAQ_KEYS.map((key) => (
            <details
              key={key}
              className="group rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-4"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                <span className="font-medium text-gray-900 dark:text-white">
                  {t(`faq.${key}.question`)}
                </span>
                <span className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {t(`faq.${key}.answer`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
