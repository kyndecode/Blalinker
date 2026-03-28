import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../store/adminAuthStore';
import {
  LayoutDashboard, Users, Briefcase, CalendarCheck,
  DollarSign, AlertTriangle, Star, Tag, LogOut, Shield
} from 'lucide-react';

const navItems = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/users',        icon: Users,           label: 'Utilisateurs'    },
  { to: '/providers',    icon: Briefcase,       label: 'Prestataires'    },
  { to: '/bookings',     icon: CalendarCheck,   label: 'Réservations'    },
  { to: '/transactions', icon: DollarSign,      label: 'Transactions'    },
  { to: '/reviews',      icon: Star,            label: 'Avis'            },
  { to: '/reports',      icon: AlertTriangle,   label: 'Signalements'    },
  { to: '/categories',   icon: Tag,             label: 'Catégories'      },
];

export default function AdminLayout() {
  const { user, logout } = useAdminAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">BLA Admin</p>
              <p className="text-gray-500 text-xs">{user?.role}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-green-600/20 text-green-400 font-medium'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="p-3 border-t border-gray-700">
          <div className="px-3 py-2 mb-1">
            <p className="text-white text-sm font-medium truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm
                       text-gray-400 hover:bg-gray-700 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
