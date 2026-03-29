import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../services/api';
import { useAdminAuthStore } from '../store/adminAuthStore';
import { Shield } from 'lucide-react';

const schema = z.object({
  email:    z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});
type FormData = z.infer<typeof schema>;

export default function AdminLogin() {
  const navigate = useNavigate();
  const setTokens = useAdminAuthStore((s) => s.setTokens);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', data);
      const { accessToken, refreshToken, user } = res.data;

      // Vérifier que l'utilisateur est bien admin
      if (!['admin', 'super_admin'].includes(user.role)) {
        setError('Accès refusé — compte non administrateur');
        return;
      }

      setTokens(accessToken, refreshToken, user);
      navigate('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      const msg = e.response?.data?.error ?? e.response?.data?.message ?? 'Identifiants incorrects';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1829] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-2xl mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">BLA Administration</h1>
          <p className="text-gray-400 mt-1">Accès réservé aux administrateurs</p>
        </div>

        <div className="bg-[#1a2744] rounded-2xl p-8 shadow-2xl border border-white/10">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Email administrateur
              </label>
              <input
                type="email"
                autoComplete="username"
                {...register('email')}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white
                           placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500
                           focus:border-transparent"
                placeholder="admin@bla-app.com"
              />
              {errors.email && (
                <p className="text-red-400 text-sm mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white
                           placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500
                           focus:border-transparent"
                placeholder="••••••••••••"
              />
              {errors.password && (
                <p className="text-red-400 text-sm mt-1">{errors.password.message}</p>
              )}
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
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          BLA Admin — Accès non autorisé interdit
        </p>
      </div>
    </div>
  );
}
