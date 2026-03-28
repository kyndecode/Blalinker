import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const fr = {
  search: { title: 'Rechercher', no_results: 'Aucun prestataire trouvé.', loading: 'Recherche...' },
  provider: { available: 'Disponible', unavailable: 'Indisponible', book: 'Réserver' },
  auth: { login: 'Se connecter', register: 'Créer un compte', otp_title: 'Vérification', otp_sent: 'Code envoyé par SMS', verify: 'Vérifier' },
  errors: { network: 'Problème de connexion.', server: 'Erreur serveur.' },
  offline: 'Mode hors-ligne. Données possiblement obsolètes.',
};

i18n.use(initReactI18next).init({
  resources:  { fr: { translation: fr } },
  lng:        'fr',
  fallbackLng:'fr',
  interpolation: { escapeValue: false },
});

export default i18n;
