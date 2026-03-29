import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../services/api';
import { useAdminAuthStore } from '../store/adminAuthStore';
import { Shield } from 'lucide-react';

const schema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type FormData = z.infer<typeof schema>;

type AdminAuthUser = {
  id: string;
  role: 'admin' | 'super_admin' | string;
  email?: string;
};

type AuthResponse = {
  mfaRequired?: boolean;
  tempToken?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: AdminAuthUser;
};

function isAdminRole(role: string | undefined): role is 'admin' | 'super_admin' {
  return role === 'admin' || role === 'super_admin';
}

function getFriendlyError(err: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Connection problem. Check your network.';
  }

  const e = err as {
    code?: string;
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };

  if (!e.response) {
    return 'Connection problem. Check your network.';
  }

  return e.response.data?.error ?? e.response.data?.message ?? e.message ?? 'Identifiants incorrects';
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const setTokens = useAdminAuthStore((s) => s.setTokens);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [mfaState, setMfaState] = useState<{ required: boolean; tempToken: string; email: string }>({
    required: false,
    tempToken: '',
    email: '',
  });

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const completeSession = async (payload: AuthResponse, fallbackEmail: string) => {
    if (!payload.accessToken || !payload.refreshToken) {
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

    navigate('/dashboard');
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');

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

        setMfaState({ required: true, tempToken: auth.tempToken, email: data.email });
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
    setLoading(true);
    setError('');

    try {
      const res = await api.post<AuthResponse>('/auth/login/verify-mfa', {
        tempToken: mfaState.tempToken,
        otpCode: otpCode.trim(),
      });

      await completeSession(res.data, mfaState.email || getValues('email'));
    } catch (err: unknown) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1829] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">BLA Administration</h1>
          <p className="text-gray-400 mt-1">Accès réservé aux administrateurs</p>
        </div>

        <div className="bg-[#1a2744] rounded-2xl p-8 shadow-2xl border border-white/10">
          {!mfaState.required ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email administrateur</label>
                <input
                  type="email"
                  autoComplete="username"
                  {...register('email')}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white
                             placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500
                             focus:border-transparent"
                  placeholder="admin@bla-app.com"
                />
                {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Mot de passe</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white
                             placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500
                             focus:border-transparent"
                  placeholder="••••••••••••"
                />
                {errors.password && <p className="text-red-400 text-sm mt-1">{errors.password.message}</p>}
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50
                           text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          ) : (
            <form onSubmit={onVerifyMfa} className="space-y-5">
              <div>
                <p className="text-sm text-gray-300 mb-2">Code OTP administrateur (6 chiffres)</p>
                <input
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white
                             placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500
                             focus:border-transparent tracking-[0.5em] text-center"
                  placeholder="000000"
                />
                <p className="text-xs text-gray-400 mt-2">Code envoyé sur {mfaState.email}</p>
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50
                           text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? 'Verification...' : 'Verifier le code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMfaState({ required: false, tempToken: '', email: '' });
                  setOtpCode('');
                  setError('');
                }}
                className="w-full py-2 text-sm text-gray-300 hover:text-white transition-colors"
              >
                Retour à la connexion
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">BLA Admin - Acces non autorise interdit</p>
      </div>
    </div>
  );
}
