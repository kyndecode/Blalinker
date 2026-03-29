import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';

const PAGE = 'min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4';
const CARD = 'w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8';

export default function VerifyOTP() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();

  const phone = params.get('phone') || '';
  const email = params.get('email') || '';

  const [codes, setCodes] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((value) => value - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const next = [...codes];
    next[index] = value;
    setCodes(next);

    if (value && index < 5) refs.current[index + 1]?.focus();
    if (!value && index > 0) refs.current[index - 1]?.focus();

    if (value && index === 5 && next.every((code) => code)) {
      submit(next.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split('');
      setCodes(next);
      refs.current[5]?.focus();
      submit(pasted);
    }
    e.preventDefault();
  };

  const submit = async (code: string) => {
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/verify-otp', {
        phone: phone || undefined,
        email: email || undefined,
        code,
      });

      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e?.response?.data?.error || t('auth.otp_invalid'));
      setCodes(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    try {
      await api.post('/auth/resend-otp', { phone: phone || undefined, email: email || undefined });
      setResendCooldown(60);
    } catch {
      setError(t('auth.otp_resend_error'));
    }
  };

  return (
    <div className={PAGE}>
      <div className={CARD}>
        <div className="flex justify-center mb-7">
          <Logo size="md" />
        </div>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 text-2xl mb-3" aria-hidden="true">
            📱
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('auth.otp_title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('auth.otp_sent_to')} <strong className="text-gray-700 dark:text-gray-200">{phone || email}</strong>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-5" role="alert">
            <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div
          className="flex gap-2 justify-center mb-6"
          onPaste={handlePaste}
          aria-label={t('auth.otp_input_label')}
        >
          {codes.map((code, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={code}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-11 h-13 text-center text-xl font-bold border-2 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all duration-150 disabled:opacity-50 ${
                code
                  ? 'border-green-500 dark:border-green-500 scale-110 shadow-md shadow-green-500/20'
                  : 'border-gray-200 dark:border-gray-700 focus:border-green-500 dark:focus:border-green-500'
              }`}
              aria-label={`${t('auth.otp_digit')} ${i + 1}`}
              disabled={loading}
            />
          ))}
        </div>

        <Button
          onClick={() => submit(codes.join(''))}
          loading={loading}
          disabled={codes.some((code) => !code)}
          className="w-full mb-4"
        >
          {t('auth.verify')}
        </Button>

        <div className="text-center">
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-sm text-green-600 dark:text-green-400 hover:underline disabled:text-gray-400 dark:disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {resendCooldown > 0
              ? t('auth.otp_resend_in', { seconds: resendCooldown })
              : t('auth.resend')}
          </button>
        </div>
      </div>
    </div>
  );
}
