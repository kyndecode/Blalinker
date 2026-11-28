import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { useAuthStore } from '../../store/authStore';
import Logo from '../../components/common/Logo';
import { FormMessage } from '../../components/common/FormMessage';
import api from '../../services/api';
import { requestGoogleIdToken } from '../../services/googleAuth';
import { clearFlashNotice, peekFlashNotice } from '../../utils/flashNotice';
import { getApiErrorMessage } from '../../utils/apiError';

type FormData = { identifier: string; password: string };

const PAGE = 'min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4';
const CARD = 'w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8';

export default function Login() {
  const { t } = useTranslation();
  const schema = useMemo(() => z.object({
    identifier: z.string().trim().min(1, t('errors.identifier_required')),
    password: z.string().min(1, t('errors.password_required')),
  }), [t]);
  const navigate = useNavigate();
  const location = useLocation();
  // Message transmis par la page précédente (ex. « Vous êtes déconnecté. »), à usage unique.
  const [flashNotice] = useState(() => peekFlashNotice());
  useEffect(() => { clearFlashNotice(); }, []);
  const notice = (location.state as { notice?: string } | null)?.notice ?? flashNotice;
  // Retour vers la page privée demandée avant la connexion (chemin interne uniquement).
  const from = (location.state as { from?: string } | null)?.from;
  const afterLogin = typeof from === 'string' && /^\/(?!\/)/.test(from) && !from.startsWith('/login') ? from : '/dashboard';
  const { setTokens, setUser } = useAuthStore();
  const [apiError, setApiError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mfaState, setMfaState] = useState<{ required: boolean; tempToken: string }>({
    required: false,
    tempToken: '',
  });
  const [otpCode, setOtpCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
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
        navigate(afterLogin);
      }
    } catch (err: unknown) {
      // Mauvais identifiants, compte suspendu, trop de tentatives, serveur ou réseau : message précis.
      setApiError(getApiErrorMessage(err));
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaSubmitting) return;
    setApiError('');
    setMfaSubmitting(true);

    try {
      const res = await api.post('/auth/login/verify-mfa', { tempToken: mfaState.tempToken, otpCode });
      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      navigate(afterLogin);
    } catch (err: unknown) {
      setApiError(getApiErrorMessage(err, t('auth.otp_invalid')));
    } finally {
      setMfaSubmitting(false);
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
      navigate(afterLogin);
    } catch (err: unknown) {
      const e = err as { response?: unknown; message?: string };
      // Erreur de l'API : message classé ; erreur du module Google (fenêtre fermée…) : son message.
      setApiError(e?.response ? getApiErrorMessage(err) : e?.message || t('errors.generic'));
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

          <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4">
            <Input
              label={t('auth.otp_label')}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              placeholder={t('auth.otp_placeholder')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              error={apiError || undefined}
            />
            <Button type="submit" loading={mfaSubmitting} disabled={mfaSubmitting} className="w-full">{t('auth.verify')}</Button>
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

        <FormMessage tone="info" className="mb-5">{notice}</FormMessage>
        <FormMessage tone="error" className="mb-5">{apiError}</FormMessage>

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
              <Link to="/forgot-password" className="text-xs text-green-700 dark:text-green-400 hover:underline">
                {t('auth.forgot_password')}
              </Link>
            </div>
          </div>

          <Button type="submit" loading={isSubmitting} className="w-full">
            {t('auth.login')}
          </Button>

          {googleClientId && (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 transition-colors"
            >
              {googleLoading ? t('auth.google_loading') : t('auth.google_continue')}
            </button>
          )}
        </form>

        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('auth.no_account')}{' '}
            <Link to="/register" className="text-green-700 dark:text-green-400 font-semibold hover:underline">
              {t('auth.register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
