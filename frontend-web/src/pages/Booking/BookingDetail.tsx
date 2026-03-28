import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calendar, MapPin, FileText, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import api from '../../services/api';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'En attente',  color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  confirmed: { label: 'Confirmée',   color: 'text-blue-700 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20'   },
  completed: { label: 'Terminée',    color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20' },
  cancelled: { label: 'Annulée',     color: 'text-red-700 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20'     },
};

const TIMELINE = ['pending', 'confirmed', 'completed'];

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`} />;
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api.get(`/bookings/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const booking = data?.data ?? data;

  const cancel = useMutation({
    mutationFn: () => api.patch(`/bookings/${id}/cancel`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking', id] }),
  });

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <SkeletonBlock className="h-5 w-20 mb-6" />
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
          <SkeletonBlock className="h-6 w-40" />
          <SkeletonBlock className="h-4 w-24 rounded-full" />
          <SkeletonBlock className="h-px w-full" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 dark:text-gray-400">Réservation introuvable.</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 text-green-600 dark:text-green-400 hover:underline text-sm font-medium"
        >
          ← Tableau de bord
        </button>
      </div>
    );
  }

  const status = booking.status ?? 'pending';
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const currentStep = TIMELINE.indexOf(status);
  const provider = booking.provider ?? booking.providerProfile;
  const providerName = provider
    ? `${provider.firstName ?? ''} ${provider.lastName ?? ''}`.trim()
    : null;

  const scheduledAt = booking.scheduledAt
    ? new Date(booking.scheduledAt).toLocaleString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Back */}
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Tableau de bord
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-5">
        {/* Title + status */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Réservation
            </h1>
            {providerName && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                avec <span className="font-medium text-gray-700 dark:text-gray-300">{providerName}</span>
              </p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusCfg.color} ${statusCfg.bg}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* Timeline */}
        {status !== 'cancelled' && (
          <div className="flex items-center gap-0">
            {TIMELINE.map((step, i) => {
              const done = i <= currentStep;
              const active = i === currentStep;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                    done
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  } ${active ? 'ring-2 ring-green-400 ring-offset-2 dark:ring-offset-gray-800' : ''}`}>
                    {done ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  {i < TIMELINE.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 transition-colors ${
                      i < currentStep ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="h-px bg-gray-100 dark:bg-gray-700" />

        {/* Details */}
        <div className="space-y-3">
          {scheduledAt && (
            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 capitalize">{scheduledAt}</p>
              </div>
            </div>
          )}
          {booking.address && (
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Adresse</p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{booking.address}</p>
              </div>
            </div>
          )}
          {booking.description && (
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Description</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{booking.description}</p>
              </div>
            </div>
          )}
          {booking.amount != null && (
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Montant</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {Number(booking.amount).toLocaleString('fr-FR')} XOF
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {status === 'pending' && (
          <>
            <div className="h-px bg-gray-100 dark:bg-gray-700" />
            <div className="flex gap-3">
              <button
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                className="flex-1 flex items-center justify-center gap-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium py-2.5 rounded-xl transition-colors disabled:opacity-60"
              >
                {cancel.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Annuler
              </button>
            </div>
          </>
        )}

        {cancel.isError && (
          <p className="text-xs text-red-600 dark:text-red-400 text-center">
            Impossible d'annuler. Réessayez.
          </p>
        )}
      </div>
    </div>
  );
}
