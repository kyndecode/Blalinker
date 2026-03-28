import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import api from '../../services/api';

const schema = z.object({
  firstName: z.string().min(1, 'Requis'),
  lastName:  z.string().min(1, 'Requis'),
  email:     z.string().email('Email invalide').optional().or(z.literal('')),
  phone:     z.string().optional(),
  bio:       z.string().max(500, 'Maximum 500 caractères').optional().or(z.literal('')),
  city:      z.string().optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

interface ProfileData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  bio?: string;
  city?: string;
  avatarUrl?: string;
  role?: string;
  isVerified?: boolean;
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState(false);
  const [apiError, setApiError] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    api.get('/users/me')
      .then((r) => {
        setProfile(r.data);
        reset({
          firstName: r.data.firstName || '',
          lastName:  r.data.lastName  || '',
          email:     r.data.email     || '',
          phone:     r.data.phone     || '',
          bio:       r.data.bio       || '',
          city:      r.data.city      || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    setApiError('');
    setSuccess(false);
    try {
      await api.patch('/users/me', data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setApiError(e?.response?.data?.error || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const initials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?';

  const roleLabel = user?.role === 'provider' ? 'Prestataire' : user?.role === 'admin' ? 'Admin' : 'Client';

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
            </div>
          </div>
          {[1,2,3,4].map((i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl mb-4" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Mon profil</h1>

      {/* Avatar + identity */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 mb-6 flex items-center gap-4">
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt="Avatar"
            className="w-20 h-20 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 text-2xl font-bold flex-shrink-0" aria-hidden="true">
            {initials}
          </div>
        )}
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-lg">
            {profile?.firstName} {profile?.lastName}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge badge-green">{roleLabel}</span>
            {profile?.isVerified && <span className="badge badge-blue">✓ Vérifié</span>}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {profile?.email || profile?.phone || ''}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Informations personnelles</h2>

        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 mb-5" role="status">
            <p className="text-green-700 dark:text-green-400 text-sm">✓ Profil mis à jour avec succès</p>
          </div>
        )}

        {apiError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-5" role="alert">
            <p className="text-red-700 dark:text-red-400 text-sm">{apiError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Prénom" error={errors.firstName?.message} {...register('firstName')} />
            <Input label="Nom" error={errors.lastName?.message} {...register('lastName')} />
          </div>
          <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <Input label="Téléphone" type="tel" {...register('phone')} disabled />
          <Input label="Ville" placeholder="Dakar, Abidjan..." {...register('city')} />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Bio <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <textarea
              {...register('bio')}
              rows={3}
              placeholder="Décrivez votre activité ou votre profil..."
              className="input resize-none"
            />
            {errors.bio && <p className="text-red-500 text-xs mt-1">{errors.bio.message}</p>}
          </div>

          <Button type="submit" loading={saving} className="w-full mt-1">
            Enregistrer les modifications
          </Button>
        </form>
      </div>

      {/* Security section */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 mt-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Sécurité</h2>
        <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Mot de passe</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Modifiable depuis la page de connexion</p>
          </div>
          <button className="text-sm text-green-600 dark:text-green-400 hover:underline font-medium">
            Modifier
          </button>
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Authentification à deux facteurs</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Protégez votre compte avec un code OTP</p>
          </div>
          <span className="badge badge-gray">Non activée</span>
        </div>
      </div>
    </div>
  );
}
