import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { paginate } from '../../utils/pagination.util';
import type { ListServicesQueryInput } from './services.schemas';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const servicesController = {
  /** GET /services */
  async list(req: Request, res: Response) {
    const q = req.query as unknown as ListServicesQueryInput;

    try {
      const where: Prisma.ProviderServiceWhereInput = {
        isActive: true,
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.providerId ? { providerId: q.providerId } : {}),
        ...(q.minPrice !== undefined || q.maxPrice !== undefined
          ? {
            price: {
              ...(q.minPrice !== undefined ? { gte: new Prisma.Decimal(q.minPrice) } : {}),
              ...(q.maxPrice !== undefined ? { lte: new Prisma.Decimal(q.maxPrice) } : {}),
            },
          }
          : {}),
        ...(q.q
          ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { description: { contains: q.q, mode: 'insensitive' } },
              { category: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
          : {}),
        provider: {
          role: 'provider',
          status: 'active',
          deletedAt: null,
          ...(q.availableOnly ? { providerProfile: { is: { isAvailable: true } } } : {}),
        },
      };

      const rows = await prisma.providerService.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          provider: {
            select: {
              id: true,
              email: true,
              phone: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  city: true,
                  country: true,
                  address: true,
                  avatarUrl: true,
                  latitude: true,
                  longitude: true,
                  idVerified: true,
                },
              },
              providerProfile: {
                select: {
                  isAvailable: true,
                  ratingAverage: true,
                  ratingCount: true,
                  businessName: true,
                },
              },
            },
          },
        },
      });

      const normalized = rows
        .map((row) => {
          const providerLat = row.provider.profile?.latitude !== null && row.provider.profile?.latitude !== undefined
            ? Number(row.provider.profile.latitude)
            : null;
          const providerLng = row.provider.profile?.longitude !== null && row.provider.profile?.longitude !== undefined
            ? Number(row.provider.profile.longitude)
            : null;

          const distanceKm = q.lat !== undefined && q.lng !== undefined && providerLat !== null && providerLng !== null
            ? Number(haversineKm(q.lat, q.lng, providerLat, providerLng).toFixed(1))
            : null;

          return {
            id: row.id,
            title: row.title,
            description: row.description,
            priceType: row.priceType,
            price: row.price !== null && row.price !== undefined ? Number(row.price) : null,
            isActive: row.isActive,
            category: row.category,
            provider: {
              id: row.provider.id,
              email: row.provider.email,
              phone: row.provider.phone,
              firstName: row.provider.profile?.firstName,
              lastName: row.provider.profile?.lastName,
              city: row.provider.profile?.city,
              country: row.provider.profile?.country,
              address: row.provider.profile?.address,
              avatarUrl: row.provider.profile?.avatarUrl,
              latitude: providerLat,
              longitude: providerLng,
              idVerified: row.provider.profile?.idVerified ?? false,
              isAvailable: row.provider.providerProfile?.isAvailable ?? false,
              ratingAverage: row.provider.providerProfile?.ratingAverage !== null && row.provider.providerProfile?.ratingAverage !== undefined
                ? Number(row.provider.providerProfile.ratingAverage)
                : 0,
              ratingCount: row.provider.providerProfile?.ratingCount ?? 0,
              businessName: row.provider.providerProfile?.businessName,
            },
            distanceKm,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        })
        .filter((row) => {
          if (q.lat === undefined || q.lng === undefined) return true;
          if (row.distanceKm === null) return false;
          return row.distanceKm <= q.radiusKm;
        });

      const paged = paginate(normalized, normalized.length, { page: q.page, limit: q.limit });
      return res.json(paged);
    } catch {
      return res.status(500).json({ error: 'Erreur lors du chargement des services' });
    }
  },

  /** GET /services/:id */
  async getOne(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const service = await prisma.providerService.findFirst({
        where: {
          id,
          isActive: true,
          provider: {
            role: 'provider',
            status: 'active',
            deletedAt: null,
          },
        },
        include: {
          category: true,
          provider: {
            include: {
              profile: true,
              providerProfile: true,
            },
          },
        },
      });

      if (!service) {
        return res.status(404).json({ error: 'Service introuvable' });
      }

      return res.json(service);
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};
