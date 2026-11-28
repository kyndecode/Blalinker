import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../services/api';
import { useAdminAuthStore } from '../store/adminAuthStore';
import { Shield } from 'lucide-react';
import { ADMIN_NOTICE_KEY } from '../services/sessionNotice';

const schema = z.object({
  email: z.string().trim().min(1, 'Saisissez votre adresse e-mail.').email('Veuillez saisir une adresse e-mail valide.'),
  password: z.string().min(1, 'Saisissez votre mot de passe.'),
});

type FormData = z.infer<typeof schema>;

type AdminAuthUser = {
  id: string;
  role: 'admin' | 'super_admin' | string;
  email?: string;
};

type AuthResponse = {
  mfaRequired?: boolean;
  mfaMethod?: 'totp';
  tempToken?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: AdminAuthUser;
};

/**
 * Étapes du second facteur :
 * - email-otp  : code envoyé automatiquement par e-mail (comptes sans application) ;
 * - totp       : code de l'application d'authentification ;
 * - totp-email : secours, code demandé par e-mail ;
 * - recovery   : code de récupération à usage unique.
 */
type MfaStep = 'email-otp' | 'totp' | 'totp-email' | 'recovery';

const METHOD_BY_STEP: Record<MfaStep, 'totp' | 'email' | 'recovery' | undefined> = {
  'email-otp': undefined, // comportement historique : pas de méthode envoyée
  totp: 'totp',
  'totp-email': 'email',
  recovery: 'recovery',
};

function isAdminRole(role: string | undefined): role is 'admin' | 'super_admin' {
  return role === 'admin' || role === 'super_admin';
}

/** Au-delà de ce délai, on signale que le serveur est peut-être en train de démarrer. */
const SLOW_REQUEST_HINT_MS = 8_000;

export function getFriendlyError(err: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Pas de connexion Internet. Vérifiez votre réseau.';
  }

  const e = err as {
    code?: string;
    response?: { status?: number; data?: { error?: string; message?: string } };
    message?: string;
  };

  if (!e.response) {
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
      return 'Le serveur ne répond pas encore (démarrage en cours). Réessayez dans une minute.';
    }
    if (e.message && !e.code) {
      return e.message; // erreur levée par l'interface elle-même (ex. accès refusé)
    }
    return "Impossible de joindre l'API. Vérifiez votre connexion puis réessayez.";
  }

  return e.response.data?.error ?? e.response.data?.message ?? 'Identifiants incorrects';
}

const inputClass = `w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white
  placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent`;
const primaryButton = `w-full py-3 bg-green-700 hover:bg-green-800 disabled:opacity-50
  text-white font-semibold rounded-lg transition-colors`;
const linkButton = 'w-full py-2 text-sm text-gray-300 hover:text-white transition-colors underline-offset-2 hover:underline';

export default function AdminLogin() {
  const navigate = useNavigate();
  const setTokens = useAdminAuthStore((s) => s.setTokens);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // Message laissé par une fin de session (ex. « Votre session a expiré »), affiché une seule fois.
  const [sessionNotice] = useState(() => {
    try {
      const notice = sessionStorage.getItem(ADMIN_NOTICE_KEY);
      sessionStorage.removeItem(ADMIN_NOTICE_KEY);
      return notice ?? '';
    } catch { return ''; }
  });
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [mfa, setMfa] = useState<{ step: MfaStep; tempToken: string; email: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_REQUEST_HINT_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1_000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const goToStep = (step: MfaStep) => {
    setMfa((m) => (m ? { ...m, step } : m));
    setOtpCode('');
    setError('');
  };

  const completeSession = async (payload: AuthResponse, fallbackEmail: string) => {
    // Le jeton de renouvellement arrive en cookie HttpOnly (absent du corps de la réponse).
    if (!payload.accessToken) {
      throw new Error('Session incomplète: tokens manquants');
    }

    let user: AdminAuthUser | null = payload.user ?? null;

    try {
      const meResponse = await api.get('/users/me', {
        headers: { Authorization: `Bearer ${payload.accessToken}` },
      });
      const me = meResponse.data as { id: string; role: string; email?: string };
      user = {
        id: me.id,
        role: me.role,
        email: me.email ?? fallbackEmail,
      };
    } catch {
      // fallback on auth payload if /users/me fails
    }

    if (!user || !isAdminRole(user.role)) {
      throw new Error('Accès refusé - compte non administrateur');
    }

    setTokens(payload.accessToken, payload.refreshToken, {
      id: user.id,
      role: user.role,
      email: user.email ?? fallbackEmail,
    });

    // Administrateur sans application d'authentification : page de configuration.
    let setupRequired = false;
    try {
      const status = await api.get('/auth/mfa/status');
      setupRequired = Boolean((status?.data as { setupRequired?: boolean } | undefined)?.setupRequired);
    } catch {
      // l'état MFA est indicatif : en cas d'échec, on ouvre le tableau de bord
    }
    navigate(setupRequired ? '/securite' : '/dashboard');
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const res = await api.post<AuthResponse>('/auth/login', data);
      const auth = res.data;

      if (auth.mfaRequired) {
        const role = auth.user?.role;
        if (role && !isAdminRole(role)) {
          setError('Accès refusé - compte non administrateur');
          return;
        }

        if (!auth.tempToken) {
          setError('OTP admin indisponible. Réessayez.');
          return;
        }

        setOtpCode('');
        setMfa({ step: auth.mfaMethod === 'totp' ? 'totp' : 'email-otp', tempToken: auth.tempToken, email: data.email });
        return;
      }

      await completeSession(auth, data.email);
    } catch (err: unknown) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mfa) return;
    setLoading(true);
    setError('');

    try {
      const method = METHOD_BY_STEP[mfa.step];
      const res = await api.post<AuthResponse>('/auth/login/verify-mfa', {
        tempToken: mfa.tempToken,
        otpCode: otpCode.trim(),
        ...(method ? { method } : {}),
      });

      await completeSession(res.data, mfa.email || getValues('email'));
    } catch (err: unknown) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const requestEmailCode = async () => {
    if (!mfa) return;
    setLoading(true);
    setError('');
    setInfo('');

    try {
      const res = await api.post<{ sentTo: string; cooldownSeconds: number }>('/auth/login/mfa/email', {
        tempToken: mfa.tempToken,
      });
      goToStep('totp-email');
      setInfo(`Code envoyé à ${res.data.sentTo}. Valable 10 minutes.`);
      setCooldown(res.data.cooldownSeconds ?? 60);
    } catch (err: unknown) {
      const retryAfter = (err as { response?: { data?: { retryAfter?: number } } }).response?.data?.retryAfter;
      if (retryAfter) setCooldown(retryAfter);
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const backToCredentials = () => {
    setMfa(null);
    setOtpCode('');
    setError('');
    setInfo('');
  };

  const isRecovery = mfa?.step === 'recovery';
  const codeReady = isRecovery ? otpCode.replace(/[^A-Za-z0-9]/g, '').length === 10 : otpCode.length === 6;

  return (
    <div className="min-h-screen bg-[#0f1829] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-700 rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">BLA Administration</h1>
          <p className="text-gray-400 mt-1">Accès réservé aux administrateurs</p>
        </div>

        <div className="bg-[#1a2744] rounded-2xl p-8 shadow-2xl border border-white/10">
          {!mfa ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              {sessionNotice && (
                <div role="status" className="bg-blue-900/30 border border-blue-700 rounded-lg px-4 py-3 text-blue-200 text-sm">
                  <span aria-hidden="true">ℹ </span>{sessionNotice}
                </div>
              )}
              <div>
                <label htmlFor="admin-email" className="block text-sm font-medium text-gray-300 mb-1">Email administrateur</label>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'admin-email-error' : undefined}
                  {...register('email')}
                  className={`${inputClass} ${errors.email ? 'border-red-500' : ''}`}
                  placeholder="vous@exemple.com"
                />
                {errors.email && <p id="admin-email-error" role="alert" className="text-red-400 text-sm mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-sm font-medium text-gray-300 mb-1">Mot de passe</label>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'admin-password-error' : undefined}
                  {...register('password')}
                  className={`${inputClass} ${errors.password ? 'border-red-500' : ''}`}
                  placeholder="••••••••••••"
                />
                {errors.password && <p id="admin-password-error" role="alert" className="text-red-400 text-sm mt-1">{errors.password.message}</p>}
              </div>

              {error && (
                <div role="alert" className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
                  {error}
                </div>
              )}

              {slow && (
                <p role="status" className="text-xs text-gray-400">
                  Le serveur se réveille (cela peut prendre jusqu'à une minute). Ne relancez pas la connexion.
                </p>
              )}

              <button type="submit" disabled={loading} className={primaryButton}>
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          ) : (
            <form onSubmit={onVerifyMfa} className="space-y-5">
              <div>
                {mfa.step === 'totp' && (
                  <>
                    <p className="text-sm text-gray-300 mb-2">Code de votre application d'authentification</p>
                    <p className="text-xs text-gray-400 mb-2">Google Authenticator ou Microsoft Authenticator : 6 chiffres.</p>
                  </>
                )}
                {(mfa.step === 'email-otp' || mfa.step === 'totp-email') && (
                  <p className="text-sm text-gray-300 mb-2">Code OTP administrateur (6 chiffres)</p>
                )}
                {isRecovery && (
                  <p className="text-sm text-gray-300 mb-2">Code de récupération (XXXXX-XXXXX)</p>
                )}

                <input
                  value={otpCode}
                  onChange={(event) =>
                    setOtpCode(
                      isRecovery
                        ? event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 11)
                        : event.target.value.replace(/\D/g, '').slice(0, 6),
                    )
                  }
                  inputMode={isRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  aria-label={isRecovery ? 'Code de récupération' : 'Code à 6 chiffres'}
                  maxLength={isRecovery ? 11 : 6}
                  autoFocus
                  className={`${inputClass} ${isRecovery ? 'tracking-widest' : 'tracking-[0.5em]'} text-center`}
                  placeholder={isRecovery ? 'XXXXX-XXXXX' : '000000'}
                />

                {mfa.step === 'email-otp' && (
                  <>
                    <p className="text-xs text-gray-400 mt-2">Code envoyé sur {mfa.email}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Si vous avez reçu plusieurs e-mails, seul le code du plus récent est valide (10 minutes).
                      Pensez à vérifier les courriers indésirables.
                    </p>
                  </>
                )}
                {mfa.step === 'totp-email' && (
                  <p className="text-xs text-gray-400 mt-2">
                    Seul le code du plus récent e-mail est valide. Pensez à vérifier les courriers indésirables.
                  </p>
                )}
              </div>

              {info && (
                <div role="status" className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-3 text-green-300 text-sm">
                  {info}
                </div>
              )}

              {error && (
                <div role="alert" className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !codeReady} className={primaryButton}>
                {loading ? 'Verification...' : 'Verifier le code'}
              </button>

              {mfa.step === 'totp' && (
                <>
                  <button type="button" onClick={requestEmailCode} disabled={loading || cooldown > 0} className={linkButton}>
                    {cooldown > 0
                      ? `Je n'ai pas accès à mon application d'authentification (patientez ${cooldown} s)`
                      : "Je n'ai pas accès à mon application d'authentification"}
                  </button>
                  <button type="button" onClick={() => goToStep('recovery')} className={linkButton}>
                    Utiliser un code de récupération
                  </button>
                </>
              )}

              {mfa.step === 'totp-email' && (
                <>
                  <button type="button" onClick={requestEmailCode} disabled={loading || cooldown > 0} className={linkButton}>
                    {cooldown > 0 ? `Renvoyer un code (dans ${cooldown} s)` : 'Renvoyer un code'}
                  </button>
                  <button type="button" onClick={() => goToStep('totp')} className={linkButton}>
                    Utiliser l'application d'authentification
                  </button>
                </>
              )}

              {isRecovery && (
                <button type="button" onClick={() => goToStep('totp')} className={linkButton}>
                  Utiliser l'application d'authentification
                </button>
              )}

              <button type="button" onClick={backToCredentials} className={linkButton}>
                Retour à la connexion
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">BLA Admin - Accès non autorisé interdit</p>
      </div>
    </div>
  );
}
