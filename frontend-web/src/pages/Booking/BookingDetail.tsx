import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calendar, MapPin, FileText, CheckCircle, Wallet, AlertTriangle, Info } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useSiteConfig } from '../../hooks/useSiteConfig';
import { getApiErrorMessage } from '../../utils/apiError';
import { CancelDialog, ConfirmDialog, DisputeDialog, ReviewDialog } from '../../components/booking/BookingDialogs';
import { ReportDialog } from '../../components/report/ReportDialog';

type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'validated' | 'cancelled' | 'disputed';

interface Person { id: string; firstName?: string; lastName?: string; avatarUrl?: string | null }
interface BookingData {
  id: string;
  clientId: string;
  providerId: string;
  status: BookingStatus;
  scheduledAt: string | null;
  clientAddress: string | null;
  description: string | null;
  amount: string | number | null;
  currency: string;
  cancellationReason: string | null;
  client?: Person;
  provider?: Person & { providerProfile?: { businessName?: string | null } | null };
  service?: { title?: string; name?: string } | null;
  transaction?: { status: string } | null;
  review?: { id: string; rating: number; status: 'pending' | 'published' | 'rejected' } | null;
}

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'En attente',  color: 'text-yellow-800 dark:text-yellow-300', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  accepted:    { label: 'Acceptée',    color: 'text-blue-800 dark:text-blue-300',     bg: 'bg-blue-50 dark:bg-blue-900/20' },
  in_progress: { label: 'En cours',    color: 'text-blue-800 dark:text-blue-300',     bg: 'bg-blue-50 dark:bg-blue-900/20' },
  completed:   { label: 'Terminée',    color: 'text-green-800 dark:text-green-300',   bg: 'bg-green-50 dark:bg-green-900/20' },
  validated:   { label: 'Validée',     color: 'text-green-800 dark:text-green-300',   bg: 'bg-green-50 dark:bg-green-900/20' },
  rejected:    { label: 'Refusée',     color: 'text-red-800 dark:text-red-300',       bg: 'bg-red-50 dark:bg-red-900/20' },
  cancelled:   { label: 'Annulée',     color: 'text-red-800 dark:text-red-300',       bg: 'bg-red-50 dark:bg-red-900/20' },
  disputed:    { label: 'En litige',   color: 'text-orange-800 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-900/20' },
};

const TIMELINE: Array<{ status: BookingStatus; label: string }> = [
  { status: 'pending', label: 'Demande' },
  { status: 'accepted', label: 'Acceptée' },
  { status: 'in_progress', label: 'En cours' },
  { status: 'completed', label: 'Terminée' },
  { status: 'validated', label: 'Validée' },
];

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'En attente', processing: 'En cours de traitement', completed: 'Payé', failed: 'Échec', refunded: 'Remboursé',
};

const REVIEW_LABELS = { pending: 'en attente de vérification', published: 'publié', rejected: 'non publié' } as const;

type Transition = 'accept' | 'reject' | 'start' | 'complete' | 'validate';
const CONFIRMATIONS: Record<Transition, { title: string; message: string; label: string; danger?: boolean }> = {
  accept:   { title: 'Accepter la demande', message: 'Le client sera prévenu que vous acceptez cette mission.', label: 'Accepter' },
  reject:   { title: 'Refuser la demande', message: 'Le client sera prévenu que vous n’êtes pas disponible.', label: 'Refuser', danger: true },
  start:    { title: 'Démarrer la mission', message: 'Confirmez que vous commencez l’intervention.', label: 'Démarrer' },
  complete: { title: 'Mission terminée', message: 'Le client sera invité à confirmer la réalisation.', label: 'Confirmer' },
  validate: { title: 'Confirmer la réalisation', message: 'Vous confirmez que la prestation a bien été réalisée. Cette action est définitive.', label: 'Je confirme' },
};

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`} />;
}

function fullName(person?: Person, fallback = '—') {
  const name = `${person?.firstName ?? ''} ${person?.lastName ?? ''}`.trim();
  return name || fallback;
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const siteConfig = useSiteConfig();
  const [dialog, setDialog] = useState<Transition | 'cancel' | 'dispute' | 'review' | 'report' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: booking, isLoading, isError, error } = useQuery<BookingData>({
    queryKey: ['booking', id],
    queryFn: () => api.get(`/bookings/${id}`).then((r) => r.data?.data ?? r.data),
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['booking', id] });
    qc.invalidateQueries({ queryKey: ['bookings-list'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) => api.put(`/bookings/${id}/${path}`, body ?? {}).then((r) => r.data),
    onSuccess: (_data, vars) => {
      setDialog(null);
      setNotice(vars.path === 'dispute' ? 'Problème signalé : notre équipe vous recontactera.' : 'Réservation mise à jour.');
      refresh();
    },
  });

  const review = useMutation({
    mutationFn: (v: { rating: number; comment: string }) =>
      api.post('/reviews', { bookingId: id, rating: v.rating, ...(v.comment ? { comment: v.comment } : {}) }).then((r) => r.data),
    onSuccess: (data) => {
      setDialog(null);
      setNotice(data?.message ?? 'Merci pour votre avis.');
      refresh();
    },
  });

  const pay = useMutation({
    mutationFn: () => api.post('/payments/initiate', {
      bookingId: id,
      provider: 'cinetpay',
      currency: booking?.currency || 'XOF',
      returnUrl: window.location.href,
    }).then((r) => r.data),
    onSuccess: (data) => {
      if (data?.paymentUrl && /^https:\/\//.test(data.paymentUrl)) {
        window.location.href = data.paymentUrl;
        return;
      }
      refresh();
    },
  });

  const openDialog = (name: typeof dialog) => {
    action.reset();
    review.reset();
    setNotice(null);
    setDialog(name);
  };

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5" aria-busy="true">
        <SkeletonBlock className="h-5 w-20 mb-6" />
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
          <SkeletonBlock className="h-6 w-40" />
          <SkeletonBlock className="h-4 w-24 rounded-full" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-300">{isError ? getApiErrorMessage(error, 'Réservation introuvable.') : 'Réservation introuvable.'}</p>
        <button onClick={() => navigate('/bookings')} className="mt-4 text-green-700 dark:text-green-400 hover:underline text-sm font-medium">
          ← Mes réservations
        </button>
      </div>
    );
  }

  const isClient = user?.id === booking.clientId;
  const isProvider = user?.id === booking.providerId;
  const status = booking.status;
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const currentStep = TIMELINE.findIndex((s) => s.status === status);
  const counterpart = isClient ? booking.provider : booking.client;
  const counterpartName = isClient
    ? booking.provider?.providerProfile?.businessName || fullName(booking.provider, 'Prestataire')
    : fullName(booking.client, 'Client');
  const paymentStatus = booking.transaction?.status ?? null;
  const paid = paymentStatus === 'completed' || paymentStatus === 'processing';
  const onlinePayment = siteConfig.data?.onlinePayment;
  const showPayment = isClient && (status === 'pending' || status === 'accepted') && !paid;
  const canCancel = (status === 'pending' || status === 'accepted') && (isProvider || (isClient && !paid));
  const canReview = isClient && (status === 'completed' || status === 'validated') && !booking.review;

  const scheduledAt = booking.scheduledAt
    ? new Date(booking.scheduledAt).toLocaleString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const transitionButtons: Array<{ key: Transition; label: string; primary?: boolean; danger?: boolean }> = [];
  if (isProvider && status === 'pending') {
    transitionButtons.push({ key: 'accept', label: 'Accepter', primary: true }, { key: 'reject', label: 'Refuser', danger: true });
  }
  if (isProvider && status === 'accepted') transitionButtons.push({ key: 'start', label: 'Démarrer la mission', primary: true });
  if (isProvider && status === 'in_progress') transitionButtons.push({ key: 'complete', label: 'Marquer comme terminée', primary: true });
  if (isClient && status === 'completed') transitionButtons.push({ key: 'validate', label: 'Confirmer la réalisation', primary: true });

  const actionError = action.isError ? getApiErrorMessage(action.error) : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <button
        onClick={() => navigate('/bookings')}
        className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-400 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Mes réservations
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {booking.service?.title ?? booking.service?.name ?? 'Réservation'}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
              {isClient ? 'Prestataire' : 'Client'} : <span className="font-medium text-gray-800 dark:text-gray-100">{counterpartName}</span>
              {isClient && (
                <> · <Link to={`/provider/${booking.providerId}`} className="text-green-700 dark:text-green-400 underline underline-offset-2 hover:no-underline">voir le profil</Link></>
              )}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusCfg.color} ${statusCfg.bg}`} data-testid="booking-status">
            {statusCfg.label}
          </span>
        </div>

        {notice && <p role="status" className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-800 dark:text-green-300">{notice}</p>}

        {currentStep >= 0 && (
          <ol className="flex items-center" aria-label="Progression de la mission">
            {TIMELINE.map((step, i) => {
              const done = i <= currentStep;
              return (
                <li key={step.status} className="flex items-center flex-1 last:flex-none" aria-current={i === currentStep ? 'step' : undefined}>
                  <span
                    title={step.label}
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${done ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'} ${i === currentStep ? 'ring-2 ring-green-400 ring-offset-2 dark:ring-offset-gray-800' : ''}`}
                  >
                    {done ? <CheckCircle className="w-4 h-4" aria-hidden="true" /> : i + 1}
                    <span className="sr-only">{step.label}{done ? ' (fait)' : ''}</span>
                  </span>
                  {i < TIMELINE.length - 1 && <span className={`flex-1 h-0.5 mx-1 ${i < currentStep ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        )}

        {status === 'disputed' && (
          <p className="flex gap-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 px-3 py-2 text-sm text-orange-800 dark:text-orange-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            Litige en cours d’examen par l’équipe BLA. Les deux parties seront informées de la décision.
          </p>
        )}
        {(status === 'cancelled' || status === 'rejected') && booking.cancellationReason && (
          <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">Motif :</span> {booking.cancellationReason}</p>
        )}

        <div className="h-px bg-gray-100 dark:bg-gray-700" />

        <dl className="space-y-3">
          {scheduledAt && (
            <div>
              <dt className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"><Calendar className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />Date</dt>
              <dd className="pl-7 text-sm text-gray-800 dark:text-gray-200 capitalize">{scheduledAt}</dd>
            </div>
          )}
          {booking.clientAddress && (
            <div>
              <dt className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"><MapPin className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />Lieu de la mission</dt>
              <dd className="pl-7 text-sm text-gray-800 dark:text-gray-200">{booking.clientAddress}</dd>
            </div>
          )}
          {booking.description && (
            <div>
              <dt className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"><FileText className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />Description</dt>
              <dd className="pl-7 text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{booking.description}</dd>
            </div>
          )}
          {booking.amount != null && (
            <div>
              <dt className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"><Wallet className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" aria-hidden="true" />Montant</dt>
              <dd className="pl-7 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {Number(booking.amount).toLocaleString('fr-FR')} {booking.currency || 'XOF'}
                  {paymentStatus && <span className="ml-2 font-normal text-gray-600 dark:text-gray-300">· {PAYMENT_LABELS[paymentStatus] ?? paymentStatus}</span>}
                </dd>
            </div>
          )}
        </dl>

        {showPayment && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4" data-testid="payment-block">
            {onlinePayment?.available ? (
              <>
                <button
                  onClick={() => pay.mutate()}
                  disabled={pay.isPending}
                  className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {pay.isPending ? 'Redirection…' : 'Payer en ligne'}
                </button>
                {onlinePayment.simulated && <p className="mt-2 text-xs text-gray-500">Environnement de test : paiement simulé, aucun encaissement.</p>}
                {pay.isError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{getApiErrorMessage(pay.error, 'Impossible de lancer le paiement.')}</p>}
              </>
            ) : (
              <p className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
                Le paiement en ligne n’est pas encore disponible. Votre réservation suit son cours ; aucun paiement n’est demandé sur la plateforme.
              </p>
            )}
          </div>
        )}

        {booking.review && (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Votre avis : <span className="text-yellow-500" aria-label={`${booking.review.rating} sur 5`}>{'★'.repeat(booking.review.rating)}</span> — {REVIEW_LABELS[booking.review.status]}
          </p>
        )}

        {(transitionButtons.length > 0 || canCancel || canReview || (isClient && (status === 'in_progress' || status === 'completed'))) && (
          <>
            <div className="h-px bg-gray-100 dark:bg-gray-700" />
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              {transitionButtons.map((b) => (
                <button
                  key={b.key}
                  onClick={() => openDialog(b.key)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${b.danger ? 'border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'bg-green-600 text-white hover:bg-green-700'}`}
                >
                  {b.label}
                </button>
              ))}
              {canReview && (
                <button onClick={() => openDialog('review')} className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700">
                  Noter la prestation
                </button>
              )}
              {isClient && (status === 'in_progress' || status === 'completed') && (
                <button onClick={() => openDialog('dispute')} className="flex-1 rounded-xl border border-orange-300 dark:border-orange-800 py-2.5 text-sm font-semibold text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20">
                  Signaler un problème
                </button>
              )}
              {canCancel && (
                <button onClick={() => openDialog('cancel')} className="flex-1 rounded-xl border border-red-300 dark:border-red-800 py-2.5 text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                  Annuler
                </button>
              )}
            </div>
            {isClient && paid && (status === 'pending' || status === 'accepted') && (
              <p className="text-xs text-gray-600 dark:text-gray-400">Réservation payée : pour l’annuler, <Link to="/contact" className="underline">contactez le support</Link> (remboursement).</p>
            )}
          </>
        )}

        {counterpart && (isClient || isProvider) && (
          <button onClick={() => openDialog('report')} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 hover:underline">
            Signaler {isClient ? 'ce prestataire' : 'ce client'}
          </button>
        )}
      </div>

      {dialog && dialog in CONFIRMATIONS && (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          busy={action.isPending}
          error={actionError}
          title={CONFIRMATIONS[dialog as Transition].title}
          message={CONFIRMATIONS[dialog as Transition].message}
          confirmLabel={CONFIRMATIONS[dialog as Transition].label}
          danger={CONFIRMATIONS[dialog as Transition].danger}
          onConfirm={() => action.mutate({ path: dialog as Transition })}
        />
      )}
      <CancelDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} busy={action.isPending} error={actionError}
        onSubmit={(reason) => action.mutate({ path: 'cancel', body: reason ? { reason } : {} })} />
      <DisputeDialog open={dialog === 'dispute'} onClose={() => setDialog(null)} busy={action.isPending} error={actionError}
        onSubmit={(v) => action.mutate({ path: 'dispute', body: v })} />
      <ReviewDialog open={dialog === 'review'} onClose={() => setDialog(null)} busy={review.isPending}
        error={review.isError ? getApiErrorMessage(review.error) : null} onSubmit={(v) => review.mutate(v)} />
      {counterpart && (
        <ReportDialog open={dialog === 'report'} onClose={() => setDialog(null)} reportedId={isClient ? booking.providerId : booking.clientId}
          reportedName={counterpartName} bookingId={booking.id} />
      )}
    </div>
  );
}
