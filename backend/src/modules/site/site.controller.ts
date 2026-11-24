/**
 * Données publiques du site, calculées UNIQUEMENT à partir de la base.
 * Aucun chiffre n'est inventé : un indicateur sous son seuil n'est pas renvoyé
 * et le site masque alors la section correspondante.
 */
import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { logger } from '../../config/logger';
import { env } from '../../config/env';

/** Seuils d'affichage : en dessous, l'indicateur est masqué plutôt qu'affiché faible. */
export const PUBLIC_STATS_THRESHOLDS = {
  verifiedProviders: 10,
  completedMissions: 10,
  /** Nombre minimal d'avis approuvés pour afficher une note moyenne. */
  ratedReviews: 5,
} as const;

export const TESTIMONIALS_LIMIT = 3;
const TESTIMONIAL_MIN_RATING = 4;
const TESTIMONIAL_MIN_LENGTH = 20;
const TESTIMONIAL_MAX_LENGTH = 300;
const CACHE_TTL_SECONDS = 300;

export type PublicStat =
  | { key: 'verified_providers'; value: number }
  | { key: 'completed_missions'; value: number }
  | { key: 'average_rating'; value: number; count: number };

/** Lecture/écriture du cache sans jamais faire échouer la requête (Redis indisponible = calcul direct). */
async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn('Cache site indisponible (lecture)', { key, error: err instanceof Error ? err.message : String(err) });
  }
  const value = await compute();
  try {
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch (err) {
    logger.warn('Cache site indisponible (écriture)', { key, error: err instanceof Error ? err.message : String(err) });
  }
  return value;
}

export async function computePublicStats(): Promise<PublicStat[]> {
  const [verifiedProviders, completedMissions, rating] = await Promise.all([
    prisma.user.count({
      where: { role: 'provider', status: 'active', deletedAt: null, profile: { is: { idVerified: true } } },
    }),
    prisma.booking.count({ where: { status: { in: ['completed', 'validated'] } } }),
    prisma.review.aggregate({ where: { isApproved: true }, _avg: { rating: true }, _count: { _all: true } }),
  ]);

  const stats: PublicStat[] = [];
  if (verifiedProviders >= PUBLIC_STATS_THRESHOLDS.verifiedProviders) {
    stats.push({ key: 'verified_providers', value: verifiedProviders });
  }
  if (completedMissions >= PUBLIC_STATS_THRESHOLDS.completedMissions) {
    stats.push({ key: 'completed_missions', value: completedMissions });
  }
  const ratedCount = rating._count._all;
  if (ratedCount >= PUBLIC_STATS_THRESHOLDS.ratedReviews && rating._avg.rating !== null) {
    stats.push({ key: 'average_rating', value: Math.round(rating._avg.rating * 10) / 10, count: ratedCount });
  }
  return stats;
}

export interface Testimonial {
  id: string;
  rating: number;
  comment: string;
  authorName: string;
  city: string | null;
  createdAt: Date | string;
}

/** « Aminata Diallo » → « Aminata D. » : pas de nom complet sur la page d'accueil. */
export function shortName(firstName?: string | null, lastName?: string | null, fallback = 'Client vérifié'): string {
  const first = (firstName ?? '').trim();
  const initial = (lastName ?? '').trim().charAt(0).toUpperCase();
  if (!first) return fallback;
  return initial ? `${first} ${initial}.` : first;
}

export async function computeTestimonials(): Promise<Testimonial[]> {
  const rows = await prisma.review.findMany({
    where: {
      isApproved: true,
      isFlagged: false,
      rating: { gte: TESTIMONIAL_MIN_RATING },
      comment: { not: null },
      reviewer: { status: 'active', deletedAt: null },
    },
    orderBy: { approvedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      reviewer: { select: { profile: { select: { firstName: true, lastName: true, city: true } } } },
    },
  });

  return rows
    .map((r) => ({ ...r, comment: (r.comment ?? '').trim() }))
    .filter((r) => r.comment.length >= TESTIMONIAL_MIN_LENGTH)
    .slice(0, TESTIMONIALS_LIMIT)
    .map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment.length > TESTIMONIAL_MAX_LENGTH ? `${r.comment.slice(0, TESTIMONIAL_MAX_LENGTH - 1)}…` : r.comment,
      authorName: shortName(r.reviewer.profile?.firstName, r.reviewer.profile?.lastName),
      city: r.reviewer.profile?.city ?? null,
      createdAt: r.createdAt,
    }));
}

/**
 * Capacités publiques du site : uniquement des booléens, jamais de valeur de configuration.
 * Le paiement en ligne n'est annoncé que si CinetPay est réellement configuré
 * (hors production, la simulation de développement est signalée comme telle).
 */
export function publicCapabilities() {
  const cinetpay = Boolean(env.CINETPAY_API_KEY && env.CINETPAY_SITE_ID);
  const simulated = !cinetpay && env.NODE_ENV !== 'production';
  return {
    onlinePayment: {
      available: cinetpay || simulated,
      provider: cinetpay ? 'cinetpay' : null,
      simulated,
    },
  };
}

export const siteController = {
  /** GET /site/config — capacités publiques (paiement en ligne disponible ou non) */
  config(_req: Request, res: Response) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(publicCapabilities());
  },

  /** GET /site/stats — indicateurs réels au-dessus de leur seuil (liste vide = section masquée) */
  async stats(_req: Request, res: Response) {
    try {
      const items = await cached('site:stats:v1', computePublicStats);
      res.set('Cache-Control', 'public, max-age=300');
      return res.json({ items });
    } catch (err) {
      logger.error('Statistiques publiques indisponibles', { error: err instanceof Error ? err.message : String(err) });
      return res.status(503).json({ error: 'Statistiques indisponibles' });
    }
  },

  /** GET /site/testimonials — avis réels approuvés (liste vide = section masquée) */
  async testimonials(_req: Request, res: Response) {
    try {
      const items = await cached('site:testimonials:v1', computeTestimonials);
      res.set('Cache-Control', 'public, max-age=300');
      return res.json({ items });
    } catch (err) {
      logger.error('Témoignages indisponibles', { error: err instanceof Error ? err.message : String(err) });
      return res.status(503).json({ error: 'Témoignages indisponibles' });
    }
  },
};
