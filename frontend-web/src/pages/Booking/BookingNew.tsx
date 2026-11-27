import { useEffect, useMemo } from 'react';
import { getApiErrorCode, getApiErrorMessage } from '../../utils/apiError';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Calendar, Clock, MapPin, FileText, ArrowLeft, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { Input } from '../../components/common/Input';

interface BookingForm {
  serviceId: string;
  scheduledAt: string;
  address: string;
  description: string;
}

interface ProviderService {
  id: string;
  title: string;
  description?: string | null;
  price?: number | string | null;
  priceType?: string | null;
  category?: { name?: string };
}

/** Identifiant de la demande déjà en attente (réponse 409 BOOKING_DUPLICATE). */
function duplicateId(error: unknown): string | undefined {
  const id = (error as { response?: { data?: { bookingId?: unknown } } } | null)?.response?.data?.bookingId;
  return typeof id === 'string' ? id : undefined;
}

export default function BookingNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const providerId = params.get('provider');

  const { data: providerData } = useQuery({
    queryKey: ['provider', providerId],
    queryFn: () => api.get(`/providers/${providerId}`).then((r) => r.data),
    enabled: !!providerId,
  });

  const provider = providerData?.data ?? providerData;
  const profile = provider?.profile ?? provider;
  const firstName = profile?.firstName ?? '';
  const lastName = profile?.lastName ?? '';
  const selectedServiceFromParams = params.get('service');
  const providerServices = useMemo(() => {
    return Array.isArray(provider?.services) ? (provider.services as ProviderService[]) : [];
  }, [provider?.services]);

  const selectedService = useMemo(() => {
    return providerServices.find((service) => service.id === selectedServiceFromParams);
  }, [providerServices, selectedServiceFromParams]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BookingForm>({ mode: 'onTouched' });
  const descriptionLength = (watch('description') ?? '').trim().length;
  const selectedServiceId = watch('serviceId');
  const activeService = providerServices.find((service) => service.id === selectedServiceId) ?? selectedService;
  const activeServicePrice = activeService?.price !== null && activeService?.price !== undefined
    ? Number(activeService.price)
    : null;

  useEffect(() => {
    if (selectedService?.id) {
      setValue('serviceId', selectedService.id);
      return;
    }
    if (providerServices.length === 1) {
      setValue('serviceId', providerServices[0].id);
    }
  }, [selectedService?.id, providerServices, setValue]);

  const mutation = useMutation({
    mutationFn: (form: BookingForm) =>
      api.post('/bookings', {
        providerId,
        serviceId: form.serviceId,
        scheduledAt: form.scheduledAt || undefined,
        description: form.description.trim(),
        clientAddress: form.address.trim(),
        amount: activeServicePrice ?? undefined,
      }).then((r) => r.data),
    onSuccess: (data) => {
      const bookingId = data?.data?.id ?? data?.id;
      navigate(bookingId ? `/bookings/${bookingId}` : '/dashboard');
    },
  });

  const onSubmit = (form: BookingForm) => mutation.mutate(form);

  // Min datetime = now + 1 hour
  const minDate = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Back */}
      <button
        onClick={() => navigate(providerId ? `/provider/${providerId}` : '/search')}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-400 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
          Nouvelle réservation
        </h1>
        {(firstName || lastName) && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            avec{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {firstName} {lastName}
            </span>
          </p>
        )}

        {providerServices.length === 0 && (
          <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-sm text-yellow-800 dark:text-yellow-300">
            Aucun service actif disponible pour ce prestataire.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Service */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="booking-service" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Service
              <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            </label>
            <select
              id="booking-service"
              className={`input ${errors.serviceId ? 'input-error' : ''}`}
              {...register('serviceId', { required: 'Le service est obligatoire' })}
            >
              <option value="">Choisir un service</option>
              {providerServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.title} - {service.price ? `${Number(service.price).toLocaleString('fr-FR')} XOF` : 'Prix à définir'}
                </option>
              ))}
            </select>
            {errors.serviceId && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {errors.serviceId.message}
              </p>
            )}
            {activeService && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {activeService.category?.name ? `${activeService.category.name} • ` : ''}
                {activeServicePrice ? `${activeServicePrice.toLocaleString('fr-FR')} XOF` : 'Prix à définir'}
              </p>
            )}
          </div>

          {/* Date & time */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="booking-date" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Calendar className="w-4 h-4 text-green-700 dark:text-green-400" aria-hidden="true" />
              Date et heure
              <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            </label>
            <input
              id="booking-date"
              type="datetime-local"
              min={minDate}
              aria-invalid={Boolean(errors.scheduledAt)}
              aria-describedby="booking-date-help"
              className={`input ${errors.scheduledAt ? 'input-error' : ''}`}
              {...register('scheduledAt', {
                required: 'Choisissez une date et une heure.',
                validate: (v) => !v || new Date(v).getTime() > Date.now() || 'La date doit être dans le futur.',
              })}
            />
            <p id="booking-date-help" className="text-xs text-gray-500 dark:text-gray-400">
              Proposez un créneau : le prestataire l’accepte ou le refuse, vous êtes prévenu dans tous les cas.
            </p>
            {errors.scheduledAt && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {errors.scheduledAt.message}
              </p>
            )}
          </div>

          {/* Address */}
          <div className="relative">
            <Input
              label="Adresse d'intervention"
              placeholder="Quartier, rue, point de repère…"
              helperText="Visible uniquement par le prestataire que vous réservez."
              error={errors.address?.message}
              {...register('address', {
                required: "Indiquez le lieu de l'intervention.",
                minLength: { value: 5, message: 'Adresse trop courte (5 caractères minimum).' },
              })}
            />
            <MapPin className="absolute right-3 top-[34px] w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="booking-description" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              <FileText className="w-4 h-4 text-green-700 dark:text-green-400" aria-hidden="true" />
              Description
              <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            </label>
            <textarea
              id="booking-description"
              rows={4}
              maxLength={1000}
              placeholder="Ex. : fuite sous l’évier de la cuisine depuis hier, accès par la cour."
              aria-invalid={Boolean(errors.description)}
              aria-describedby="booking-description-help"
              className={`input resize-none ${errors.description ? 'input-error' : ''}`}
              {...register('description', {
                required: 'Décrivez votre besoin.',
                minLength: { value: 10, message: 'Ajoutez quelques détails (10 caractères minimum).' },
              })}
            />
            <p id="booking-description-help" className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Précisez le problème, l’accès et le matériel éventuel : le prestataire répond plus vite.</span>
              <span aria-live="polite">{descriptionLength}/1000</span>
            </p>
            {errors.description && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Error */}
          {mutation.isError && (
            <div role="alert" className="text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl">
              <p>{getApiErrorMessage(mutation.error, 'La demande n’a pas pu être envoyée. Réessayez.')}</p>
              {getApiErrorCode(mutation.error) === 'BOOKING_DUPLICATE' && duplicateId(mutation.error) && (
                <Link to={`/bookings/${duplicateId(mutation.error)}`} className="mt-1 inline-block font-medium underline">Voir ma demande en cours</Link>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={mutation.isPending || providerServices.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 active:bg-green-900 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Envoi en cours…
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" />
                Confirmer la réservation
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
