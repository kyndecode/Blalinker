import { type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useTranslation } from 'react-i18next';

// Layout
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';

// Pages publiques
import Home      from './pages/Home/Home';
import Contact   from './pages/Contact/Contact';
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
