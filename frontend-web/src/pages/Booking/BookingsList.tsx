import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';

type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'validated'
  | 'cancelled'
  | 'disputed';

interface BookingRow {
  id: string;
  status: BookingStatus;
  scheduledAt?: string | null;
  createdAt: string;
  service?: { name?: string; title?: string } | null;
  client?: { profile?: { firstName?: string; lastName?: string } } | null;
  provider?: { profile?: { firstName?: string; lastName?: string } } | null;
}

interface BookingsResponse {
  data: BookingRow[];
  meta: { total: number; page: number; totalPages: number };
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  rejected: 'Refusée',
  in_progress: 'En cours',
  completed: 'Terminée',
  validated: 'Validée',
  cancelled: 'Annulée',
  disputed: 'Litige',
};

const STATUS_CLASSES: Record<BookingStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  accepted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  validated: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  disputed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function BookingsList() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const { data, isLoading, isError } = useQuery<BookingsResponse>({
    queryKey: ['bookings-list', page, status],
    queryFn: async () => {
      const response = await api.get('/bookings', {
        params: {
          page,
          limit: 10,
          status: status || undefined,
        },
      });
      return response.data;
    },
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mes réservations</h1>
        <Link to="/search" className="btn-primary text-sm">
          Nouvelle réservation
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Filtrer par statut
        </label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="input max-w-xs"
        >
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="accepted">Acceptée</option>
          <option value="in_progress">En cours</option>
          <option value="completed">Terminée</option>
          <option value="validated">Validée</option>
          <option value="cancelled">Annulée</option>
        </select>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          Erreur de chargement des réservations.
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">Aucune réservation trouvée.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((booking) => {
          const otherParty = booking.provider?.profile ?? booking.client?.profile;
          const contactName = `${otherParty?.firstName ?? ''} ${otherParty?.lastName ?? ''}`.trim() || 'Prestataire';
          const serviceName = booking.service?.name ?? booking.service?.title ?? 'Service';
          const statusClass = STATUS_CLASSES[booking.status] ?? STATUS_CLASSES.pending;
          const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;

          return (
            <Link
              key={booking.id}
              to={`/bookings/${booking.id}`}
              className="block bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 hover:border-green-300 dark:hover:border-green-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">
                    {serviceName}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                    {contactName}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {booking.scheduledAt
                      ? new Date(booking.scheduledAt).toLocaleString('fr-FR')
                      : new Date(booking.createdAt).toLocaleString('fr-FR')}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                  {statusLabel}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="btn-secondary px-3 py-1.5 disabled:opacity-50"
          >
            ←
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Page {page} / {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
            disabled={page >= meta.totalPages}
            className="btn-secondary px-3 py-1.5 disabled:opacity-50"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
