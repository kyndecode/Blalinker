import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useTranslation } from 'react-i18next';

// Layout
import Header from './components/layout/Header';

// Pages publiques
import Home     from './pages/Home/Home';
import Login    from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import VerifyOTP from './pages/Auth/VerifyOTP';

// Pages authentifiées
import Dashboard       from './pages/Dashboard/Dashboard';
import SearchPage      from './pages/Search/SearchPage';
import ProviderProfile from './pages/ProviderProfile/ProviderProfile';
import BookingNew      from './pages/Booking/BookingNew';
import BookingDetail   from './pages/Booking/BookingDetail';
import ProfilePage     from './pages/Profile/ProfilePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const isOnline = useNetworkStatus();
  const { t }    = useTranslation();

  return (
    <>
      {/* Bannière hors-ligne */}
      {!isOnline && (
        <div className="offline-banner" role="alert" aria-live="assertive">
          {t('offline')}
        </div>
      )}

      <Header />

      <main className={!isOnline ? 'mt-10' : ''}>
        <Routes>
          {/* Publiques */}
          <Route path="/"          element={<Home />} />
          <Route path="/login"     element={<Login />} />
          <Route path="/register"  element={<Register />} />
          <Route path="/verify"    element={<VerifyOTP />} />
          <Route path="/search"    element={<SearchPage />} />
          <Route path="/provider/:id" element={<ProviderProfile />} />

          {/* Authentifiées */}
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/bookings/new"  element={<RequireAuth><BookingNew /></RequireAuth>} />
          <Route path="/bookings/:id"  element={<RequireAuth><BookingDetail /></RequireAuth>} />
          <Route path="/profile"       element={<RequireAuth><ProfilePage /></RequireAuth>} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
