import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * Route privée : sans session active (jeton d'accès en mémoire), redirection vers la
 * connexion en mémorisant la page demandée. La protection réelle reste côté API : chaque
 * route privée exige un jeton valide, non révoqué, d'un compte actif.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}
