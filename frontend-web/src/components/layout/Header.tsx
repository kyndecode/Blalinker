import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import Logo from '../common/Logo';

export default function Header() {
  const { t, i18n }    = useTranslation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate       = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignorer */ }
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <Logo size="sm" />
          </Link>

          {/* Navigation centrale — desktop */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <Link to="/search" className="px-4 py-2 rounded-lg text-gray-600 hover:text-green-700 hover:bg-green-50 transition-colors">
              {t('nav.search')}
            </Link>
            {isAuthenticated && (
              <Link to="/dashboard" className="px-4 py-2 rounded-lg text-gray-600 hover:text-green-700 hover:bg-green-50 transition-colors">
                {t('nav.dashboard', 'Tableau de bord')}
              </Link>
            )}
          </nav>

          {/* Actions droite */}
          <div className="flex items-center gap-2">
            {/* Sélecteur de langue */}
            <select
              value={i18n.language}
              onChange={(e) => { i18n.changeLanguage(e.target.value); localStorage.setItem('bla_lang', e.target.value); }}
              className="hidden sm:block text-xs border border-gray-200 rounded-md bg-transparent text-gray-500 px-2 py-1 cursor-pointer"
              aria-label="Langue"
            >
              <option value="fr">FR</option>
              <option value="wo">WO</option>
            </select>

            {isAuthenticated ? (
              <>
                <Link to="/profile" className="hidden sm:inline-flex btn-ghost text-sm py-1.5">
                  {t('nav.profile')}
                </Link>
                <button onClick={handleLogout} className="btn-secondary text-sm py-1.5">
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <>
                <Link to="/login"    className="btn-ghost text-sm py-1.5">{t('auth.login')}</Link>
                <Link to="/register" className="btn-primary text-sm py-1.5">{t('auth.register')}</Link>
              </>
            )}

            {/* Burger mobile */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Menu mobile */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
          <Link to="/search" className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-green-50" onClick={() => setMenuOpen(false)}>
            {t('nav.search')}
          </Link>
          {isAuthenticated && (
            <Link to="/dashboard" className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-green-50" onClick={() => setMenuOpen(false)}>
              {t('nav.dashboard', 'Tableau de bord')}
            </Link>
          )}
          {isAuthenticated && (
            <Link to="/profile" className="block px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-green-50" onClick={() => setMenuOpen(false)}>
              {t('nav.profile')}
            </Link>
          )}
          <div className="pt-2 flex gap-2">
            <select
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="text-xs border border-gray-200 rounded-md text-gray-500 px-2 py-1"
            >
              <option value="fr">FR</option>
              <option value="wo">WO</option>
            </select>
          </div>
        </div>
      )}
    </header>
  );
}
