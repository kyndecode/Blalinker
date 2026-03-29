import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import type { UpdateMeInput } from './users.schemas';

export const usersController = {
  async getMe(req: Request, res: Response) {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          profile: {
            select: {
              firstName: true,
              lastName: true,
              bio: true,
              city: true,
              country: true,
              avatarUrl: true,
              idVerified: true,
            },
          },
        },
      });

      if (!user || user.deletedAt) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
      }

      return res.json({
        id: user.id,
        role: user.role,
        email: user.email ?? '',
        phone: user.phone ?? '',
        firstName: user.profile?.firstName ?? '',
        lastName: user.profile?.lastName ?? '',
        bio: user.profile?.bio ?? '',
        city: user.profile?.city ?? '',
        country: user.profile?.country ?? '',
        avatarUrl: user.profile?.avatarUrl ?? '',
        isVerified: user.profile?.idVerified ?? false,
      });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async updateMe(req: Request, res: Response) {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const payload = req.body as UpdateMeInput;

    try {
      if (payload.email) {
        const duplicate = await prisma.user.findFirst({
          where: {
            email: payload.email,
            id: { not: req.user.id },
            deletedAt: null,
          },
          select: { id: true },
        });

        if (duplicate) {
          return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }
      }

      const profileData: Record<string, string | null> = {};
      if (payload.firstName !== undefined) profileData.firstName = payload.firstName;
      if (payload.lastName !== undefined) profileData.lastName = payload.lastName;
      if (payload.bio !== undefined) profileData.bio = payload.bio || null;
      if (payload.city !== undefined) profileData.city = payload.city || null;
      if (payload.country !== undefined) profileData.country = payload.country || 'CI';

      await prisma.$transaction(async (tx) => {
        if (payload.email !== undefined) {
          await tx.user.update({
            where: { id: req.user!.id },
            data: { email: payload.email },
          });
        }

        if (Object.keys(profileData).length > 0) {
          await tx.profile.upsert({
            where: { userId: req.user!.id },
            update: profileData,
            create: {
              userId: req.user!.id,
              firstName: profileData.firstName ?? 'Client',
              lastName: profileData.lastName ?? 'BLA',
              bio: profileData.bio ?? null,
              city: profileData.city ?? null,
              country: profileData.country ?? 'CI',
            },
          });
        }
      });

      return res.json({ message: 'Profil mis à jour' });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};
