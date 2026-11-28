import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { uploadBuffer, isCloudinaryConfigured } from '../../config/cloudinary';
import { AVATAR_KINDS, ID_DOCUMENT_KINDS, isAllowedFile } from '../../utils/fileType.util';

async function ensureProfile(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) {
    await prisma.profile.create({ data: { userId, firstName: 'Utilisateur', lastName: 'BLA', country: 'CI' } });
  }
}

export const uploadsController = {
  /** POST /uploads/avatar — photo de profil */
  async avatar(req: Request, res: Response) {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'L’envoi de fichiers est momentanément indisponible. Réessayez plus tard ou contactez le support.', code: 'STORAGE_UNAVAILABLE' });
    }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
    if (!isAllowedFile(req.file.buffer, AVATAR_KINDS)) {
      return res.status(415).json({ error: 'Format non accepté : photo JPEG, PNG ou WebP (6 Mo maximum).', code: 'UNSUPPORTED_FILE_TYPE' });
    }

    try {
      const result = await uploadBuffer(req.file.buffer, `bla/avatars/${req.user!.id}`, 'image');
      await ensureProfile(req.user!.id);
      await prisma.profile.update({ where: { userId: req.user!.id }, data: { avatarUrl: result.secure_url } });
      return res.json({ url: result.secure_url });
    } catch (err) {
      logger.error('Erreur upload avatar', err);
      return res.status(500).json({ error: 'Échec du téléversement' });
    }
  },

  /** POST /uploads/id-card — pièce d'identité (KYC) */
  async idCard(req: Request, res: Response) {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'L’envoi de fichiers est momentanément indisponible. Réessayez plus tard ou contactez le support.', code: 'STORAGE_UNAVAILABLE' });
    }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });
    if (!isAllowedFile(req.file.buffer, ID_DOCUMENT_KINDS)) {
      return res.status(415).json({ error: 'Format non accepté : photo (JPEG, PNG, WebP) ou PDF, 6 Mo maximum.', code: 'UNSUPPORTED_FILE_TYPE' });
    }

    try {
      // Livraison « authenticated » : lisible uniquement via une URL signée temporaire
      // générée pour un membre de l'équipe habilité (GET /admin/users/:id/id-document).
      const result = await uploadBuffer(req.file.buffer, `bla/kyc/${req.user!.id}`, 'auto', 'authenticated');
      await ensureProfile(req.user!.id);
      // Nouveau document → repasse en non vérifié (l'admin devra re-valider)
      await prisma.profile.update({
        where: { userId: req.user!.id },
        data: { idCardUrl: result.secure_url, idVerified: false, idVerifiedAt: null, idVerifiedBy: null },
      });
      return res.json({ uploaded: true, message: 'Document envoyé. Il sera vérifié par notre équipe.' });
    } catch (err) {
      logger.error('Erreur upload KYC', err);
      return res.status(500).json({ error: 'Échec du téléversement' });
    }
  },
};
