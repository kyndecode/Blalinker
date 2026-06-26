import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import api from '../../services/api';

const PAGE = 'min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4';
const CARD = 'w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8';

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

function identifierField(identifier: string): 'phone' | 'email' {
  return PHONE_RE.test(identifier.trim()) ? 'phone' : 'email';
}

export default function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [apiError, setApiError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');
    setInfo('');
    if (!identifier.trim()) {
      setApiError(t('auth.required', 'Champ requis'));
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { [identifierField(identifier)]: identifier.trim() });
      setInfo(t('auth.reset_code_sent', 'Si un compte correspond, un code de réinitialisation a été envoyé.'));
      setStep('reset');
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setApiError(e2?.response?.data?.error || t('errors.server', 'Une erreur est survenue.'));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');
    if (!/^\d{6}$/.test(code)) {
      setApiError(t('auth.otp_invalid', 'Code à 6 chiffres invalide.'));
      return;
    }
    if (!PASSWORD_RE.test(password)) {
      setApiError(t('auth.password_rules', 'Mot de passe : 8 caractères min., 1 majuscule, 1 minuscule, 1 chiffre.'));
      return;
    }
    if (password !== confirm) {
      setApiError(t('auth.password_mismatch', 'Les mots de passe ne correspondent pas.'));
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        [identifierField(identifier)]: identifier.trim(),
        code,
        password,
      });
      navigate('/login', {
        replace: true,
        state: { notice: t('auth.reset_success', 'Mot de passe réinitialisé. Connectez-vous.') },
      });
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setApiError(e2?.response?.data?.error || t('errors.server', 'Une erreur est survenue.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={PAGE}>
      <div className={CARD}>
        <div className="flex justify-center mb-7">
          <Logo size="md" />
        </div>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('auth.forgot_password', 'Mot de passe oublié')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
          {step === 'request'
            ? t('auth.forgot_subtitle', 'Saisissez votre email ou téléphone pour recevoir un code.')
            : t('auth.reset_subtitle', 'Saisissez le code reçu et votre nouveau mot de passe.')}
        </p>

        {apiError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-5" role="alert">
            <p className="text-red-700 dark:text-red-400 text-sm">{apiError}</p>
          </div>
        )}
        {info && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 mb-5" role="status">
            <p className="text-green-700 dark:text-green-400 text-sm">{info}</p>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
            <Input
              label={t('auth.phone_or_email', 'Email ou téléphone')}
              placeholder={t('auth.phone_or_email_placeholder', 'ex: vous@email.com')}
              value={identifier}
              onChange={(ev) => setIdentifier(ev.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
            <Button type="submit" loading={loading} className="w-full">
              {t('auth.send_code', 'Envoyer le code')}
            </Button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="flex flex-col gap-4" noValidate>
            <Input
              label={t('auth.otp_label', 'Code de vérification')}
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
              placeholder={t('auth.otp_placeholder', '000000')}
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
            />
            <Input
              label={t('auth.new_password', 'Nouveau mot de passe')}
              type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              autoComplete="new-password"
              required
            />
            <Input
              label={t('auth.confirm_password', 'Confirmer le mot de passe')}
              type="password"
              value={confirm}
              onChange={(ev) => setConfirm(ev.target.value)}
              autoComplete="new-password"
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              {t('auth.reset_password_action', 'Réinitialiser le mot de passe')}
            </Button>
            <button
              type="button"
              onClick={() => { setStep('request'); setApiError(''); }}
              className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
            >
              {t('auth.resend_code', 'Renvoyer un code')}
            </button>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 text-center">
          <Link to="/login" className="text-sm text-green-600 dark:text-green-400 font-semibold hover:underline">
            {t('auth.back_to_login', 'Retour à la connexion')}
          </Link>
        </div>
      </div>
    </div>
  );
}
