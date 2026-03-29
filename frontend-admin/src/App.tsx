import { Routes, Route, Navigate } from 'react-router-dom';
import { useAdminAuthStore } from './store/adminAuthStore';
import AdminLayout  from './components/AdminLayout';
import Login        from './pages/Login';
import Dashboard    from './pages/Dashboard';
import Users        from './pages/Users';
import Providers    from './pages/Providers';
import Bookings     from './pages/Bookings';
import Transactions from './pages/Transactions';
import Reviews      from './pages/Reviews';
import Reports      from './pages/Reports';
import Categories   from './pages/Categories';
import Contacts     from './pages/Contacts';

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const user = useAdminAuthStore((s) => s.user);
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (!['admin', 'super_admin'].includes(user.role)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index                element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"    element={<Dashboard />} />
        <Route path="users"        element={<Users />} />
        <Route path="providers"    element={<Providers />} />
        <Route path="bookings"     element={<Bookings />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="reviews"      element={<Reviews />} />
        <Route path="reports"      element={<Reports />} />
        <Route path="contacts"     element={<Contacts />} />
        <Route path="categories"   element={<Categories />} />
        <Route path="*"            element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
