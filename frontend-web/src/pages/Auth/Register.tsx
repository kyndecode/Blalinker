import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input }  from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import api from '../../services/api';

const schema = z.object({
  phone:    z.string().regex(/^\+[1-9]\d{7,14}$/, 'Format: +221771234567').optional().or(z.literal('')),
  email:    z.string().email('Email invalide').optional().or(z.literal('')),
  password: z.string()
    .min(8, 'Minimum 8 caractères')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/[a-z]/, 'Au moins une minuscule')
    .regex(/[0-9]/, 'Au moins un chiffre'),
  role: z.enum(['client', 'provider']),
}).refine((d) => d.phone || d.email, { message: 'Téléphone ou email requis', path: ['phone'] });

type FormData = z.infer<typeof schema>;

const PAGE = 'min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4';
const CARD = 'w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-8';

export default function Register() {
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const [apiError, setApiError] = useState('');
  const defaultRole = (params.get('role') === 'provider' ? 'provider' : 'client') as 'client' | 'provider';

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: defaultRole },
  });

  const currentRole = watch('role');

  useEffect(() => { setValue('role', defaultRole); }, [defaultRole, setValue]);

  const onSubmit = async (data: FormData) => {
    setApiError('');
    try {
      await api.post('/auth/register', {
        phone:    data.phone  || undefined,
        email:    data.email  || undefined,
        password: data.password,
        role:     data.role,
      });
      navigate(`/verify?phone=${encodeURIComponent(data.phone || '')}&email=${encodeURIComponent(data.email || '')}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e?.response?.data?.error || "Erreur lors de l'inscription");
    }
  };

  return (
    <div className={PAGE}>
      <div className={CARD}>
        <div className="flex justify-center mb-7">
          <Logo size="md" />
        </div>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Créer un compte</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
          Rejoignez des milliers d'utilisateurs BLA
        </p>

        {/* Sélection du rôle */}
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-5">
          {([
            { value: 'client',   label: 'Client',      emoji: '👤' },
            { value: 'provider', label: 'Prestataire', emoji: '🔧' },
          ] as const).map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setValue('role', r.value)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all duration-150 ${
                currentRole === r.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
              aria-pressed={currentRole === r.value}
            >
              <span>{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>

        {apiError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4" role="alert">
            <p className="text-red-700 dark:text-red-400 text-sm">{apiError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Input label="Téléphone" type="tel" placeholder="+221 77 000 00 00"
            error={errors.phone?.message} helperText="Format international (+221...)"
            {...register('phone')} />
          <Input label="Email (optionnel)" type="email" placeholder="vous@exemple.com"
            error={errors.email?.message} {...register('email')} />
          <Input label="Mot de passe" type="password"
            error={errors.password?.message} helperText="8 caractères min., majuscule, chiffre"
            {...register('password')} />

          <Button type="submit" loading={isSubmitting} className="w-full mt-1">
            Créer mon compte
          </Button>
        </form>

        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-green-600 dark:text-green-400 font-semibold hover:underline">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
