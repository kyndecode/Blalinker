import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { SkeletonCard } from '../../components/common/Skeleton';
import api from '../../services/api';

interface Booking {
  id: string;
  status: string;
  scheduledAt: string;
  provider?: { firstName: string; lastName: string };
  client?:   { firstName: string; lastName: string };
  service?:  { name: string };
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'badge-orange',
  accepted:    'badge-blue',
  in_progress: 'badge-blue',
  completed:   'badge-green',
  validated:   'badge-green',
  cancelled:   'badge-gray',
  rejected:    'badge-red',
  disputed:    'badge-red',
};

const STATUS_LABELS: Record<string, string> = {
  pending:     'En attente',
  accepted:    'Acceptée',
  in_progress: 'En cours',
  completed:   'Terminée',
  validated:   'Validée',
  cancelled:   'Annulée',
  rejected:    'Refusée',
  disputed:    'En litige',
};

const QUICK_ACTIONS_CLIENT = [
  { to: '/search', icon: '🔍', label: 'Trouver un prestataire', color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  { to: '/bookings', icon: '📋', label: 'Mes réservations', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  { to: '/profile', icon: '👤', label: 'Mon profil', color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' },
];

const QUICK_ACTIONS_PROVIDER = [
  { to: '/bookings', icon: '📋', label: 'Mes missions', color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  { to: '/profile', icon: '⚙️', label: 'Mon profil', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  { to: '/earnings', icon: '💰', label: 'Mes revenus', color: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const isProvider = user?.role === 'provider';
  const quickActions = isProvider ? QUICK_ACTIONS_PROVIDER : QUICK_ACTIONS_CLIENT;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get('/bookings?limit=5')
      .then((r) => setBookings(r.data?.bookings || r.data || []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, []);

  const displayName = user?.email
    ? user.email.split('@')[0]
    : user?.phone
    ? user.phone.slice(-4)
    : (isProvider ? 'Prestataire' : 'Client');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {getGreeting()}, <span className="text-green-600 dark:text-green-400">{displayName}</span> 👋
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {isProvider ? 'Gérez vos missions et développez votre activité' : 'Bienvenue sur votre espace BLA Services'}
        </p>
      </div>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-title" className="mb-8">
        <h2 id="quick-actions-title" className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Actions rapides
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className={`flex sm:flex-col items-center sm:justify-center gap-3 sm:gap-2 p-4 sm:p-5 rounded-2xl border ${a.color} hover:scale-[1.02] transition-transform duration-150`}
            >
              <span className="text-3xl">{a.icon}</span>
              <span className="text-sm sm:text-xs font-semibold text-gray-700 dark:text-gray-200 sm:text-center">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent bookings */}
      <section aria-labelledby="recent-title">
        <div className="flex items-center justify-between mb-3">
          <h2 id="recent-title" className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {isProvider ? 'Dernières missions' : 'Dernières réservations'}
          </h2>
          <Link to="/bookings" className="text-sm text-green-600 dark:text-green-400 hover:underline font-medium">
            Voir tout →
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-8 text-center">
            <span className="text-4xl" aria-hidden="true">{isProvider ? '📭' : '📅'}</span>
            <p className="text-gray-500 dark:text-gray-400 mt-3 mb-4">
              {isProvider ? 'Aucune mission pour le moment' : 'Aucune réservation pour le moment'}
            </p>
            {!isProvider && (
              <Link to="/search" className="btn-primary inline-flex">
                Trouver un prestataire
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {bookings.map((b) => {
              const other = isProvider ? b.client : b.provider;
              const name = other ? `${other.firstName} ${other.lastName}` : '—';
              return (
                <Link
                  key={b.id}
                  to={`/bookings/${b.id}`}
                  className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 flex items-center gap-4 hover:border-green-200 dark:hover:border-green-800 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {b.service?.name || 'Service'} — {name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                  </div>
                  <span className={`badge ${STATUS_COLORS[b.status] || 'badge-gray'} shrink-0`}>
                    {STATUS_LABELS[b.status] || b.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
