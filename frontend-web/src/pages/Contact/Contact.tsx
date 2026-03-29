import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import {
  detectDefaultCountryCode,
  formatInternationalPhone,
  getCountryOptions,
  getDialCode,
  getPhoneLengthRule,
  isValidLocalPhoneForCountry,
} from '../../utils/phoneCountries';

const CONTACT_SUBJECTS = [
  'support_account',
  'support_booking',
  'support_payment',
  'provider_partnership',
  'security_report',
  'other',
] as const;

const formSchema = z.object({
  firstName: z.string().trim().min(2, 'Prénom requis').max(100),
  lastName: z.string().trim().min(2, 'Nom requis').max(100),
  email: z.string().trim().email('Email invalide').max(255),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  phoneLocal: z.string().trim().min(6, 'Téléphone requis').max(20),
  subject: z.enum(CONTACT_SUBJECTS),
  message: z.string().trim().min(10, 'Message trop court').max(1500, 'Message trop long (1500 max)'),
}).superRefine((data, ctx) => {
  if (!isValidLocalPhoneForCountry(data.phoneLocal, data.countryCode)) {
    const rule = getPhoneLengthRule(data.countryCode);
    const lengthMessage = rule.min === rule.max ? `${rule.min}` : `${rule.min}-${rule.max}`;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['phoneLocal'],
      message: `Numéro invalide (${lengthMessage} chiffres)`,
    });
  }
});

type ContactFormValues = z.infer<typeof formSchema>;

interface ContactResponsePayload {
  message: string;
  requestId: string;
}

function getLocalPhoneFromE164(phone: string, countryCode: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (!trimmed.startsWith('+')) return trimmed;

  const dialCode = getDialCode(countryCode);
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!dialCode || !digits.startsWith(dialCode)) return digits;
  return digits.slice(dialCode.length);
}

export default function Contact() {
  const { t, i18n } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [isPrefillLoading, setIsPrefillLoading] = useState(false);
  const [successPayload, setSuccessPayload] = useState<ContactResponsePayload | null>(null);
  const [submitError, setSubmitError] = useState('');

  const language = (i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0];
  const countries = useMemo(() => getCountryOptions(language), [language]);
  const detectedCountryCode = useMemo(() => detectDefaultCountryCode(countries), [countries]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subject: 'support_account',
      countryCode: detectedCountryCode,
    },
  });

  const selectedCountryCode = watch('countryCode');
  const selectedCountry = useMemo(
    () => countries.find((country) => country.code === selectedCountryCode),
    [countries, selectedCountryCode]
  );
  const selectedPhoneRule = getPhoneLengthRule(selectedCountryCode || detectedCountryCode);

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsPrefillLoading(true);

    api.get('/users/me')
      .then((response) => {
        const me = response.data as {
          firstName?: string;
          lastName?: string;
          email?: string;
          phone?: string;
          country?: string;
        };

        const preferredCountry = me.country?.toUpperCase();
        const fallbackCountry = preferredCountry && countries.some((country) => country.code === preferredCountry)
          ? preferredCountry
          : detectedCountryCode;

        setValue('countryCode', fallbackCountry, { shouldValidate: true });
        setValue('firstName', me.firstName ?? '', { shouldValidate: true });
        setValue('lastName', me.lastName ?? '', { shouldValidate: true });
        setValue('email', me.email ?? '', { shouldValidate: true });
        setValue('phoneLocal', getLocalPhoneFromE164(me.phone ?? '', fallbackCountry), { shouldValidate: true });
      })
      .catch(() => {
        // Silent fail: form remains manual.
      })
      .finally(() => setIsPrefillLoading(false));
  }, [isAuthenticated, countries, detectedCountryCode, setValue]);

  const onSubmit = async (values: ContactFormValues) => {
    setSubmitError('');
    setSuccessPayload(null);

    const phone = formatInternationalPhone(values.phoneLocal, values.countryCode);
    const endpoint = isAuthenticated ? '/contact/auth' : '/contact';

    try {
      const response = await api.post(endpoint, {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
        phone,
        countryCode: values.countryCode.toUpperCase(),
        subject: values.subject,
        message: values.message.trim(),
      });

      setSuccessPayload(response.data as ContactResponsePayload);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; errors?: Record<string, string[]> } } };
      const firstFieldError = err.response?.data?.errors
        ? Object.values(err.response.data.errors).flat()[0]
        : undefined;
      setSubmitError(firstFieldError || err.response?.data?.error || t('errors.server'));
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
        <section className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 sm:p-7">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('contact.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('contact.subtitle')}
          </p>

          {isPrefillLoading && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">{t('contact.prefill_loading')}</p>
          )}

          {submitError && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3" role="alert">
              <p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
            </div>
          )}

          {successPayload && (
            <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3" role="status">
              <p className="text-sm text-green-700 dark:text-green-400">
                {t('contact.success', { requestId: successPayload.requestId })}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={t('auth.first_name')}
                placeholder={t('auth.first_name_placeholder')}
                required
                error={errors.firstName?.message}
                autoComplete="given-name"
                {...register('firstName')}
              />
              <Input
                label={t('auth.last_name')}
                placeholder={t('auth.last_name_placeholder')}
                required
                error={errors.lastName?.message}
                autoComplete="family-name"
                {...register('lastName')}
              />
            </div>

            <Input
              label={t('auth.email')}
              type="email"
              required
              error={errors.email?.message}
              autoComplete="email"
              placeholder={t('auth.email_placeholder')}
              {...register('email')}
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact-phone-local" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('auth.phone')}
                <span className="text-red-500 ml-1" aria-hidden="true">*</span>
              </label>

              <div className="grid grid-cols-[minmax(150px,40%)_1fr] gap-2">
                <select
                  id="contact-country-code"
                  aria-label={t('auth.phone_country')}
                  className={`input ${errors.countryCode ? 'input-error' : ''}`}
                  {...register('countryCode')}
                >
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.flag} +{country.dialCode} {country.name}
                    </option>
                  ))}
                </select>

                <input
                  id="contact-phone-local"
                  type="tel"
                  required
                  autoComplete="tel-national"
                  inputMode="numeric"
                  placeholder={t('auth.phone_local_placeholder')}
                  className={`input ${errors.phoneLocal ? 'input-error' : ''}`}
                  {...register('phoneLocal')}
                />
              </div>

              {(errors.phoneLocal?.message || errors.countryCode?.message) ? (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {errors.phoneLocal?.message || errors.countryCode?.message}
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('contact.phone_helper', {
                    dialCode: selectedCountry?.dialCode ? `+${selectedCountry.dialCode}` : '+',
                    min: selectedPhoneRule.min,
                    max: selectedPhoneRule.max,
                  })}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact-subject" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('contact.subject')}
                <span className="text-red-500 ml-1" aria-hidden="true">*</span>
              </label>
              <select id="contact-subject" className="input" {...register('subject')}>
                {CONTACT_SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>
                    {t(`contact.subject_options.${subject}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact-message" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('contact.message')}
                <span className="text-red-500 ml-1" aria-hidden="true">*</span>
              </label>
              <textarea
                id="contact-message"
                rows={6}
                maxLength={1500}
                className={`input resize-none ${errors.message ? 'input-error' : ''}`}
                placeholder={t('contact.message_placeholder')}
                {...register('message')}
              />
              {errors.message?.message ? (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.message.message}</p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('contact.message_hint')}</p>
              )}
            </div>

            <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto">
              {t('contact.submit')}
            </Button>
          </form>
        </section>

        <aside className="space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('contact.direct_title')}</p>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{t('contact.direct_phone_label')}</p>
            <a href="tel:+2250720333997" className="text-lg font-bold text-green-700 dark:text-green-400">
              +225 07 20 33 39 97
            </a>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('contact.available_markets')}</p>
            <div className="mt-2 flex items-center gap-2 text-lg">
              <span title="Togo">🇹🇬</span>
              <span title="Côte d'Ivoire">🇨🇮</span>
              <span title="Mali">🇲🇱</span>
              <span title="Burkina Faso">🇧🇫</span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('contact.quick_links')}</p>
            <div className="mt-3 grid gap-2">
              <Link to="/search" className="btn-secondary text-sm text-center">{t('contact.link_find_provider')}</Link>
              <Link to="/help" className="btn-secondary text-sm text-center">{t('contact.link_faq')}</Link>
              <Link to="/privacy" className="btn-secondary text-sm text-center">{t('contact.link_privacy')}</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
