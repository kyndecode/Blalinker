import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import i18next from 'i18next';

const tr = (key: string, fallback: string) => {
  const value = i18next.isInitialized ? i18next.t(key) : '';
  return value && value !== key ? value : fallback;
};

/** Filet de sécurité générique (aussi utilisé autour de toute l’application, sans réinitialisation). */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Trace pour le diagnostic, sans rien montrer de technique à l'utilisateur.
    console.error('Affichage de la page interrompu', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{tr('errors.page_title', 'Cette page n’a pas pu s’afficher')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">{tr('errors.page_text', 'Une erreur inattendue est survenue. Rechargez la page ; si le problème continue, revenez à l’accueil.')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="btn-primary">{tr('errors.page_reload', 'Recharger la page')}</button>
          <a href="/" className="btn-secondary">{tr('content_page.back_home', 'Retour à l’accueil')}</a>
        </div>
      </div>
    );
  }
}

/**
 * Filet de sécurité de chaque page : une erreur d'affichage (donnée inattendue de l'API…) montre
 * un message et des issues claires au lieu d'une page blanche (avant : la carte des prestataires
 * était entièrement vide). Réinitialisé à chaque changement de page.
 */
export default function PageErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <AppErrorBoundary key={pathname}>{children}</AppErrorBoundary>;
}
