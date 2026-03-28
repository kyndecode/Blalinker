import { Routes, Route, Navigate } from 'react-router-dom';
import { useAdminAuthStore } from './store/adminAuthStore';
import AdminLayout from './components/AdminLayout';
import Login      from './pages/Login';
import Dashboard  from './pages/Dashboard';
import Users      from './pages/Users';

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const user = useAdminAuthStore((s) => s.user);

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  if (!['admin', 'super_admin'].includes(user.role)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={
        <RequireAdmin><AdminLayout /></RequireAdmin>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"    element={<Dashboard />} />
        <Route path="users"        element={<Users />} />
        {/* Autres pages admin à venir */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
