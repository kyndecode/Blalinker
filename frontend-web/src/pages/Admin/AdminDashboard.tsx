import { useQuery } from '@tanstack/react-query';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import api from '../../services/api';

function DashboardHome() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn:  () => api.get('/admin/dashboard').then((r) => r.data),
  });

  if (isLoading) return <div className="animate-pulse p-4">Chargement...</div>;

  const stats = [
    { label: 'Utilisateurs',   value: data?.totalUsers?.toLocaleString('fr'),    color: 'bg-blue-50   text-blue-800' },
    { label: 'Prestataires',   value: data?.totalProviders?.toLocaleString('fr'), color: 'bg-green-50  text-green-800' },
    { label: 'Réservations',   value: data?.activeBookings?.toLocaleString('fr'), color: 'bg-orange-50 text-orange-800' },
    { label: 'Commissions/mois',value: `${(data?.monthlyCommissions || 0).toLocaleString('fr')} XOF`, color: 'bg-purple-50 text-purple-800' },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Vue d'ensemble</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className={`card ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm mt-1 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>
      {(data?.pendingVerifications > 0 || data?.pendingReports > 0) && (
        <div className="card border-orange-200 bg-orange-50">
          <h3 className="font-semibold text-orange-800 mb-2">Actions requises</h3>
          {data?.pendingVerifications > 0 && (
            <p className="text-sm text-orange-700">
              ⚠️ {data.pendingVerifications} vérification(s) d'identité en attente
            </p>
          )}
          {data?.pendingReports > 0 && (
            <p className="text-sm text-orange-700">
              ⚠️ {data.pendingReports} signalement(s) non traité(s)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const location = useLocation();
  const navItems = [
    { path: '/admin',             label: 'Tableau de bord', icon: '📊' },
    { path: '/admin/users',       label: 'Utilisateurs',    icon: '👥' },
    { path: '/admin/reviews',     label: 'Avis',            icon: '⭐' },
    { path: '/admin/reports',     label: 'Signalements',    icon: '🚨' },
    { path: '/admin/transactions',label: 'Transactions',    icon: '💰' },
    { path: '/admin/categories',  label: 'Catégories',      icon: '🏷' },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex-shrink-0 hidden md:flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <p className="font-bold text-primary-400">BLA Admin</p>
        </div>
        <nav className="p-2 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
                location.pathname === item.path
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 bg-gray-50 overflow-auto">
        <Routes>
          <Route index element={<DashboardHome />} />
          <Route path="users"        element={<div className="card"><h2 className="font-bold text-lg">Gestion des utilisateurs</h2><p className="text-gray-500 mt-2">Liste et modération des comptes</p></div>} />
          <Route path="reviews"      element={<div className="card"><h2 className="font-bold text-lg">Modération des avis</h2></div>} />
          <Route path="reports"      element={<div className="card"><h2 className="font-bold text-lg">Signalements</h2></div>} />
          <Route path="transactions" element={<div className="card"><h2 className="font-bold text-lg">Transactions</h2></div>} />
          <Route path="categories"   element={<div className="card"><h2 className="font-bold text-lg">Catégories</h2></div>} />
        </Routes>
      </main>
    </div>
  );
}
