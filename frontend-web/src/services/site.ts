import api from './api';

/** Indicateur réel renvoyé par l'API (absent s'il est sous son seuil d'affichage). */
export type PublicStat =
  | { key: 'verified_providers'; value: number }
  | { key: 'completed_missions'; value: number }
  | { key: 'average_rating'; value: number; count: number };

/** Avis réel approuvé par la modération. */
export interface Testimonial {
  id: string;
  rating: number;
  comment: string;
  authorName: string;
  city: string | null;
  createdAt: string;
}

const KNOWN_STATS = new Set(['verified_providers', 'completed_missions', 'average_rating']);

export async function fetchSiteStats(): Promise<PublicStat[]> {
  const { data } = await api.get('/site/stats');
  const items: unknown = data?.items;
  return Array.isArray(items)
    ? (items as PublicStat[]).filter((s) => KNOWN_STATS.has(s?.key) && Number.isFinite(Number(s?.value)))
    : [];
}

export async function fetchTestimonials(): Promise<Testimonial[]> {
  const { data } = await api.get('/site/testimonials');
  const items: unknown = data?.items;
  return Array.isArray(items)
    ? (items as Testimonial[]).filter((t) => typeof t?.comment === 'string' && t.comment.trim().length > 0)
    : [];
}

/** Capacités publiques du site (aucune valeur de configuration, uniquement des booléens). */
export interface SiteConfig {
  onlinePayment: { available: boolean; provider: string | null; simulated: boolean };
}

const OFFLINE_CONFIG: SiteConfig = { onlinePayment: { available: false, provider: null, simulated: false } };

/** En cas d'erreur, le paiement en ligne est considéré comme indisponible (jamais annoncé à tort). */
export async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const { data } = await api.get('/site/config');
    const online = data?.onlinePayment;
    return {
      onlinePayment: {
        available: online?.available === true,
        provider: typeof online?.provider === 'string' ? online.provider : null,
        simulated: online?.simulated === true,
      },
    };
  } catch {
    return OFFLINE_CONFIG;
  }
}
