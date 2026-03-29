import { type ReactNode, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useTranslation } from 'react-i18next';
import api from './services/api';

// Layout
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';

// Pages publiques
import Home      from './pages/Home/Home';
import Contact   from './pages/Contact/Contact';
import AboutPage from './pages/About/AboutPage';
import FaqPage   from './pages/Help/FaqPage';
import LegalNoticePage from './pages/Legal/LegalNoticePage';
import PrivacyPage from './pages/Legal/PrivacyPage';
import TermsPage from './pages/Legal/TermsPage';
import Login     from './pages/Auth/Login';
import Register  from './pages/Auth/Register';
import VerifyOTP from './pages/Auth/VerifyOTP';

// Pages authentifiées
import Dashboard       from './pages/Dashboard/Dashboard';
import SearchPage      from './pages/Search/SearchPage';
import ProviderProfile from './pages/ProviderProfile/ProviderProfile';
import BookingsList    from './pages/Booking/BookingsList';
import BookingNew      from './pages/Booking/BookingNew';
import BookingDetail   from './pages/Booking/BookingDetail';
import ProfilePage     from './pages/Profile/ProfilePage';

function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const isOnline = useNetworkStatus();
  const { t }    = useTranslation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const setTokens = useAuthStore((state) => state.setTokens);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      if (accessToken || !refreshToken) {
        if (!cancelled) setAuthReady(true);
        return;
      }

      try {
        const refreshed = await api.post('/auth/refresh-token', { refreshToken });
        setTokens(refreshed.data.accessToken, refreshed.data.refreshToken);

        const me = await api.get('/users/me');
        setUser({
          id: me.data.id,
          role: me.data.role,
          email: me.data.email || undefined,
          phone: me.data.phone || undefined,
        });
      } catch {
        logout();
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    };

    bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshToken, setTokens, setUser, logout]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <p className="text-sm text-gray-500 dark:text-gray-400">Chargement de votre session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 transition-colors duration-200">
      {/* Bannière hors-ligne */}
      {!isOnline && (
        <div className="offline-banner" role="alert" aria-live="assertive">
          📡 {t('offline')}
        </div>
      )}

      <Header />

      <main className={`flex-1 ${!isOnline ? 'mt-10' : ''}`}>
        <Routes>
          {/* Publiques */}
          <Route path="/"             element={<Home />} />
          <Route path="/login"        element={<Login />} />
          <Route path="/register"     element={<Register />} />
          <Route path="/verify"       element={<VerifyOTP />} />
          <Route path="/contact"      element={<Contact />} />
          <Route path="/about"        element={<AboutPage />} />
          <Route path="/help"         element={<FaqPage />} />
          <Route path="/legal-notice" element={<LegalNoticePage />} />
          <Route path="/privacy"      element={<PrivacyPage />} />
          <Route path="/terms"        element={<TermsPage />} />
          <Route path="/search"       element={<SearchPage />} />
          <Route path="/provider/:id" element={<ProviderProfile />} />

          {/* Authentifiées */}
          <Route path="/dashboard"    element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/bookings"     element={<RequireAuth><BookingsList /></RequireAuth>} />
          <Route path="/bookings/new" element={<RequireAuth><BookingNew /></RequireAuth>} />
          <Route path="/bookings/:id" element={<RequireAuth><BookingDetail /></RequireAuth>} />
          <Route path="/profile"      element={<RequireAuth><ProfilePage /></RequireAuth>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}
