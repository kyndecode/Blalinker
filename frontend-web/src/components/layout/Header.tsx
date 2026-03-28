import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';

export default function Header() {
  const { t, i18n }    = useTranslation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate       = useNavigate();

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignorer */ }
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-primary-600">
            <span className="text-2xl" aria-hidden="true">🔧</span>
            <span>BLA</span>
          </Link>

          {/* Navigation centrale */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <Link to="/search" className="hover:text-primary-600 transition-colors">
              {t('nav.search')}
            </Link>
            {isAuthenticated && (
              <Link to="/bookings" className="hover:text-primary-600 transition-colors">
                {t('nav.bookings')}
              </Link>
            )}
            {user && ['admin', 'super_admin'].includes(user.role) && (
              <Link to="/admin" className="hover:text-primary-600 transition-colors">
                Admin
              </Link>
            )}
          </nav>

          {/* Actions droite */}
          <div className="flex items-center gap-3">
            {/* Sélecteur de langue */}
            <select
              value={i18n.language}
              onChange={(e) => {
                i18n.changeLanguage(e.target.value);
                localStorage.setItem('bla_lang', e.target.value);
              }}
              className="text-xs border-none bg-transparent text-gray-500 cursor-pointer"
              aria-label="Langue"
            >
              <option value="fr">FR</option>
              <option value="wo">WO</option>
            </select>

            {isAuthenticated ? (
              <>
                <Link to="/profile" className="btn-ghost text-sm py-1.5">
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
          </div>
        </div>
      </div>
    </header>
  );
}
