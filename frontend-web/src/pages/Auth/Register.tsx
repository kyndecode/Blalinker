import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import api from '../../services/api';
import {
  detectDefaultCountryCode,
  formatInternationalPhone,
  getPhoneLengthRule,
  getCountryOptions,
  isValidLocalPhoneForCountry,
} from '../../utils/phoneCountries';

const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const schema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, 'Le prénom est requis')
    .max(100, 'Prénom trop long'),
  lastName: z
    .string()
    .trim()
    .min(2, 'Le nom est requis')
    .max(100, 'Nom trop long'),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Pays invalide'),
  phoneLocal: z
    .string()
    .trim()
    .min(6, 'Numéro de téléphone requis')
    .max(20, 'Numéro trop long'),
  email: z
    .string()
    .trim()
    .email('Email invalide')
    .max(255)
    .transform((value) => value.toLowerCase()),
  password: z.string()
    .min(8, 'Minimum 8 caractères')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/[a-z]/, 'Au moins une minuscule')
    .regex(/[0-9]/, 'Au moins un chiffre'),
  role: z.enum(['client', 'provider']),
}).superRefine((data, ctx) => {
  if (!isValidLocalPhoneForCountry(data.phoneLocal, data.countryCode)) {
    const rule = getPhoneLengthRule(data.countryCode);
    const lengthMessage = rule.min === rule.max ? `${rule.min}` : `${rule.min}-${rule.max}`;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Numero invalide pour ce pays (${lengthMessage} chiffres)`,
      path: ['phoneLocal'],
    });
    return;
  }

  const phone = formatInternationalPhone(data.phoneLocal, data.countryCode);
  if (!E164_PHONE_REGEX.test(phone)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Format téléphone invalide',
      path: ['phoneLocal'],
    });
  }
});

type FormData = z.infer<typeof schema>;

const PAGE = 'min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4';
const CARD = 'w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8';

export default function Register() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [apiError, setApiError] = useState('');
  const defaultRole = (params.get('role') === 'provider' ? 'provider' : 'client') as 'client' | 'provider';

  const lang = (i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0];
  const countries = useMemo(() => getCountryOptions(lang), [lang]);
  const detectedCountryCode = useMemo(() => detectDefaultCountryCode(countries), [countries]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    getValues,
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: defaultRole,
      countryCode: detectedCountryCode,
    },
  });

  const currentRole = watch('role');
  const selectedCountryCode = watch('countryCode');
  const selectedCountry = countries.find((country) => country.code === selectedCountryCode);
  const selectedPhoneRule = getPhoneLengthRule(selectedCountryCode || detectedCountryCode);

  useEffect(() => {
    setValue('role', defaultRole);
  }, [defaultRole, setValue]);

  useEffect(() => {
    const currentCode = getValues('countryCode');
    const hasCurrentCode = countries.some((country) => country.code === currentCode);
    if (!hasCurrentCode) {
      setValue('countryCode', detectedCountryCode, { shouldValidate: true });
    }
  }, [countries, detectedCountryCode, getValues, setValue]);

  const onSubmit = async (data: FormData) => {
    setApiError('');

    const internationalPhone = formatInternationalPhone(data.phoneLocal, data.countryCode);
    if (!isValidLocalPhoneForCountry(data.phoneLocal, data.countryCode)) {
      const rule = getPhoneLengthRule(data.countryCode);
      const lengthMessage = rule.min === rule.max ? `${rule.min}` : `${rule.min}-${rule.max}`;
      setError('phoneLocal', {
        type: 'manual',
        message: `Numero invalide (${lengthMessage} chiffres)`,
      });
      return;
    }

    if (!E164_PHONE_REGEX.test(internationalPhone)) {
      setError('phoneLocal', { type: 'manual', message: 'Format téléphone invalide' });
      return;
    }

    try {
      await api.post('/auth/register', {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: internationalPhone,
        countryCode: data.countryCode,
        email: data.email,
        password: data.password,
        role: data.role,
      });

      navigate(
        `/verify?phone=${encodeURIComponent(internationalPhone)}&email=${encodeURIComponent(data.email)}`
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; errors?: Record<string, string[]> } } };
      const validationErrors = e?.response?.data?.errors;

      if (validationErrors && Object.keys(validationErrors).length > 0) {
        const firstFieldErrors = Object.values(validationErrors)[0];
        if (firstFieldErrors?.length) {
          setApiError(firstFieldErrors[0]);
          return;
        }
      }

      setApiError(e?.response?.data?.error || t('auth.register_error'));
    }
  };

  return (
    <div className={PAGE}>
      <div className={CARD}>
        <div className="flex justify-center mb-7">
          <Logo size="md" />
        </div>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('auth.register')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
          {t('auth.register_subtitle')}
        </p>

        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-5">
          {([
            { value: 'client', label: t('auth.role_client'), emoji: '👤' },
            { value: 'provider', label: t('auth.role_provider'), emoji: '🔧' },
          ] as const).map((roleOption) => (
            <button
              key={roleOption.value}
              type="button"
              onClick={() => setValue('role', roleOption.value)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-150 ${
                currentRole === roleOption.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              aria-pressed={currentRole === roleOption.value}
            >
              <span>{roleOption.emoji}</span>
              {roleOption.label}
            </button>
          ))}
        </div>

        {apiError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4" role="alert">
            <p className="text-red-700 dark:text-red-400 text-sm">{apiError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={t('auth.first_name')}
              placeholder={t('auth.first_name_placeholder')}
              autoComplete="given-name"
              required
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <Input
              label={t('auth.last_name')}
              placeholder={t('auth.last_name_placeholder')}
              autoComplete="family-name"
              required
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="phoneLocal" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('auth.phone')}
              <span className="text-red-500 ml-1" aria-hidden="true">*</span>
            </label>

            <div className="grid grid-cols-[minmax(150px,40%)_1fr] gap-2">
              <select
                id="countryCode"
                aria-label={t('auth.phone_country')}
                className={`input ${errors.countryCode?.message ? 'input-error' : ''}`}
                {...register('countryCode')}
              >
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.flag} +{country.dialCode} {country.name}
                  </option>
                ))}
              </select>

              <input
                id="phoneLocal"
                type="tel"
                required
                autoComplete="tel-national"
                placeholder={t('auth.phone_local_placeholder')}
                inputMode="numeric"
                className={`input ${errors.phoneLocal?.message ? 'input-error' : ''}`}
                {...register('phoneLocal')}
              />
            </div>

            {(errors.phoneLocal?.message || errors.countryCode?.message) ? (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {errors.phoneLocal?.message || errors.countryCode?.message}
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('auth.phone_format_helper', {
                  dialCode: selectedCountry?.dialCode ? `+${selectedCountry.dialCode}` : '+',
                  min: selectedPhoneRule.min,
                  max: selectedPhoneRule.max,
                })}
              </p>
            )}
          </div>

          <Input
            label={t('auth.email')}
            type="email"
            placeholder={t('auth.email_placeholder')}
            autoComplete="email"
            required
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label={t('auth.password')}
            type="password"
            required
            autoComplete="new-password"
            error={errors.password?.message}
            helperText={t('auth.password_rules')}
            {...register('password')}
          />

          <Button type="submit" loading={isSubmitting} className="w-full mt-1">
            {t('auth.register_submit')}
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('auth.already_account')}{' '}
            <Link to="/login" className="text-green-600 dark:text-green-400 font-semibold hover:underline">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
