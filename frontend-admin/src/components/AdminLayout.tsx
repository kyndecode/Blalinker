import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../store/adminAuthStore';
import {
  LayoutDashboard, Users, Briefcase, CalendarCheck,
  DollarSign, AlertTriangle, Star, Tag, LogOut, Shield,
  ChevronRight, Activity,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Tableau de bord', color: 'text-green-400'  },
  { to: '/users',        icon: Users,           label: 'Utilisateurs',    color: 'text-blue-400'   },
  { to: '/providers',    icon: Briefcase,       label: 'Prestataires',    color: 'text-purple-400' },
  { to: '/bookings',     icon: CalendarCheck,   label: 'Réservations',    color: 'text-orange-400' },
  { to: '/transactions', icon: DollarSign,      label: 'Transactions',    color: 'text-yellow-400' },
  { to: '/reviews',      icon: Star,            label: 'Avis',            color: 'text-pink-400'   },
  { to: '/reports',      icon: AlertTriangle,   label: 'Signalements',    color: 'text-red-400'    },
  { to: '/categories',   icon: Tag,             label: 'Catégories',      color: 'text-teal-400'   },
];

export default function AdminLayout() {
  const { user, logout } = useAdminAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials   = user?.email?.slice(0, 2).toUpperCase() ?? 'AD';
  const emailShort = user?.email ?? '';

  return (
    <div className="min-h-screen flex text-sm bg-[#0f1829]">

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="w-64 bg-[#1a2744] border-r border-white/[0.08] flex flex-col flex-shrink-0">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-extrabold text-base leading-tight tracking-tight">
                BLA <span className="text-green-400">Admin</span>
              </p>
              <p className="text-white/40 text-xs capitalize">{user?.role ?? 'admin'}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-white/30 text-xs font-semibold uppercase tracking-widest px-3 mb-3">Menu</p>
          {navItems.map(({ to, icon: Icon, label, color }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-white/50 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : color} opacity-80 group-hover:opacity-100`} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/50" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="p-3 border-t border-white/[0.08]">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{emailShort}</p>
              <p className="text-white/40 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm
                       text-white/40 hover:bg-red-500/15 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar */}
        <header className="h-14 bg-[#1a2744] border-b border-white/[0.08] flex items-center px-6 gap-4 flex-shrink-0">
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Activity className="w-3.5 h-3.5 text-green-400" />
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Système opérationnel
          </div>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-white/60 hidden sm:block">{emailShort}</span>
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
            <button
              onClick={handleLogout}
              className="ml-1 px-3 py-1.5 rounded-lg border border-white/20 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              Déconnexion
            </button>
          </div>
        </header>

        {/* Contenu */}
        <main className="flex-1 overflow-auto bg-[#0f1829]">
          <div className="p-6 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
