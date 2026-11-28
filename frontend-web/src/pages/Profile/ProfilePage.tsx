import { useCallback, useEffect, useMemo, useState } from 'react';
import ServiceEditDialog from '../../components/provider/ServiceEditDialog';
import { ConfirmDialog } from '../../components/booking/BookingDialogs';
import { getApiErrorMessage } from '../../utils/apiError';
import { applyServerFieldErrors } from '../../utils/formErrors';
import { FormMessage } from '../../components/common/FormMessage';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import api from '../../services/api';

const schema = z.object({
  firstName: z.string().trim().min(1, 'Indiquez votre prénom.'),
  lastName: z.string().trim().min(1, 'Indiquez votre nom.'),
  email: z.string().email('Veuillez saisir une adresse e-mail valide.').optional().or(z.literal('')),
  phone: z.string().optional(),
  bio: z.string().max(500, 'La présentation ne doit pas dépasser 500 caractères.').optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
});

/** Message d'une action de la page (sens indiqué par une icône, pas seulement la couleur). */
type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

/** Taille maximale acceptée par le serveur pour un fichier (photo, pièce d'identité). */
const MAX_UPLOAD_MB = 6;
function tooLarge(file: File): string | null {
  return file.size > MAX_UPLOAD_MB * 1024 * 1024
    ? `Ce fichier est trop volumineux (${(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo). La taille maximale autorisée est de ${MAX_UPLOAD_MB} Mo.`
    : null;
}

type FormData = z.infer<typeof schema>;

interface ProfileData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  bio?: string;
  city?: string;
  country?: string;
  address?: string;
  avatarUrl?: string;
  role?: string;
  isVerified?: boolean;
}

interface ProviderProfileData {
  businessName?: string | null;
  yearsExperience?: number;
  hourlyRate?: number | null;
  dailyRate?: number | null;
  currency?: string;
  radiusKm?: number;
  isAvailable?: boolean;
  bioPro?: string | null;
}

interface CategoryNode {
  id: string;
  name: string;
  children?: Array<{ id: string; name: string }>;
}

interface ProviderService {
  id: string;
  title: string;
  description?: string | null;
  price?: number | null;
  priceType?: string | null;
  isActive: boolean;
  category?: { id: string; name: string };
}

interface ProviderServiceCreateInput {
  categoryId: string;
  title: string;
  description: string;
  price: string;
  priceType: 'fixed' | 'hourly' | 'daily';
}

function normalizeCurrency(value: string): string {
  const trimmed = value.trim().toUpperCase();
  return trimmed || 'XOF';
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const isProvider = user?.role === 'provider';
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState('');

  const [providerLoading, setProviderLoading] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerSuccess, setProviderSuccess] = useState('');
  const [providerError, setProviderError] = useState('');

  const [providerProfile, setProviderProfile] = useState<ProviderProfileData>({
    businessName: '',
    yearsExperience: 0,
    hourlyRate: null,
    dailyRate: null,
    currency: 'XOF',
    radiusKm: 10,
    isAvailable: true,
    bioPro: '',
  });

  const [providerLocation, setProviderLocation] = useState<{ latitude?: number; longitude?: number; address?: string }>({});
  const [locSaving, setLocSaving] = useState(false);
  const [locMsg, setLocMsg] = useState<Notice>(null);
  const [avatarMsg, setAvatarMsg] = useState<Notice>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [kycUploading, setKycUploading] = useState(false);
  const [editingService, setEditingService] = useState<ProviderService | null>(null);
  const [deletingService, setDeletingService] = useState<ProviderService | null>(null);
  const [serviceDialogBusy, setServiceDialogBusy] = useState(false);
  const [serviceDialogError, setServiceDialogError] = useState<string | null>(null);
  const [kycMsg, setKycMsg] = useState<Notice>(null);
  const [balance, setBalance] = useState<{ available: number; held: number; pendingWithdrawal: number; currency: string } | null>(null);
  const [payouts, setPayouts] = useState<Array<{ id: string; amount: number; currency: string; status: string; createdAt: string }>>([]);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState<Notice>(null);

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [services, setServices] = useState<ProviderService[]>([]);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [serviceForm, setServiceForm] = useState<ProviderServiceCreateInput>({
    categoryId: '',
    title: '',
    description: '',
    price: '',
    priceType: 'fixed',
  });

  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const categoryOptions = useMemo(() => {
    return categories.flatMap((parent) => {
      if (Array.isArray(parent.children) && parent.children.length > 0) {
        return parent.children.map((child) => ({
          id: child.id,
          name: `${parent.name} - ${child.name}`,
        }));
      }
      return [{ id: parent.id, name: parent.name }];
    });
  }, [categories]);

  const loadProviderData = useCallback(async () => {
    if (!isProvider) return;

    setProviderLoading(true);
    setServiceLoading(true);
    setProviderError('');
    setServiceError('');

    try {
      const [providerResponse, servicesResponse, categoriesResponse, balanceResponse, payoutsResponse] = await Promise.all([
        api.get('/providers/me/profile'),
        api.get('/providers/me/services'),
        api.get('/categories'),
        api.get('/payouts/me/balance'),
        api.get('/payouts/me'),
      ]);

      setBalance(balanceResponse.data);
      setPayouts(payoutsResponse.data?.data ?? []);

      const me = providerResponse.data as {
        providerProfile?: ProviderProfileData | null;
        profile?: { latitude?: number | string | null; longitude?: number | string | null; address?: string | null } | null;
      };

      setProviderLocation({
        latitude: me.profile?.latitude != null ? Number(me.profile.latitude) : undefined,
        longitude: me.profile?.longitude != null ? Number(me.profile.longitude) : undefined,
        address: me.profile?.address ?? '',
      });

      const providerData = me.providerProfile ?? {};
      setProviderProfile({
        businessName: providerData.businessName ?? '',
        yearsExperience: providerData.yearsExperience ?? 0,
        hourlyRate: providerData.hourlyRate ?? null,
        dailyRate: providerData.dailyRate ?? null,
        currency: providerData.currency ?? 'XOF',
        radiusKm: providerData.radiusKm ?? 10,
        isAvailable: providerData.isAvailable ?? true,
        bioPro: providerData.bioPro ?? '',
      });

      const serviceRows = (servicesResponse.data?.data ?? []) as ProviderService[];
      setServices(serviceRows);

      const categoryRows = (categoriesResponse.data ?? []) as CategoryNode[];
      setCategories(categoryRows);
      const firstCategory = categoryRows[0]?.children?.[0]?.id ?? categoryRows[0]?.id ?? '';
      setServiceForm((prev) => ({
        ...prev,
        categoryId: prev.categoryId || firstCategory,
      }));
    } catch (error: unknown) {
      const message = getApiErrorMessage(error, 'Impossible de charger les données prestataire.');
      setProviderError(message);
      setServiceError(message);
    } finally {
      setProviderLoading(false);
      setServiceLoading(false);
    }
  }, [isProvider]);

  useEffect(() => {
    api.get('/users/me')
      .then((r) => {
        const data = r.data as ProfileData;
        setProfile(data);
        reset({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phone: data.phone || '',
          bio: data.bio || '',
          city: data.city || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reset]);

  useEffect(() => {
    loadProviderData();
  }, [loadProviderData]);

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    setApiError('');
    setSuccess(false);
    try {
      await api.patch('/users/me', data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 6000);
      setProfile((prev) => ({ ...(prev || {}), ...data }));
    } catch (err: unknown) {
      // Erreurs de validation du serveur : sous le champ ; sinon message général précis.
      if (applyServerFieldErrors(err, setError, ['firstName', 'lastName', 'email', 'phone', 'bio', 'city']) === 0) {
        setApiError(getApiErrorMessage(err, 'Le profil n’a pas pu être mis à jour. Réessayez.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveProviderProfile = async () => {
    setProviderSaving(true);
    setProviderError('');
    setProviderSuccess('');

    try {
      await api.put('/providers/me/profile', {
        businessName: providerProfile.businessName || undefined,
        yearsExperience: Number(providerProfile.yearsExperience || 0),
        hourlyRate: providerProfile.hourlyRate ? Number(providerProfile.hourlyRate) : undefined,
        dailyRate: providerProfile.dailyRate ? Number(providerProfile.dailyRate) : undefined,
        currency: normalizeCurrency(providerProfile.currency || 'XOF'),
        radiusKm: Number(providerProfile.radiusKm || 10),
        isAvailable: Boolean(providerProfile.isAvailable),
        bioPro: providerProfile.bioPro || undefined,
      });
      setProviderSuccess('Profil prestataire mis à jour.');
      await loadProviderData();
    } catch (error: unknown) {
      setProviderError(getApiErrorMessage(error, 'Le profil prestataire n’a pas pu être mis à jour. Réessayez.'));
    } finally {
      setProviderSaving(false);
    }
  };

  const useMyGPS = () => {
    setLocMsg(null);
    if (!('geolocation' in navigator)) { setLocMsg({ tone: 'error', text: 'La géolocalisation n’est pas disponible sur cet appareil.' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setProviderLocation((p) => ({ ...p, latitude: pos.coords.latitude, longitude: pos.coords.longitude })),
      () => setLocMsg({ tone: 'error', text: 'Impossible d’obtenir votre position : autorisez la localisation dans votre navigateur, puis réessayez.' }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const saveLocation = async () => {
    if (providerLocation.latitude == null || providerLocation.longitude == null) {
      setLocMsg({ tone: 'error', text: 'Définissez d’abord votre position avec le bouton GPS.' });
      return;
    }
    setLocSaving(true);
    setLocMsg(null);
    try {
      await api.put('/providers/me/profile', {
        latitude: providerLocation.latitude,
        longitude: providerLocation.longitude,
        address: providerLocation.address || undefined,
      });
      setLocMsg({ tone: 'success', text: 'Position enregistrée. Vous êtes désormais visible dans la recherche.' });
    } catch (error: unknown) {
      setLocMsg({ tone: 'error', text: getApiErrorMessage(error, 'La position n’a pas pu être enregistrée. Réessayez.') });
    } finally {
      setLocSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    // Avant : toute erreur était ignorée, le bouton semblait ne rien faire.
    const sizeError = tooLarge(file);
    if (sizeError) { setAvatarMsg({ tone: 'error', text: sizeError }); return; }
    setAvatarMsg(null);
    setAvatarUploading(true);
    try {
      const r = await api.postForm('/uploads/avatar', { file });
      setProfile((prev) => ({ ...(prev || {}), avatarUrl: r.data.url }));
      setAvatarMsg({ tone: 'success', text: 'Votre photo de profil a été mise à jour.' });
    } catch (error: unknown) {
      setAvatarMsg({ tone: 'error', text: getApiErrorMessage(error, 'La photo n’a pas pu être envoyée. Réessayez.') });
    } finally {
      setAvatarUploading(false);
    }
  };

  const uploadKyc = async (file: File) => {
    const sizeError = tooLarge(file);
    if (sizeError) { setKycMsg({ tone: 'error', text: sizeError }); return; }
    setKycUploading(true);
    setKycMsg(null);
    try {
      const r = await api.postForm('/uploads/id-card', { file });
      setKycMsg({ tone: 'success', text: r.data.message || 'Votre document a été transmis. Il est en attente de vérification par notre équipe.' });
    } catch (error: unknown) {
      setKycMsg({ tone: 'error', text: getApiErrorMessage(error, 'Le document n’a pas pu être envoyé. Réessayez.') });
    } finally {
      setKycUploading(false);
    }
  };

  const requestPayout = async () => {
    setPayoutBusy(true);
    setPayoutMsg(null);
    try {
      await api.post('/payouts/me/request', {});
      setPayoutMsg({ tone: 'success', text: 'Votre demande de retrait a été envoyée. Elle sera traitée par notre équipe.' });
      await loadProviderData();
    } catch (error: unknown) {
      setPayoutMsg({ tone: 'error', text: getApiErrorMessage(error, 'La demande de retrait n’a pas pu être envoyée. Réessayez.') });
    } finally {
      setPayoutBusy(false);
    }
  };

  const createService = async () => {
    if (!serviceForm.categoryId || !serviceForm.title.trim()) {
      setServiceError('Choisissez une catégorie et indiquez un titre pour le service.');
      return;
    }

    const numericPrice = Number(serviceForm.price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setServiceError('Indiquez un prix valide, supérieur à 0.');
      return;
    }

    setServiceSaving(true);
    setServiceError('');
    try {
      await api.post('/providers/me/services', {
        categoryId: serviceForm.categoryId,
        title: serviceForm.title.trim(),
        description: serviceForm.description.trim() || undefined,
        priceType: serviceForm.priceType,
        price: numericPrice,
        isActive: true,
      });
      setServiceForm((prev) => ({
        ...prev,
        title: '',
        description: '',
        price: '',
      }));
      await loadProviderData();
    } catch (error: unknown) {
      setServiceError(getApiErrorMessage(error, 'Le service n’a pas pu être créé. Réessayez.'));
    } finally {
      setServiceSaving(false);
    }
  };

  const toggleService = async (service: ProviderService) => {
    try {
      await api.put(`/providers/me/services/${service.id}`, {
        isActive: !service.isActive,
      });
      await loadProviderData();
    } catch (error: unknown) {
      setServiceError(getApiErrorMessage(error, 'Le statut du service n’a pas pu être modifié. Réessayez.'));
    }
  };

  // Modification et suppression via des fenêtres accessibles (plus d'invites du navigateur).
  const editService = (service: ProviderService) => { setServiceDialogError(null); setEditingService(service); };
  const removeService = (service: ProviderService) => { setServiceDialogError(null); setDeletingService(service); };

  const saveService = async (values: { title: string; description?: string; price: number }) => {
    if (!editingService) return;
    setServiceDialogBusy(true);
    try {
      await api.put(`/providers/me/services/${editingService.id}`, values);
      setEditingService(null);
      await loadProviderData();
    } catch (error: unknown) {
      setServiceDialogError(getApiErrorMessage(error, 'Impossible de modifier le service'));
    } finally {
      setServiceDialogBusy(false);
    }
  };

  const confirmRemoveService = async () => {
    if (!deletingService) return;
    setServiceDialogBusy(true);
    try {
      await api.delete(`/providers/me/services/${deletingService.id}`);
      setDeletingService(null);
      await loadProviderData();
    } catch (error: unknown) {
      setServiceDialogError(getApiErrorMessage(error, 'Impossible de supprimer le service'));
    } finally {
      setServiceDialogBusy(false);
    }
  };

  const initials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?';

  const roleLabel = user?.role === 'provider' ? 'Prestataire' : user?.role === 'admin' ? 'Admin' : 'Client';

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl mb-4" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mon profil</h1>

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 sm:p-6 flex flex-wrap items-center gap-4">
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 text-2xl font-bold">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white text-lg break-words">
            {profile?.firstName} {profile?.lastName}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="badge badge-green">{roleLabel}</span>
            {profile?.isVerified && <span className="badge badge-blue">Vérifié</span>}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 break-all">
            {profile?.email || profile?.phone || ''}
          </p>
        </div>
        {/* Champ visuellement masqué mais atteignable au clavier (« hidden » le rendait inaccessible). */}
        <label className="w-full sm:w-auto sm:ml-auto shrink-0 cursor-pointer text-sm font-medium text-green-700 dark:text-green-400 hover:underline focus-within:ring-2 focus-within:ring-green-500 rounded-lg px-1">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={avatarUploading}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadAvatar(f); }}
          />
          {avatarUploading ? 'Envoi…' : 'Changer la photo'}
        </label>
      </div>
      <FormMessage tone={avatarMsg?.tone ?? 'info'} className="mb-4">{avatarMsg?.text}</FormMessage>

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Informations personnelles</h2>

        <FormMessage tone="success" className="mb-5">{success ? 'Votre profil a été mis à jour.' : null}</FormMessage>
        <FormMessage tone="error" className="mb-5">{apiError}</FormMessage>

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
              Bio <span className="text-gray-500 dark:text-gray-400 font-normal">(optionnel)</span>
            </label>
            <textarea {...register('bio')} rows={3} placeholder="Décrivez votre profil..." className="input resize-none" />
            {errors.bio && <p className="text-red-500 text-xs mt-1">{errors.bio.message}</p>}
          </div>

          <Button type="submit" loading={saving} className="w-full mt-1">
            Enregistrer les modifications
          </Button>
        </form>
      </div>

      {isProvider && (
        <>
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Ma position & vérification</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Sans position, vous n'apparaissez pas dans la recherche. La pièce d'identité permet d'obtenir le badge « Vérifié ».
            </p>

            <FormMessage tone={locMsg?.tone ?? 'info'} className="mb-4">{locMsg?.text}</FormMessage>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Position (GPS)</label>
                <div className="flex gap-2">
                  <button type="button" onClick={useMyGPS} className="btn-secondary text-sm px-3 py-2">📍 Utiliser ma position</button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
                    {providerLocation.latitude != null && providerLocation.longitude != null
                      ? `${providerLocation.latitude.toFixed(4)}, ${providerLocation.longitude.toFixed(4)}`
                      : 'Non définie'}
                  </span>
                </div>
              </div>
              <Input
                label="Adresse"
                placeholder="Quartier, ville…"
                value={providerLocation.address || ''}
                onChange={(e) => setProviderLocation((p) => ({ ...p, address: e.target.value }))}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={saveLocation} loading={locSaving}>Enregistrer ma position</Button>

              {/* Champ visuellement masqué mais atteignable au clavier (« hidden » le rendait inaccessible). */}
              <label className="cursor-pointer btn-secondary text-sm px-4 py-2 focus-within:ring-2 focus-within:ring-green-500">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  disabled={kycUploading}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadKyc(f); }}
                />
                {kycUploading ? 'Envoi…' : '🪪 Envoyer ma pièce d\'identité (KYC)'}
              </label>
              {profile?.isVerified && <span className="badge badge-blue">Identité vérifiée</span>}
            </div>
            <FormMessage tone={kycMsg?.tone ?? 'info'} className="mt-2">{kycMsg?.text}</FormMessage>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Mes revenus</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Les fonds sont libérés dès que le client valide la prestation, puis retirables.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">Disponible au retrait</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{(balance?.available ?? 0).toLocaleString('fr-FR')} XOF</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">En attente (escrow)</p>
                <p className="text-xl font-bold text-gray-700 dark:text-gray-200">{(balance?.held ?? 0).toLocaleString('fr-FR')} XOF</p>
              </div>
              <div className="rounded-xl bg-yellow-50 dark:bg-yellow-900/20 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">Retrait en cours</p>
                <p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{(balance?.pendingWithdrawal ?? 0).toLocaleString('fr-FR')} XOF</p>
              </div>
            </div>

            <FormMessage tone={payoutMsg?.tone ?? 'info'} className="mb-3">{payoutMsg?.text}</FormMessage>

            <Button onClick={requestPayout} loading={payoutBusy} disabled={!balance || balance.available <= 0}>
              Demander un retrait
            </Button>

            {payouts.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Historique des retraits</p>
                {payouts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2">
                    <span className="text-gray-700 dark:text-gray-200">{Number(p.amount).toLocaleString('fr-FR')} {p.currency}</span>
                    <span className="text-gray-500 dark:text-gray-400">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</span>
                    <span className={`badge ${p.status === 'paid' ? 'badge-green' : p.status === 'rejected' ? 'badge-red' : 'badge-orange'}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Profil prestataire</h2>

            <FormMessage tone="error" className="mb-4">{providerError}</FormMessage>
            <FormMessage tone="success" className="mb-4">{providerSuccess}</FormMessage>

            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Nom commercial"
                value={providerProfile.businessName || ''}
                onChange={(e) => setProviderProfile((prev) => ({ ...prev, businessName: e.target.value }))}
              />
              <Input
                label="Devise"
                value={providerProfile.currency || 'XOF'}
                onChange={(e) => setProviderProfile((prev) => ({ ...prev, currency: e.target.value }))}
              />
              <Input
                label="Expérience (années)"
                type="number"
                value={providerProfile.yearsExperience ?? 0}
                onChange={(e) => setProviderProfile((prev) => ({ ...prev, yearsExperience: Number(e.target.value || 0) }))}
              />
              <Input
                label="Rayon d'intervention (km)"
                type="number"
                value={providerProfile.radiusKm ?? 10}
                onChange={(e) => setProviderProfile((prev) => ({ ...prev, radiusKm: Number(e.target.value || 10) }))}
              />
              <Input
                label="Tarif horaire"
                type="number"
                value={providerProfile.hourlyRate ?? ''}
                onChange={(e) => setProviderProfile((prev) => ({ ...prev, hourlyRate: e.target.value ? Number(e.target.value) : null }))}
              />
              <Input
                label="Tarif journalier"
                type="number"
                value={providerProfile.dailyRate ?? ''}
                onChange={(e) => setProviderProfile((prev) => ({ ...prev, dailyRate: e.target.value ? Number(e.target.value) : null }))}
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Bio professionnelle
              </label>
              <textarea
                rows={4}
                className="input resize-none"
                value={providerProfile.bioPro || ''}
                onChange={(e) => setProviderProfile((prev) => ({ ...prev, bioPro: e.target.value }))}
                placeholder="Décrivez vos spécialités, zones desservies, délais..."
              />
            </div>

            <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={Boolean(providerProfile.isAvailable)}
                onChange={(e) => setProviderProfile((prev) => ({ ...prev, isAvailable: e.target.checked }))}
                className="w-4 h-4 accent-green-600"
              />
              Disponible pour de nouvelles réservations
            </label>

            <div className="mt-4">
              <Button onClick={saveProviderProfile} loading={providerSaving || providerLoading}>
                Enregistrer le profil prestataire
              </Button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Mes services</h2>

            <FormMessage tone="error" className="mb-4">{serviceError}</FormMessage>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label htmlFor="service-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Catégorie</label>
                <select
                  id="service-category"
                  value={serviceForm.categoryId}
                  onChange={(e) => setServiceForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                  className="input"
                >
                  <option value="">Choisir une catégorie</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Titre du service"
                value={serviceForm.title}
                onChange={(e) => setServiceForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Ex: Dépannage plomberie à domicile"
              />

              <Input
                label="Prix (XOF)"
                type="number"
                value={serviceForm.price}
                onChange={(e) => setServiceForm((prev) => ({ ...prev, price: e.target.value }))}
                placeholder="15000"
              />

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  className="input resize-none"
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Expliquez précisément la prestation proposée..."
                />
              </div>

              <div>
                <label htmlFor="service-price-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type de prix</label>
                <select
                  id="service-price-type"
                  value={serviceForm.priceType}
                  onChange={(e) => setServiceForm((prev) => ({ ...prev, priceType: e.target.value as ProviderServiceCreateInput['priceType'] }))}
                  className="input"
                >
                  <option value="fixed">Forfait</option>
                  <option value="hourly">Horaire</option>
                  <option value="daily">Journalier</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button onClick={createService} loading={serviceSaving || serviceLoading} className="w-full">
                  Ajouter le service
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {services.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Aucun service publié pour le moment.</p>
              )}

              {services.map((service) => (
                <div
                  key={service.id}
                  className="border border-gray-100 dark:border-gray-800 rounded-xl p-4 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{service.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {service.category?.name || 'Sans catégorie'} • {service.price ? `${Number(service.price).toLocaleString('fr-FR')} XOF` : 'Prix non défini'}
                      </p>
                    </div>
                    <span className={`badge ${service.isActive ? 'badge-green' : 'badge-gray'}`}>
                      {service.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </div>

                  {service.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">{service.description}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => editService(service)} className="btn-secondary text-xs px-3 py-1.5">
                      Modifier
                    </button>
                    <button onClick={() => toggleService(service)} className="btn-secondary text-xs px-3 py-1.5">
                      {service.isActive ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      onClick={() => removeService(service)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <ServiceEditDialog service={editingService} busy={serviceDialogBusy} error={serviceDialogError}
        onClose={() => setEditingService(null)} onSave={saveService} />
      <ConfirmDialog open={Boolean(deletingService)} onClose={() => setDeletingService(null)} busy={serviceDialogBusy} error={serviceDialogError}
        title="Supprimer le service" message={`« ${deletingService?.title ?? ''} » ne sera plus proposé aux clients.`}
        confirmLabel="Supprimer" danger onConfirm={confirmRemoveService} />
    </div>
  );
}
