import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { paginate, getSkip } from '../../utils/pagination.util';
import type { SearchInput } from './providers.schemas';

export const providersController = {
  /** GET /providers/search — Recherche géolocalisée */
  async search(req: Request, res: Response) {
    try {
      const q = req.query as unknown as SearchInput;
      const skip   = getSkip({ page: q.page, limit: q.limit });
      const radius = q.radius * 1000; // km → mètres

      // Requête SQL avec PostGIS pour la géolocalisation
      const providers = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          u.id,
          p.first_name     AS "firstName",
          p.last_name      AS "lastName",
          p.avatar_url     AS "avatarUrl",
          p.city,
          p.id_verified    AS "idVerified",
          pp.rating_average AS "ratingAverage",
          pp.rating_count  AS "ratingCount",
          pp.hourly_rate   AS "hourlyRate",
          pp.is_available  AS "isAvailable",
          pp.completed_jobs AS "completedJobs",
          pp.is_premium    AS "isPremium",
          ROUND(
            ST_Distance(
              ST_SetSRID(ST_MakePoint(p.longitude::float, p.latitude::float), 4326)::geography,
              ST_SetSRID(ST_MakePoint(${q.lng}::float, ${q.lat}::float), 4326)::geography
            ) / 1000, 1
          ) AS "distanceKm",
          json_agg(DISTINCT c.name) AS categories
        FROM users u
        JOIN profiles p          ON p.user_id = u.id
        JOIN provider_profiles pp ON pp.user_id = u.id
        JOIN provider_services ps ON ps.provider_id = u.id
        JOIN categories c         ON c.id = ps.category_id
        WHERE u.role = 'provider'
          AND u.status = 'active'
          AND u.deleted_at IS NULL
          AND p.id_verified = true
          AND pp.rating_average >= ${q.min_rating}
          AND (${q.available_only} = false OR pp.is_available = true)
          AND (${q.category_id ?? null}::uuid IS NULL OR ps.category_id = ${q.category_id ?? null}::uuid)
          AND p.latitude  IS NOT NULL
          AND p.longitude IS NOT NULL
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(p.longitude::float, p.latitude::float), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${q.lng}::float, ${q.lat}::float), 4326)::geography,
            ${radius}
          )
        GROUP BY
          u.id, p.first_name, p.last_name, p.avatar_url, p.city,
          p.id_verified, pp.rating_average, pp.rating_count, pp.hourly_rate,
          pp.is_available, pp.completed_jobs, pp.is_premium,
          p.longitude, p.latitude
        ORDER BY pp.rating_average DESC, "distanceKm" ASC
        LIMIT ${q.limit} OFFSET ${skip}
      `;

      const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT u.id) AS count
        FROM users u
        JOIN profiles p          ON p.user_id = u.id
        JOIN provider_profiles pp ON pp.user_id = u.id
        JOIN provider_services ps ON ps.provider_id = u.id
        WHERE u.role = 'provider'
          AND u.status = 'active'
          AND p.id_verified = true
          AND p.latitude IS NOT NULL
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(p.longitude::float, p.latitude::float), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${q.lng}::float, ${q.lat}::float), 4326)::geography,
            ${radius}
          )
      `;

      const total = Number(countResult[0]?.count ?? 0);
      res.json(paginate(providers, total, { page: q.page, limit: q.limit }));
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: 'Erreur de recherche' });
    }
  },

  /** GET /providers/:id — Profil public */
  async getProfile(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const provider = await prisma.user.findFirst({
        where: { id, role: 'provider', status: 'active', deletedAt: null },
        include: {
          profile: {
            select: {
              firstName: true, lastName: true, avatarUrl: true,
              city: true, country: true, idVerified: true, bio: true,
            },
          },
          providerProfile: true,
          services: {
            where: { isActive: true },
            include: { category: { select: { name: true, slug: true } } },
          },
        },
      });

      if (!provider) return res.status(404).json({ error: 'Prestataire introuvable' });

      res.json(provider);
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /providers/:id/reviews — Avis publics */
  async getReviews(req: Request, res: Response) {
    const { id } = req.params;
    const page  = Number(req.query.page)  || 1;
    const limit = Number(req.query.limit) || 10;

    try {
      const [reviews, total] = await Promise.all([
        prisma.review.findMany({
          where:   { reviewedId: id, isApproved: true },
          orderBy: { createdAt: 'desc' },
          skip:    getSkip({ page, limit }),
          take:    limit,
          include: {
            reviewer: {
              select: {
                profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
              },
            },
          },
        }),
        prisma.review.count({ where: { reviewedId: id, isApproved: true } }),
      ]);

      res.json(paginate(reviews, total, { page, limit }));
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PUT /providers/me/availability */
  async updateAvailability(req: Request, res: Response) {
    const { isAvailable } = req.body;
    try {
      await prisma.providerProfile.update({
        where: { userId: req.user!.id },
        data:  { isAvailable: Boolean(isAvailable) },
      });
      res.json({ message: 'Disponibilité mise à jour' });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};
