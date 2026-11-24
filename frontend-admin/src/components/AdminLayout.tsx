import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Briefcase, CalendarCheck, DollarSign, AlertTriangle, Star, Tag, LogOut, Shield, Mail,
  ChevronRight, UsersRound, ScrollText, Wallet, KeyRound, FileText, HelpCircle, Megaphone, Image, Settings as SettingsIcon,
  Globe, Menu, X, type LucideIcon,
} from 'lucide-react';
import { useAdminAuthStore } from '../store/adminAuthStore';
import api from '../services/api';

interface NavItem { to: string; icon: LucideIcon; label: string; permission?: string }
interface NavGroup { title: string; items: NavItem[] }

/** Menu : chaque entrée n'apparaît que si la permission correspondante est détenue (le serveur reste l'autorité). */
export const NAV_GROUPS: NavGroup[] = [
  { title: 'Pilotage', items: [{ to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord', permission: 'stats.read' }] },
  {
    title: 'Comptes',
    items: [
      { to: '/users', icon: Users, label: 'Utilisateurs', permission: 'users.read' },
      { to: '/providers', icon: Briefcase, label: 'Prestataires', permission: 'providers.read' },
      { to: '/team', icon: UsersRound, label: 'Équipe et rôles', permission: 'admins.manage' },
    ],
  },
  {
    title: 'Activité',
    items: [
      { to: '/bookings', icon: CalendarCheck, label: 'Réservations', permission: 'bookings.read' },
      { to: '/transactions', icon: DollarSign, label: 'Transactions', permission: 'payments.read' },
      { to: '/payouts', icon: Wallet, label: 'Retraits', permission: 'payments.read' },
      { to: '/reviews', icon: Star, label: 'Avis', permission: 'reviews.moderate' },
      { to: '/reports', icon: AlertTriangle, label: 'Signalements', permission: 'reports.handle' },
      { to: '/contacts', icon: Mail, label: 'Contacts', permission: 'contacts.handle' },
    ],
  },
  {
    title: 'Site public',
    items: [
      { to: '/content/pages', icon: FileText, label: 'Pages', permission: 'content.manage' },
      { to: '/content/faq', icon: HelpCircle, label: 'FAQ', permission: 'content.manage' },
      { to: '/content/announcements', icon: Megaphone, label: 'Annonces', permission: 'content.manage' },
      { to: '/content/media', icon: Image, label: 'Médiathèque', permission: 'content.manage' },
      { to: '/categories', icon: Tag, label: 'Catégories', permission: 'categories.manage' },
      { to: '/settings', icon: SettingsIcon, label: 'Paramètres', permission: 'settings.manage' },
      { to: '/countries', icon: Globe, label: 'Pays', permission: 'settings.manage' },
    ],
  },
  {
    title: 'Sécurité',
    items: [
      { to: '/securite', icon: KeyRound, label: 'Mon compte' },
      { to: '/audit', icon: ScrollText, label: "Journal d'audit", permission: 'audit.read' },
    ],
  },
];

/** Permissions de l'utilisateur connecté (super-administrateur : toutes). */
export function useMyPermissions(): { can: (permission?: string) => boolean; loaded: boolean } {
  const role = useAdminAuthStore((s) => s.user?.role);
  const { data, isSuccess } = useQuery<{ permissions?: string[] }>({
    queryKey: ['admin-me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: role === 'admin',
  });
  const held = new Set(data?.permissions ?? []);
  return {
    loaded: role === 'super_admin' || isSuccess,
    can: (permission?: string) => !permission || role === 'super_admin' || held.has(permission),
  };
}

function HealthIndicator() {
  const { data, isError } = useQuery<{ status: string }>({
    queryKey: ['api-health'],
    queryFn: () => api.get('/site/health').then((r) => r.data),
    refetchInterval: 60_000,
    retry: 0,
  });
  const state = isError ? 'down' : data?.status === 'ok' ? 'ok' : data ? 'degraded' : 'unknown';
  const label = { ok: 'API opérationnelle', degraded: 'API dégradée', down: 'API injoignable', unknown: 'Vérification…' }[state];
  const dot = { ok: 'bg-green-500', degraded: 'bg-amber-500', down: 'bg-red-500', unknown: 'bg-gray-500' }[state];
  return (
    <div className="flex items-center gap-2 text-xs text-white/60" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </div>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useMyPermissions();
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Menu principal">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => can(i.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-white/30">{group.title}</p>
            <ul className="space-y-0.5">
              {items.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onNavigate}
                    className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${isActive ? 'bg-white/15 font-semibold text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        <span className="flex-1">{label}</span>
                        {isActive && <ChevronRight className="h-3.5 w-3.5 text-white/50" aria-hidden="true" />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAdminAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { setDrawer(false); }, [location.pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'AD';
  const roleLabel = user?.role === 'super_admin' ? 'Super-administrateur' : 'Équipe';

  const brand = (
    <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-5">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-green-600 shadow-lg">
        <Shield className="h-5 w-5 text-white" aria-hidden="true" />
      </div>
      <div>
        <p className="text-base font-extrabold leading-tight tracking-tight text-white">BLA <span className="text-green-400">Admin</span></p>
        <p className="text-xs text-white/40">{roleLabel}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#0f1829] text-sm">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-green-600 focus:px-3 focus:py-2 focus:text-white">Aller au contenu</a>

      {/* Ordinateur : barre latérale fixe */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-white/[0.08] bg-[#1a2744] lg:flex">
        {brand}
        <Navigation />
      </aside>

      {/* Tablette / mobile : tiroir */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} aria-hidden="true" />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-[#1a2744] shadow-2xl">
            <button onClick={() => setDrawer(false)} aria-label="Fermer le menu" className="absolute right-3 top-5 rounded p-1 text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
            {brand}
            <Navigation onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#1a2744] px-3 sm:px-6">
          <button onClick={() => setDrawer(true)} aria-label="Ouvrir le menu" aria-expanded={drawer} className="rounded-lg p-2 text-white/80 hover:bg-white/10 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <HealthIndicator />
          <div className="ml-2 flex items-center gap-2">
            <span className="hidden max-w-[200px] truncate text-xs text-white/60 md:block">{user?.email}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white" aria-hidden="true">{initials}</div>
            <button onClick={handleLogout} className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white">
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Déconnexion</span><span className="sr-only sm:hidden">Déconnexion</span>
            </button>
          </div>
        </header>

        <main id="admin-main" className="flex-1 overflow-auto bg-[#0f1829]">
          <div className="mx-auto max-w-7xl p-3 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
