import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Input }  from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';

const schema = z.object({
  identifier: z.string().min(1, 'Requis'),
  password:   z.string().min(1, 'Requis'),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const { t }      = useTranslation();
  const navigate   = useNavigate();
  const { setTokens, setUser } = useAuthStore();
  const [apiError, setApiError] = useState('');
  const [mfaState, setMfaState] = useState<{ required: boolean; tempToken: string }>({
    required: false, tempToken: ''
  });
  const [otpCode, setOtpCode] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
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
      const res = await api.post('/auth/login/verify-mfa', {
        tempToken: mfaState.tempToken,
        otpCode,
      });
      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e?.response?.data?.error || 'Code incorrect');
    }
  };

  if (mfaState.required) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card max-w-sm w-full">
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t('auth.otp_title')}</h1>
          <p className="text-sm text-gray-600 mb-6">{t('auth.otp_sent')}</p>
          {apiError && <p className="text-red-600 text-sm mb-4" role="alert">{apiError}</p>}
          <form onSubmit={handleMfaSubmit} className="flex flex-col gap-4">
            <Input
              label="Code OTP"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder={t('auth.otp_placeholder')}
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
            />
            <Button type="submit" loading={false} className="w-full">
              {t('auth.verify')}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card max-w-sm w-full">
        <div className="text-center mb-6">
          <span className="text-4xl" aria-hidden="true">🔧</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">BLA</h1>
          <p className="text-gray-500 text-sm">{t('auth.login')}</p>
        </div>

        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4" role="alert">
            <p className="text-red-700 text-sm">{apiError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Input
            label="Téléphone ou Email"
            placeholder="+221 77 000 00 00 ou email@exemple.com"
            error={errors.identifier?.message}
            autoComplete="username"
            {...register('identifier')}
          />
          <Input
            label={t('auth.password')}
            type="password"
            error={errors.password?.message}
            autoComplete="current-password"
            {...register('password')}
          />

          <Link to="/forgot-password" className="text-xs text-primary-600 hover:underline text-right -mt-2">
            {t('auth.forgot_password')}
          </Link>

          <Button type="submit" loading={isSubmitting} className="w-full mt-2">
            {t('auth.login')}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          {t('auth.no_account')}{' '}
          <Link to="/register" className="text-primary-600 font-medium hover:underline">
            {t('auth.register')}
          </Link>
        </p>
      </div>
    </div>
  );
}
