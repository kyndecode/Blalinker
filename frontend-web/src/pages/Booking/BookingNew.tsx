import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Calendar, Clock, MapPin, FileText, ArrowLeft, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { Input } from '../../components/common/Input';

interface BookingForm {
  scheduledAt: string;
  address: string;
  description: string;
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BookingForm>();

  const mutation = useMutation({
    mutationFn: (form: BookingForm) =>
      api.post('/bookings', { providerId, ...form }).then((r) => r.data),
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
        onClick={() => navigate(providerId ? `/providers/${providerId}` : '/search')}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors mb-6"
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Date & time */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Calendar className="w-4 h-4 text-green-600 dark:text-green-400" />
              Date et heure
              <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
            </label>
            <input
              type="datetime-local"
              min={minDate}
              className={`input ${errors.scheduledAt ? 'input-error' : ''}`}
              {...register('scheduledAt', { required: 'La date est obligatoire' })}
            />
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
              placeholder="Ex: 12 rue des Fleurs, Dakar"
              error={errors.address?.message}
              {...register('address', { required: "L'adresse est obligatoire" })}
            />
            <MapPin className="absolute right-3 top-[34px] w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
              <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
              Description
            </label>
            <textarea
              rows={4}
              placeholder="Décrivez votre besoin..."
              className={`input resize-none ${errors.description ? 'input-error' : ''}`}
              {...register('description')}
            />
          </div>

          {/* Error */}
          {mutation.isError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl">
              Une erreur s'est produite. Veuillez réessayer.
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
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
