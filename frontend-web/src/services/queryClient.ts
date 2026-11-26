import { QueryClient } from '@tanstack/react-query';

/**
 * Cache des requêtes, partagé par l'application. Exporté pour pouvoir être vidé à la
 * déconnexion : aucune donnée privée (profil, réservations, notifications) ne doit rester
 * affichable après la fin de la session.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:  5 * 60 * 1000,  // 5 minutes
      gcTime:     30 * 60 * 1000, // 30 minutes
      retry:      (failureCount, _error) => {
        if (!navigator.onLine) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
  },
});
