import { type ReactNode, lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useTranslation } from 'react-i18next';
import api from './services/api';

// Layout (chargé immédiatement — présent sur toutes les pages)
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';

// Pages — chargées à la demande (code-splitting) pour alléger le bundle initial.
const Home            = lazy(() => import('./pages/Home/Home'));
const Contact         = lazy(() => import('./pages/Contact/Contact'));
const AboutPage       = lazy(() => import('./pages/About/AboutPage'));
const FaqPage         = lazy(() => import('./pages/Help/FaqPage'));
const LegalNoticePage = lazy(() => import('./pages/Legal/LegalNoticePage'));
const PrivacyPage     = lazy(() => import('./pages/Legal/PrivacyPage'));
const TermsPage       = lazy(() => import('./pages/Legal/TermsPage'));
const Login           = lazy(() => import('./pages/Auth/Login'));
const Register        = lazy(() => import('./pages/Auth/Register'));
const VerifyOTP       = lazy(() => import('./pages/Auth/VerifyOTP'));
const ForgotPassword  = lazy(() => import('./pages/Auth/ForgotPassword'));

const Dashboard       = lazy(() => import('./pages/Dashboard/Dashboard'));
const SearchPage      = lazy(() => import('./pages/Search/SearchPage'));
const ProviderProfile = lazy(() => import('./pages/ProviderProfile/ProviderProfile'));
const BookingsList    = lazy(() => import('./pages/Booking/BookingsList'));
const BookingNew      = lazy(() => import('./pages/Booking/BookingNew'));
const BookingDetail   = lazy(() => import('./pages/Booking/BookingDetail'));
const ProfilePage     = lazy(() => import('./pages/Profile/ProfilePage'));
const NotFound        = lazy(() => import('./pages/NotFound/NotFound'));

function PageFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" aria-label="Chargement" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const isOnline = useNetworkStatus();
  const { t }    = useTranslation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const setTokens = useAuthStore((state) => state.setTokens);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      // Déjà un access token en mémoire, ou jamais connecté → rien à restaurer.
      if (accessToken || !user) {
        if (!cancelled) setAuthReady(true);
        return;
      }

      // Une session a existé (user persisté) : on tente de la restaurer via le
      // cookie HttpOnly du refresh token (envoyé automatiquement par withCredentials).
      try {
        const refreshed = await api.post('/auth/refresh-token', {});
        setTokens(refreshed.data.accessToken);

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
  }, [accessToken, user, setTokens, setUser, logout]);

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
        <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Publiques */}
          <Route path="/"             element={<Home />} />
          <Route path="/login"        element={<Login />} />
          <Route path="/register"     element={<Register />} />
          <Route path="/verify"       element={<VerifyOTP />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ForgotPassword />} />
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

          {/* 404 — affiche une vraie page plutôt qu'une redirection silencieuse */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
