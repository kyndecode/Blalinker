import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import { FormMessage } from '../../components/common/FormMessage';
import api from '../../services/api';
import { classifyApiError } from '../../utils/apiError';
import { focusFirstInvalidSoon } from '../../utils/formErrors';

const PAGE = 'min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4';
const CARD = 'w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8';

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

type Field = 'identifier' | 'code' | 'password' | 'confirm';

function identifierField(identifier: string): 'phone' | 'email' {
  return PHONE_RE.test(identifier.trim()) ? 'phone' : 'email';
}

export default function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [apiError, setApiError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  /** Erreurs affichées sous chaque champ ; le premier champ en erreur reçoit le focus. */
  const showFieldErrors = (errors: Partial<Record<Field, string>>) => {
    setFieldErrors(errors);
    if (Object.keys(errors).length) focusFirstInvalidSoon(formRef.current ?? undefined);
    return Object.keys(errors).length > 0;
  };
  const clearField = (field: Field) => setFieldErrors(({ [field]: _removed, ...rest }) => rest);

  /** Erreur du serveur : sous le champ concerné si possible, sinon message général. */
  const showServerError = (err: unknown, fieldOf: Record<string, Field>) => {
    const c = classifyApiError(err);
    const mapped: Partial<Record<Field, string>> = {};
    for (const [serverField, message] of Object.entries(c.fieldErrors)) {
      const field = fieldOf[serverField];
      if (field) mapped[field] = message;
    }
    if (!showFieldErrors(mapped)) setApiError(c.message);
  };

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setApiError('');
    setInfo('');
    if (showFieldErrors(identifier.trim() ? {} : { identifier: t('errors.identifier_required') })) return;
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { [identifierField(identifier)]: identifier.trim() });
      setInfo(t('auth.reset_code_sent'));
      setStep('reset');
    } catch (err: unknown) {
      showServerError(err, { email: 'identifier', phone: 'identifier' });
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setApiError('');
    const errors: Partial<Record<Field, string>> = {};
    if (!/^\d{6}$/.test(code.trim())) errors.code = t('auth.otp_format');
    if (!PASSWORD_RE.test(password)) errors.password = t('auth.password_rules');
    if (!confirm) errors.confirm = t('errors.required');
    else if (password !== confirm) errors.confirm = t('auth.password_mismatch');
    if (showFieldErrors(errors)) return;
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        [identifierField(identifier)]: identifier.trim(),
        code: code.trim(),
        password,
      });
      navigate('/login', { replace: true, state: { notice: t('auth.reset_success') } });
    } catch (err: unknown) {
      showServerError(err, { code: 'code', password: 'password' });
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

        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('auth.forgot_password')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
          {step === 'request' ? t('auth.forgot_subtitle') : t('auth.reset_subtitle')}
        </p>

        <FormMessage tone="error" className="mb-5">{apiError}</FormMessage>
        <FormMessage tone="success" className="mb-5">{info}</FormMessage>

        {step === 'request' ? (
          <form ref={formRef} onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
            <Input
              id="forgot-identifier"
              label={t('auth.phone_or_email')}
              placeholder={t('auth.phone_or_email_placeholder')}
              value={identifier}
              onChange={(ev) => { setIdentifier(ev.target.value); clearField('identifier'); }}
              error={fieldErrors.identifier}
              autoComplete="username"
              required
              autoFocus
            />
            <Button type="submit" loading={loading} className="w-full">
              {t('auth.send_code')}
            </Button>
          </form>
        ) : (
          <form ref={formRef} onSubmit={resetPassword} className="flex flex-col gap-4" noValidate>
            <Input
              id="reset-code"
              label={t('auth.otp_label')}
              value={code}
              onChange={(ev) => { setCode(ev.target.value); clearField('code'); }}
              error={fieldErrors.code}
              placeholder={t('auth.otp_placeholder')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
            />
            <Input
              id="reset-password"
              label={t('auth.new_password')}
              type="password"
              value={password}
              onChange={(ev) => { setPassword(ev.target.value); clearField('password'); }}
              error={fieldErrors.password}
              helperText={t('auth.password_rules')}
              autoComplete="new-password"
              required
            />
            <Input
              id="reset-confirm"
              label={t('auth.confirm_password')}
              type="password"
              value={confirm}
              onChange={(ev) => { setConfirm(ev.target.value); clearField('confirm'); }}
              error={fieldErrors.confirm}
              autoComplete="new-password"
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              {t('auth.reset_password_action')}
            </Button>
            <button
              type="button"
              onClick={() => { setStep('request'); setApiError(''); setFieldErrors({}); }}
              className="text-xs text-gray-600 dark:text-gray-400 hover:underline"
            >
              {t('auth.resend_code')}
            </button>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 text-center">
          <Link to="/login" className="text-sm text-green-700 dark:text-green-400 font-semibold hover:underline">
            {t('auth.back_to_login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
