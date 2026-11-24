import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { paginate } from '../../utils/pagination.util';
import { coarseCoordinate, coarseDistanceKm } from '../../utils/serializers';

/**
 * Recherche publique tolérante aux fautes de frappe (lot 4).
 *
 * - Texte : similarité par trigrammes (pg_trgm, déjà installée par la migration initiale),
 *   insensible aux accents et à la casse, sur le titre du service, sa catégorie et le nom
 *   commercial du prestataire ; une sous-chaîne exacte reste toujours trouvée.
 * - Filtres : catégorie (et ses sous-catégories), ville (tolérante), rayon autour d'un point,
 *   note minimale, prix maximal, disponibilité.
 * - Tri : pertinence, note, prix, distance ; pagination et total calculés en base.
 * - Réponse publique : jamais d'e-mail, de téléphone ni d'adresse ; position arrondie.
 */

const ACCENTS_FROM = 'àáâäãåçèéêëìíîïñòóôöõùúûüýÿœæ';
const ACCENTS_TO = 'aaaaaaceeeeiiiinooooouuuuyyoa';

/** Normalisation SQL : minuscules, sans accents. */
const norm = (expr: Prisma.Sql) => Prisma.sql`translate(lower(${expr}), ${ACCENTS_FROM}, ${ACCENTS_TO})`;

/** Même normalisation côté application (requête et tests). */
export function normalizeText(value: string): string {
  let out = value.toLowerCase();
  for (let i = 0; i < ACCENTS_FROM.length; i += 1) out = out.split(ACCENTS_FROM[i]).join(ACCENTS_TO[i]);
  return out.replace(/\s+/g, ' ').trim();
}

/** Seuil de similarité : plus strict pour les mots courts (moins de faux positifs). */
export function similarityThreshold(q: string): number {
  return q.length <= 4 ? 0.5 : q.length <= 7 ? 0.4 : 0.33;
}

export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).regex(/^[a-z0-9-]*$/, 'Catégorie invalide').optional(),
  city: z.string().trim().max(100).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).default(25),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxPrice: z.coerce.number().positive().optional(),
  availableOnly: z.enum(['true', 'false']).optional(),
  sort: z.enum(['relevance', 'rating', 'price_asc', 'price_desc', 'distance']).default('relevance'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: 'lat et lng doivent être fournis ensemble', path: ['lat'] });
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const suggestQuerySchema = z.object({ q: z.string().trim().min(2, 'Saisissez au moins 2 caractères').max(100) });

interface SearchRow {
  id: string; title: string; description: string | null; price_type: string | null; price: Prisma.Decimal | null;
  category_id: string; category_name: string; category_slug: string;
  provider_id: string; first_name: string | null; last_name: string | null; city: string | null; country: string | null;
  avatar_url: string | null; latitude: number | null; longitude: number | null; id_verified: boolean | null;
  is_available: boolean | null; rating_average: Prisma.Decimal | null; rating_count: number | null; business_name: string | null;
  score: number; distance_km: number | null; total: bigint;
}

function distanceSql(lat?: number, lng?: number): Prisma.Sql {
  if (lat === undefined || lng === undefined) return Prisma.sql`NULL::float`;
  return Prisma.sql`(6371.0 * 2.0 * ASIN(SQRT(
    POWER(SIN(RADIANS((p.latitude::float - ${lat}::float) / 2.0)), 2) +
    COS(RADIANS(${lat}::float)) * COS(RADIANS(p.latitude::float)) *
    POWER(SIN(RADIANS((p.longitude::float - ${lng}::float) / 2.0)), 2))))`;
}

export async function runSearch(q: SearchQuery) {
  const text = q.q ? normalizeText(q.q) : '';
  const threshold = similarityThreshold(text);
  const city = q.city ? normalizeText(q.city) : '';
  const titleN = norm(Prisma.sql`s.title`);
  const catN = norm(Prisma.sql`c.name`);
  const bizN = norm(Prisma.sql`coalesce(pp.business_name, '')`);
  const score = text
    ? Prisma.sql`GREATEST(word_similarity(${text}, ${titleN}), word_similarity(${text}, ${catN}), word_similarity(${text}, ${bizN}),
        CASE WHEN ${titleN} LIKE ${`%${text}%`} OR ${catN} LIKE ${`%${text}%`} THEN 1 ELSE 0 END)`
    : Prisma.sql`0`;
  const distance = distanceSql(q.lat, q.lng);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`s.is_active = true`,
    Prisma.sql`u.role = 'provider'`,
    Prisma.sql`u.status = 'active'`,
    Prisma.sql`u.deleted_at IS NULL`,
  ];
  if (q.category) {
    conditions.push(Prisma.sql`(c.slug = ${q.category} OR c.parent_id IN (SELECT id FROM categories WHERE slug = ${q.category}))`);
  }
  if (city) {
    const cityN = norm(Prisma.sql`coalesce(p.city, '')`);
    conditions.push(Prisma.sql`(${cityN} LIKE ${`${city}%`} OR similarity(${cityN}, ${city}) >= 0.45)`);
  }
  if (q.minRating !== undefined) conditions.push(Prisma.sql`coalesce(pp.rating_average, 0) >= ${q.minRating}`);
  if (q.maxPrice !== undefined) conditions.push(Prisma.sql`(s.price IS NULL OR s.price <= ${q.maxPrice})`);
  if (q.availableOnly === 'true') conditions.push(Prisma.sql`coalesce(pp.is_available, false) = true`);
  if (q.lat !== undefined) conditions.push(Prisma.sql`p.latitude IS NOT NULL AND p.longitude IS NOT NULL`);

  const order = {
    relevance: text ? Prisma.sql`score DESC, rating_average DESC NULLS LAST, created_at DESC` : Prisma.sql`rating_average DESC NULLS LAST, created_at DESC`,
    rating: Prisma.sql`rating_average DESC NULLS LAST, rating_count DESC NULLS LAST`,
    price_asc: Prisma.sql`price ASC NULLS LAST`,
    price_desc: Prisma.sql`price DESC NULLS LAST`,
    distance: q.lat !== undefined ? Prisma.sql`distance_km ASC NULLS LAST` : Prisma.sql`created_at DESC`,
  }[q.sort];

  const rows = await prisma.$queryRaw<SearchRow[]>`
    WITH base AS (
      SELECT s.id, s.title, s.description, s.price_type, s.price, s.created_at,
             c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
             u.id AS provider_id, p.first_name, p.last_name, p.city, p.country, p.avatar_url,
             p.latitude::float AS latitude, p.longitude::float AS longitude, p.id_verified,
             pp.is_available, pp.rating_average, pp.rating_count, pp.business_name,
             (${score})::float AS score,
             (${distance})::float AS distance_km
      FROM provider_services s
      JOIN categories c ON c.id = s.category_id
      JOIN users u ON u.id = s.provider_id
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN provider_profiles pp ON pp.user_id = u.id
      WHERE ${Prisma.join(conditions, ' AND ')}
    )
    SELECT *, count(*) OVER () AS total
    FROM base
    WHERE (${text} = '' OR score >= ${threshold})
      AND (${q.lat === undefined} OR distance_km <= ${q.radiusKm})
    ORDER BY ${order}
    LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;

  const total = rows.length ? Number(rows[0].total) : 0;
  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    priceType: r.price_type,
    price: r.price !== null ? Number(r.price) : null,
    category: { id: r.category_id, name: r.category_name, slug: r.category_slug },
    provider: {
      id: r.provider_id,
      firstName: r.first_name,
      lastName: r.last_name,
      businessName: r.business_name,
      city: r.city,
      country: r.country,
      avatarUrl: r.avatar_url,
      latitude: coarseCoordinate(r.latitude),
      longitude: coarseCoordinate(r.longitude),
      idVerified: Boolean(r.id_verified),
      isAvailable: Boolean(r.is_available),
      ratingAverage: r.rating_average !== null ? Number(r.rating_average) : 0,
      ratingCount: r.rating_count ?? 0,
    },
    distanceKm: coarseDistanceKm(r.distance_km),
    relevance: text ? Math.round(r.score * 100) / 100 : null,
  }));
  return { items, total };
}

/** Suggestion « Vouliez-vous dire » : libellé de service ou de catégorie le plus proche. */
async function didYouMean(text: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ label: string; sim: number }>>`
    SELECT label, sim FROM (
      SELECT c.name AS label, similarity(${norm(Prisma.sql`c.name`)}, ${text})::float AS sim FROM categories c WHERE c.is_active = true
      UNION ALL
      SELECT DISTINCT s.title AS label, similarity(${norm(Prisma.sql`s.title`)}, ${text})::float AS sim FROM provider_services s WHERE s.is_active = true
    ) t
    WHERE sim >= 0.2
    ORDER BY sim DESC
    LIMIT 1`;
  return rows[0] && normalizeText(rows[0].label) !== text ? rows[0].label : null;
}

export const searchController = {
  /** GET /search — recherche publique de services */
  async search(req: Request, res: Response) {
    const q = req.query as unknown as SearchQuery;
    try {
      const { items, total } = await runSearch(q);
      const suggestion = q.q && total === 0 ? await didYouMean(normalizeText(q.q)) : null;
      res.set('Cache-Control', 'public, max-age=30');
      return res.json({ ...paginate(items, total, { page: q.page, limit: q.limit }), didYouMean: suggestion });
    } catch (err) {
      logger.error('Recherche indisponible', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Recherche momentanément indisponible' });
    }
  },

  /** GET /search/suggest?q= — catégories, services et villes proches de la saisie */
  async suggest(req: Request, res: Response) {
    const text = normalizeText(String(req.query.q ?? ''));
    const threshold = similarityThreshold(text);
    const like = `%${text}%`;
    try {
      const [categories, services, cities] = await Promise.all([
        prisma.$queryRaw<Array<{ name: string; slug: string; score: number }>>`
          SELECT c.name, c.slug, GREATEST(word_similarity(${text}, ${norm(Prisma.sql`c.name`)}),
                 CASE WHEN ${norm(Prisma.sql`c.name`)} LIKE ${like} THEN 1 ELSE 0 END)::float AS score
          FROM categories c WHERE c.is_active = true
          ORDER BY score DESC LIMIT 5`,
        prisma.$queryRaw<Array<{ title: string; providers: number; score: number }>>`
          SELECT min(s.title) AS title, count(DISTINCT s.provider_id)::int AS providers,
                 max(GREATEST(word_similarity(${text}, ${norm(Prisma.sql`s.title`)}),
                     CASE WHEN ${norm(Prisma.sql`s.title`)} LIKE ${like} THEN 1 ELSE 0 END))::float AS score
          FROM provider_services s JOIN users u ON u.id = s.provider_id
          WHERE s.is_active = true AND u.status = 'active' AND u.deleted_at IS NULL
          GROUP BY ${norm(Prisma.sql`s.title`)}
          ORDER BY score DESC LIMIT 5`,
        prisma.$queryRaw<Array<{ city: string; providers: number; score: number }>>`
          SELECT min(p.city) AS city, count(DISTINCT p.user_id)::int AS providers,
                 max(GREATEST(similarity(${norm(Prisma.sql`p.city`)}, ${text}),
                     CASE WHEN ${norm(Prisma.sql`p.city`)} LIKE ${`${text}%`} THEN 1 ELSE 0 END))::float AS score
          FROM profiles p JOIN users u ON u.id = p.user_id
          WHERE u.role = 'provider' AND u.status = 'active' AND u.deleted_at IS NULL AND p.city IS NOT NULL AND p.city <> ''
          GROUP BY ${norm(Prisma.sql`p.city`)}
          ORDER BY score DESC LIMIT 5`,
      ]);
      res.set('Cache-Control', 'public, max-age=60');
      return res.json({
        categories: categories.filter((c) => c.score >= threshold).map(({ name, slug }) => ({ name, slug })),
        services: services.filter((s) => s.score >= threshold).map(({ title, providers }) => ({ title, providers })),
        cities: cities.filter((c) => c.score >= 0.45).map(({ city, providers }) => ({ city, providers })),
      });
    } catch (err) {
      logger.error('Suggestions indisponibles', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Suggestions momentanément indisponibles' });
    }
  },

  /**
   * GET /providers/:id/similar — recommandations : prestataires actifs qui proposent les mêmes
   * catégories, de préférence dans la même ville, classés par note et missions réalisées.
   */
  async similarProviders(req: Request, res: Response) {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: 'Prestataire introuvable' });
    try {
      const rows = await prisma.$queryRaw<Array<{
        id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; city: string | null;
        business_name: string | null; rating_average: Prisma.Decimal | null; rating_count: number | null; same_city: boolean; shared: number;
      }>>`
        WITH target AS (
          SELECT max(p.city) AS city FROM profiles p WHERE p.user_id = ${id}::uuid
        )
        SELECT u.id, p.first_name, p.last_name, p.avatar_url, p.city, pp.business_name, pp.rating_average, pp.rating_count,
               (${norm(Prisma.sql`coalesce(p.city, '')`)} = ${norm(Prisma.sql`coalesce((SELECT city FROM target), '')`)}) AS same_city,
               count(DISTINCT s.category_id)::int AS shared
        FROM users u
        JOIN provider_services s ON s.provider_id = u.id AND s.is_active = true
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN provider_profiles pp ON pp.user_id = u.id
        WHERE u.role = 'provider' AND u.status = 'active' AND u.deleted_at IS NULL AND u.id <> ${id}::uuid
          AND s.category_id IN (SELECT ts.category_id FROM provider_services ts WHERE ts.provider_id = ${id}::uuid AND ts.is_active = true)
        GROUP BY u.id, p.first_name, p.last_name, p.avatar_url, p.city, pp.business_name, pp.rating_average, pp.rating_count, pp.completed_jobs
        ORDER BY same_city DESC, shared DESC, pp.rating_average DESC NULLS LAST, pp.completed_jobs DESC NULLS LAST
        LIMIT 4`;
      res.set('Cache-Control', 'public, max-age=300');
      return res.json({
        items: rows.map((r) => ({
          id: r.id,
          firstName: r.first_name,
          lastName: r.last_name,
          businessName: r.business_name,
          avatarUrl: r.avatar_url,
          city: r.city,
          ratingAverage: r.rating_average !== null ? Number(r.rating_average) : 0,
          ratingCount: r.rating_count ?? 0,
          sameCity: r.same_city,
        })),
      });
    } catch (err) {
      logger.error('Recommandations indisponibles', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ error: 'Recommandations momentanément indisponibles' });
    }
  },
};
