import { useTranslation } from 'react-i18next';
import ManagedPage from '../../components/content/ManagedPage';

const PRIVACY_SECTION_KEYS = [
  'collect',
  'usage',
  'legal_basis',
  'retention',
  'sharing',
  'security',
  'rights',
  'contact',
] as const;

function PrivacyPageBuiltin() {
  const { t } = useTranslation();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          {t('privacy.title')}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('privacy.updated_at')}</p>

        <div className="mt-8 space-y-6">
          {PRIVACY_SECTION_KEYS.map((key) => (
            <section key={key} className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t(`privacy.sections.${key}.title`)}
              </h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                {t(`privacy.sections.${key}.text`)}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Version publiée depuis l'administration, sinon texte intégré. */
export default function PrivacyPage() {
  return <ManagedPage slug="privacy" fallback={<PrivacyPageBuiltin />} />;
}
