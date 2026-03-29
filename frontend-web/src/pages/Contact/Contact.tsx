import { Link } from 'react-router-dom';

export default function Contact() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Contact & Support</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Besoin d'aide pour une réservation, un paiement ou votre compte ? Notre équipe vous accompagne.
        </p>

        <div className="space-y-3">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Email support</p>
            <p className="font-semibold text-gray-900 dark:text-white">support@bla-app.com</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Disponibilité</p>
            <p className="font-semibold text-gray-900 dark:text-white">Lun-Sam, 8h - 20h (UTC)</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/search" className="btn-primary">
            Trouver un prestataire
          </Link>
          <Link to="/bookings" className="btn-secondary">
            Voir mes réservations
          </Link>
        </div>
      </div>
    </div>
  );
}
