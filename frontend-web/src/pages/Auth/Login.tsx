import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { useAuthStore } from '../../store/authStore';
import Logo from '../../components/common/Logo';
import api from '../../services/api';
import { requestGoogleIdToken } from '../../services/googleAuth';

const schema = z.object({
  identifier: z.string().min(1, 'Requis'),
  password: z.string().min(1, 'Requis'),
});

type FormData = z.infer<typeof schema>;

const PAGE = 'min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4';
const CARD = 'w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();
  const [apiError, setApiError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mfaState, setMfaState] = useState<{ required: boolean; tempToken: string }>({
    required: false,
    tempToken: '',
  });
  const [otpCode, setOtpCode] = useState('');
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.toString().trim();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setApiError('');
    const isPhone = /^\+[1-9]\d{7,14}$/.test(data.identifier);

    try {
      const res = await api.post('/auth/login', {
        [isPhone ? 'phone' : 'email']: data.identifier,
        password: data.password,
      });

      if (res.data.mfaRequired) {
        setMfaState({ required: true, tempToken: res.data.tempToken });
      } else {
        setTokens(res.data.accessToken, res.data.refreshToken);
        setUser(res.data.user);
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e?.response?.data?.error || t('errors.server'));
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');

    try {
      const res = await api.post('/auth/login/verify-mfa', { tempToken: mfaState.tempToken, otpCode });
      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e?.response?.data?.error || t('auth.otp_invalid'));
    }
  };

  const handleGoogleLogin = async () => {
    setApiError('');
    if (!googleClientId) {
      setApiError(t('auth.google_unavailable'));
      return;
    }

    setGoogleLoading(true);
    try {
      const idToken = await requestGoogleIdToken(googleClientId);
      const res = await api.post('/auth/google', {
        idToken,
        role: 'client',
      });
      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setApiError(e?.response?.data?.error || e?.message || t('errors.server'));
    } finally {
      setGoogleLoading(false);
    }
  };

  if (mfaState.required) {
    return (
      <div className={PAGE}>
        <div className={CARD}>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 text-2xl mb-3">📱</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('auth.otp_title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('auth.otp_sent')}</p>
          </div>

          {apiError && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4 bg-red-50 dark:bg-red-900/20 rounded-xl p-3" role="alert">
              {apiError}
            </p>
          )}

          <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4">
            <Input
              label={t('auth.otp_label')}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              placeholder={t('auth.otp_placeholder')}
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
            />
            <Button type="submit" className="w-full">{t('auth.verify')}</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE}>
      <div className={CARD}>
        <div className="flex justify-center mb-7">
          <Logo size="md" />
        </div>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('auth.login')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">{t('auth.login_subtitle')}</p>

        {apiError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-5" role="alert">
            <p className="text-red-700 dark:text-red-400 text-sm">{apiError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Input
            label={t('auth.phone_or_email')}
            placeholder={t('auth.phone_or_email_placeholder')}
            error={errors.identifier?.message}
            autoComplete="username"
            {...register('identifier')}
          />

          <div>
            <Input
              label={t('auth.password')}
              type="password"
              error={errors.password?.message}
              autoComplete="current-password"
              {...register('password')}
            />
            <div className="flex justify-end mt-1.5">
              <Link to="/forgot-password" className="text-xs text-green-600 dark:text-green-400 hover:underline">
                {t('auth.forgot_password')}
              </Link>
            </div>
          </div>

          <Button type="submit" loading={isSubmitting} className="w-full">
            {t('auth.login')}
          </Button>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 transition-colors"
          >
            {googleLoading ? t('auth.google_loading') : t('auth.google_continue')}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('auth.no_account')}{' '}
            <Link to="/register" className="text-green-600 dark:text-green-400 font-semibold hover:underline">
              {t('auth.register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
