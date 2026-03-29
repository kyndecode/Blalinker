import { Request, Response } from 'express';
import { prisma } from '../../config/database';

export const categoriesController = {
  /** GET /categories — Arbre public (parents + enfants) */
  async list(_req: Request, res: Response) {
    try {
      const categories = await prisma.category.findMany({
        where:   { isActive: true, parentId: null },
        include: {
          children: {
            where:   { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select:  { id: true, name: true, slug: true, iconUrl: true, sortOrder: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      res.json(categories);
    } catch {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  /** GET /categories/:slug — Une catégorie et ses enfants */
  async getBySlug(req: Request, res: Response) {
    const { slug } = req.params;
    try {
      const category = await prisma.category.findUnique({
        where:   { slug },
        include: {
          children: {
            where:   { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select:  { id: true, name: true, slug: true, iconUrl: true },
          },
          parent: {
            select: { id: true, name: true, slug: true },
          },
        },
      });
      if (!category || !category.isActive) {
        return res.status(404).json({ error: 'Catégorie introuvable' });
      }
      return res.json(category);
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};
