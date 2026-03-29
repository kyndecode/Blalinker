import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { paginate, getSkip } from '../../utils/pagination.util';
import type {
  SearchInput,
  UpsertProviderProfileInput,
  CreateProviderServiceInput,
  UpdateProviderServiceInput,
} from './providers.schemas';

export const providersController = {
  /** GET /providers/search — Recherche géolocalisée (Haversine — sans PostGIS) */
  async search(req: Request, res: Response) {
    try {
      const q = req.query as unknown as SearchInput;
      const skip = getSkip({ page: q.page, limit: q.limit });

      // Formule Haversine en SQL pur (compatible PostgreSQL standard, sans PostGIS)
      const providers = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          u.id,
          p.first_name     AS "firstName",
          p.last_name      AS "lastName",
          p.avatar_url     AS "avatarUrl",
          p.city,
          p.country,
          p.address,
          p.latitude::float AS latitude,
          p.longitude::float AS longitude,
          p.id_verified    AS "idVerified",
          pp.rating_average AS "ratingAverage",
          pp.rating_count  AS "ratingCount",
          pp.hourly_rate   AS "hourlyRate",
          pp.is_available  AS "isAvailable",
          pp.completed_jobs AS "completedJobs",
          pp.is_premium    AS "isPremium",
          ROUND(
            (6371.0 * 2.0 * ASIN(SQRT(
              POWER(SIN(RADIANS((p.latitude::float  - ${q.lat}::float) / 2.0)), 2) +
              COS(RADIANS(${q.lat}::float)) * COS(RADIANS(p.latitude::float)) *
              POWER(SIN(RADIANS((p.longitude::float - ${q.lng}::float) / 2.0)), 2)
            )))::numeric, 1
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
          AND (${q.max_price ?? null}::numeric IS NULL OR pp.hourly_rate IS NULL OR pp.hourly_rate <= ${q.max_price ?? null}::numeric)
          AND p.latitude  IS NOT NULL
          AND p.longitude IS NOT NULL
          AND (6371.0 * 2.0 * ASIN(SQRT(
            POWER(SIN(RADIANS((p.latitude::float  - ${q.lat}::float) / 2.0)), 2) +
            COS(RADIANS(${q.lat}::float)) * COS(RADIANS(p.latitude::float)) *
            POWER(SIN(RADIANS((p.longitude::float - ${q.lng}::float) / 2.0)), 2)
          ))) <= ${q.radius}
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
          AND u.deleted_at IS NULL
          AND p.id_verified = true
          AND pp.rating_average >= ${q.min_rating}
          AND (${q.available_only} = false OR pp.is_available = true)
          AND (${q.category_id ?? null}::uuid IS NULL OR ps.category_id = ${q.category_id ?? null}::uuid)
          AND (${q.max_price ?? null}::numeric IS NULL OR pp.hourly_rate IS NULL OR pp.hourly_rate <= ${q.max_price ?? null}::numeric)
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND (6371.0 * 2.0 * ASIN(SQRT(
            POWER(SIN(RADIANS((p.latitude::float  - ${q.lat}::float) / 2.0)), 2) +
            COS(RADIANS(${q.lat}::float)) * COS(RADIANS(p.latitude::float)) *
            POWER(SIN(RADIANS((p.longitude::float - ${q.lng}::float) / 2.0)), 2)
          ))) <= ${q.radius}
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
          _count: {
            select: {
              receivedReviews: true,
            },
          },
        },
      });

      if (!provider) return res.status(404).json({ error: 'Prestataire introuvable' });

      return res.json(provider);
    } catch (err) {
      return res.status(500).json({ error: 'Erreur serveur' });
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

  /** GET /providers/me/profile */
  async getMyProfile(req: Request, res: Response) {
    try {
      const provider = await prisma.user.findFirst({
        where: {
          id: req.user!.id,
          role: 'provider',
          deletedAt: null,
        },
        include: {
          profile: true,
          providerProfile: true,
        },
      });

      if (!provider) {
        return res.status(404).json({ error: 'Profil prestataire introuvable' });
      }

      return res.json(provider);
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** POST/PUT /providers/me/profile */
  async upsertMyProfile(req: Request, res: Response) {
    const payload = req.body as UpsertProviderProfileInput;
    const providerId = req.user!.id;

    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.providerProfile.upsert({
          where: { userId: providerId },
          update: {
            businessName: payload.businessName,
            yearsExperience: payload.yearsExperience,
            hourlyRate: payload.hourlyRate !== undefined ? new Prisma.Decimal(payload.hourlyRate) : undefined,
            dailyRate: payload.dailyRate !== undefined ? new Prisma.Decimal(payload.dailyRate) : undefined,
            currency: payload.currency,
            radiusKm: payload.radiusKm,
            isAvailable: payload.isAvailable,
            bioPro: payload.bioPro,
          },
          create: {
            userId: providerId,
            businessName: payload.businessName,
            yearsExperience: payload.yearsExperience ?? 0,
            hourlyRate: payload.hourlyRate !== undefined ? new Prisma.Decimal(payload.hourlyRate) : undefined,
            dailyRate: payload.dailyRate !== undefined ? new Prisma.Decimal(payload.dailyRate) : undefined,
            currency: payload.currency ?? 'XOF',
            radiusKm: payload.radiusKm ?? 10,
            isAvailable: payload.isAvailable ?? true,
            bioPro: payload.bioPro,
          },
        });

        if (
          payload.city !== undefined
          || payload.country !== undefined
          || payload.address !== undefined
          || payload.latitude !== undefined
          || payload.longitude !== undefined
        ) {
          await tx.profile.upsert({
            where: { userId: providerId },
            update: {
              city: payload.city,
              country: payload.country,
              address: payload.address,
              latitude: payload.latitude !== undefined ? new Prisma.Decimal(payload.latitude) : undefined,
              longitude: payload.longitude !== undefined ? new Prisma.Decimal(payload.longitude) : undefined,
            },
            create: {
              userId: providerId,
              firstName: 'Prestataire',
              lastName: 'BLA',
              city: payload.city,
              country: payload.country ?? 'SN',
              address: payload.address,
              latitude: payload.latitude !== undefined ? new Prisma.Decimal(payload.latitude) : undefined,
              longitude: payload.longitude !== undefined ? new Prisma.Decimal(payload.longitude) : undefined,
            },
          });
        }

        return tx.user.findUnique({
          where: { id: providerId },
          include: { profile: true, providerProfile: true },
        });
      });

      return res.json(updated);
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /providers/me/services */
  async listMyServices(req: Request, res: Response) {
    try {
      const services = await prisma.providerService.findMany({
        where: { providerId: req.user!.id },
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ data: services });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** POST /providers/me/services */
  async createMyService(req: Request, res: Response) {
    const payload = req.body as CreateProviderServiceInput;

    try {
      const category = await prisma.category.findFirst({
        where: { id: payload.categoryId, isActive: true },
        select: { id: true },
      });
      if (!category) {
        return res.status(404).json({ error: 'Catégorie introuvable ou inactive' });
      }

      const service = await prisma.providerService.create({
        data: {
          providerId: req.user!.id,
          categoryId: payload.categoryId,
          title: payload.title,
          description: payload.description,
          priceType: payload.priceType,
          price: payload.price !== undefined ? new Prisma.Decimal(payload.price) : undefined,
          isActive: payload.isActive ?? true,
        },
        include: { category: { select: { id: true, name: true, slug: true } } },
      });

      return res.status(201).json(service);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.status(409).json({ error: 'Un service existe déjà pour cette catégorie' });
      }
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PUT /providers/me/services/:id */
  async updateMyService(req: Request, res: Response) {
    const { id } = req.params;
    const payload = req.body as UpdateProviderServiceInput;

    try {
      const existing = await prisma.providerService.findFirst({
        where: { id, providerId: req.user!.id },
        select: { id: true },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Service introuvable' });
      }

      if (payload.categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: payload.categoryId, isActive: true },
          select: { id: true },
        });
        if (!category) {
          return res.status(404).json({ error: 'Catégorie introuvable ou inactive' });
        }
      }

      const updated = await prisma.providerService.update({
        where: { id },
        data: {
          categoryId: payload.categoryId,
          title: payload.title,
          description: payload.description,
          priceType: payload.priceType,
          price: payload.price !== undefined ? new Prisma.Decimal(payload.price) : undefined,
          isActive: payload.isActive,
        },
        include: { category: { select: { id: true, name: true, slug: true } } },
      });

      return res.json(updated);
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.status(409).json({ error: 'Un service existe déjà pour cette catégorie' });
      }
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** DELETE /providers/me/services/:id */
  async deleteMyService(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const existing = await prisma.providerService.findFirst({
        where: { id, providerId: req.user!.id },
        select: { id: true },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Service introuvable' });
      }

      await prisma.providerService.update({
        where: { id },
        data: { isActive: false },
      });

      return res.json({ message: 'Service supprimé' });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PUT /providers/me/availability */
  async updateAvailability(req: Request, res: Response) {
    const { isAvailable } = req.body;
    try {
      await prisma.providerProfile.upsert({
        where: { userId: req.user!.id },
        update: { isAvailable: Boolean(isAvailable) },
        create: {
          userId: req.user!.id,
          isAvailable: Boolean(isAvailable),
        },
      });
      res.json({ message: 'Disponibilité mise à jour' });
    } catch (err) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};
