import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import api from '../../services/api';
import Logo from '../common/Logo';

const LANGUAGES = [
  { code: 'fr', shortLabel: 'FR', label: 'Francais' },
  { code: 'en', shortLabel: 'EN', label: 'English' },
];

function useClickOutside(ref: React.RefObject<HTMLElement>, cb: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, cb]);
}

export default function Header() {
  const { t, i18n }    = useTranslation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { isDark, toggle: toggleTheme }   = useThemeStore();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [query, setQuery]       = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null!);
  const searchRef   = useRef<HTMLDivElement>(null!);

  useClickOutside(userMenuRef, () => setUserMenu(false));
  useClickOutside(searchRef,   () => setSearchOpen(false));

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    logout();
    navigate('/login');
    setUserMenu(false);
    setMenuOpen(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    setSearchOpen(false);
    setQuery('');
  };

  const changeLang = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('bla_lang', code);
  };
  const languageCode = (i18n.resolvedLanguage || i18n.language || 'fr').split('-')[0];

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const navLinks = [
    { to: '/',        label: t('nav.home')   },
    { to: '/search',  label: t('nav.search') },
    { to: '/about',   label: t('nav.about') },
    { to: '/contact', label: t('nav.contact') },
    ...(isAuthenticated ? [{ to: '/dashboard', label: t('nav.dashboard') }] : []),
  ];

  const firstName =
    (user?.email ? user.email.split('@')[0] : null) ??
    (user?.phone ?? t('nav.my_account'));

  const initial = (user?.email || user?.phone || 'U').slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-50 bg-[#1a2744] shadow-lg transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo */}
          <Link to="/" className="flex-shrink-0" onClick={() => setMenuOpen(false)}>
            <Logo size="sm" variant="white" />
          </Link>

          {/* Navigation â€” Desktop */}
          <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.to)
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions â€” Desktop */}
          <div className="hidden lg:flex items-center gap-2">

            {/* Recherche rapide */}
            <div className="relative" ref={searchRef}>
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={t('search.title')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              {searchOpen && (
                <form onSubmit={handleSearch} className="absolute right-0 top-11 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-3 flex gap-2">
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('search.placeholder')}
                    className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button type="submit" className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">{t('common.ok')}</button>
                </form>
              )}
            </div>

            {/* Dark mode */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label={isDark ? t('theme.light') : t('theme.dark')}
            >
              {isDark
                ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
              }
            </button>

            {/* Langue */}
            <select
              value={languageCode}
              onChange={(e) => changeLang(e.target.value)}
              className="text-xs border border-white/20 rounded-lg bg-white/10 text-white/80 px-2 py-1.5 cursor-pointer focus:outline-none"
              aria-label={t('common.language')}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="text-gray-900 bg-white">
                  {l.shortLabel} - {l.label}
                </option>
              ))}
            </select>

            {/* Auth */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {/* Avatar + nom */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenu(!userMenu)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {initial}
                    </div>
                    <span className="text-sm font-medium text-white/90 max-w-[100px] truncate">{firstName}</span>
                    <svg className={`w-4 h-4 text-white/50 transition-transform ${userMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {userMenu && (
                    <div className="absolute right-0 top-12 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl py-1.5 z-50">
                      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('auth.logged_as')}</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.email || user?.phone}</p>
                      </div>
                      <Link to="/dashboard" onClick={() => setUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-500/10 hover:text-green-700 dark:hover:text-green-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18"/></svg>
                        {t('nav.dashboard')}
                      </Link>
                      <Link to="/profile" onClick={() => setUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-500/10 hover:text-green-700 dark:hover:text-green-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        {t('nav.profile')}
                      </Link>
                      <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
                        <button onClick={handleLogout} className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                          {t('nav.logout')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bouton DÃ©connexion visible */}
                <button
                  onClick={handleLogout}
                  className="px-4 py-1.5 rounded-lg border border-white/30 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  {t('nav.logout')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="px-4 py-1.5 text-sm font-medium text-white/80 hover:text-white transition-colors">
                  {t('auth.login')}
                </Link>
                <Link to="/register" className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                  {t('auth.register')}
                </Link>
              </div>
            )}
          </div>

          {/* Mobile â€” droite */}
          <div className="flex lg:hidden items-center gap-2">
            {isAuthenticated && (
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-sm font-bold">
                {initial}
              </div>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
            >
              {isDark
                ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
              }
            </button>
            <button
              className="p-2 rounded-lg text-white/70 hover:bg-white/10"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={t('common.menu')}
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
        <div className="lg:hidden border-t border-white/10 bg-[#1a2744] px-4 py-3 space-y-1">
          {/* Recherche mobile */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="flex-1 px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button type="submit" className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg">
              {t('home.search_btn')}
            </button>
          </form>

          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.to)
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}

          {isAuthenticated ? (
            <>
              <Link to="/profile" onClick={() => setMenuOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white">{t('nav.profile')}</Link>
              <button onClick={handleLogout} className="block w-full text-left px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10">{t('nav.logout')}</button>
            </>
          ) : (
            <div className="flex gap-2 pt-2">
              <Link to="/login"    onClick={() => setMenuOpen(false)} className="flex-1 text-center py-2 border border-white/20 rounded-lg text-sm font-medium text-white/80">{t('auth.login')}</Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} className="flex-1 text-center py-2 bg-green-600 text-white rounded-lg text-sm font-semibold">{t('auth.register')}</Link>
            </div>
          )}

          {/* Langue mobile */}
          <div className="flex gap-2 pt-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => changeLang(l.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  languageCode === l.code ? 'bg-green-600 text-white' : 'bg-white/10 text-white/60'
                }`}
              >
                {l.shortLabel}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

