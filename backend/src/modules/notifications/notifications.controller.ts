import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';

export const notificationsController = {
  /** GET /notifications — liste paginée + nombre de non-lues */
  async list(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const userId = req.user!.id;
    const onlyUnread = req.query.unread === 'true';
    const where = { userId, ...(onlyUnread ? { isRead: false } : {}) };

    try {
      const [items, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId, isRead: false } }),
      ]);
      return res.json({ ...paginate(items, total, { page, limit }), unreadCount });
    } catch (err) {
      logger.error('Erreur liste notifications', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PATCH /notifications/:id/read — marquer une notification comme lue */
  async markRead(req: Request, res: Response) {
    const userId = req.user!.id;
    try {
      const result = await prisma.notification.updateMany({
        where: { id: req.params.id, userId },
        data: { isRead: true, readAt: new Date() },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Notification introuvable' });
      return res.json({ message: 'Notification lue' });
    } catch (err) {
      logger.error('Erreur lecture notification', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** PATCH /notifications/read-all — tout marquer comme lu */
  async markAllRead(req: Request, res: Response) {
    const userId = req.user!.id;
    try {
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return res.json({ message: 'Toutes les notifications ont été marquées comme lues' });
    } catch (err) {
      logger.error('Erreur lecture notifications', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};
