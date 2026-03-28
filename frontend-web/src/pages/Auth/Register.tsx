import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input }  from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import api from '../../services/api';
import { useState } from 'react';

const schema = z.object({
  phone:    z.string().regex(/^\+[1-9]\d{7,14}$/, 'Format: +221771234567').optional().or(z.literal('')),
  email:    z.string().email('Email invalide').optional().or(z.literal('')),
  password: z.string()
    .min(8, 'Minimum 8 caractères')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/[a-z]/, 'Au moins une minuscule')
    .regex(/[0-9]/, 'Au moins un chiffre'),
  role:     z.enum(['client', 'provider']),
}).refine((d) => d.phone || d.email, {
  message: 'Téléphone ou email requis',
  path:    ['phone'],
});

type FormData = z.infer<typeof schema>;

export default function Register() {
  const navigate      = useNavigate();
  const [params]      = useSearchParams();
  const [apiError, setApiError] = useState('');
  const defaultRole   = (params.get('role') === 'provider' ? 'provider' : 'client') as 'client' | 'provider';

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: defaultRole },
  });

  useEffect(() => { setValue('role', defaultRole); }, [defaultRole, setValue]);

  const onSubmit = async (data: FormData) => {
    setApiError('');
    try {
      await api.post('/auth/register', {
        phone:    data.phone || undefined,
        email:    data.email || undefined,
        password: data.password,
        role:     data.role,
      });
      navigate(`/verify?phone=${encodeURIComponent(data.phone || '')}&email=${encodeURIComponent(data.email || '')}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e?.response?.data?.error || 'Erreur lors de l\'inscription');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card max-w-sm w-full">
        <div className="text-center mb-6">
          <span className="text-4xl" aria-hidden="true">🔧</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Créer un compte</h1>
        </div>

        {/* Sélection du rôle */}
        <div className="flex gap-2 mb-4 p-1 bg-gray-100 rounded-lg">
          {(['client', 'provider'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setValue('role', r)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                errors.role ? '' : ''
              }`}
              aria-pressed={defaultRole === r}
            >
              {r === 'client' ? '👤 Client' : '🔧 Prestataire'}
            </button>
          ))}
        </div>

        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4" role="alert">
            <p className="text-red-700 text-sm">{apiError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Input
            label="Téléphone"
            type="tel"
            placeholder="+221 77 000 00 00"
            error={errors.phone?.message}
            helperText="Format international requis"
            {...register('phone')}
          />
          <Input
            label="Email (optionnel)"
            type="email"
            placeholder="vous@exemple.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Mot de passe"
            type="password"
            error={errors.password?.message}
            helperText="8 caractères min., majuscule, minuscule, chiffre"
            {...register('password')}
          />

          <Button type="submit" loading={isSubmitting} className="w-full mt-2">
            Créer mon compte
          </Button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
