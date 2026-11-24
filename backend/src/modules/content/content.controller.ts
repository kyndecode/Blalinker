import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { auditFromReq } from '../../utils/audit.util';
import { cachedValue, invalidateCache } from '../../utils/cache.util';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import { isCloudinaryConfigured, uploadBuffer } from '../../config/cloudinary';
import { SETTINGS_REGISTRY, SUPPORTED_LOCALES, isSettingKey, scopeSchema, type SupportedLocale } from './settings.registry';
import { contentStatusValues } from './content.schemas';
import type {
  CreateAnnouncementInput, CreateCountryInput, CreateFaqInput, CreatePageInput,
  UpdateAnnouncementInput, UpdateCountryInput, UpdateFaqInput, UpdateMediaInput, UpdatePageInput, UpsertSettingInput,
} from './content.schemas';

const TTL = 300;
export const CACHE_KEYS = {
  settings: 'site:settings:v1',
  countries: 'site:countries:v1',
  announcements: 'site:announcements:v1',
  faq: (locale: string) => `site:faq:v1:${locale}`,
  page: (slug: string, locale: string) => `site:page:v1:${slug}:${locale}`,
};

function prismaCode(err: unknown): string | undefined {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
}
function fail(res: Response, label: string, err: unknown) {
  logger.error(label, { error: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: 'Erreur serveur' });
}
function localeOf(value: unknown): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value as string) ? (value as SupportedLocale) : 'fr';
}
function statusFilter(value: unknown) {
  return (contentStatusValues as readonly string[]).includes(value as string) ? (value as (typeof contentStatusValues)[number]) : undefined;
}
/** Date de publication : fixée au premier passage en « publié », conservée ensuite. */
function publishedAtFor(nextStatus: string | undefined, current: Date | null | undefined): Date | null | undefined {
  if (nextStatus === 'published') return current ?? new Date();
  return undefined;
}

// ════════════════════════════════════════════════════════════
// Lecture publique (site) — contenu publié uniquement
// ════════════════════════════════════════════════════════════

export interface PublicSettings { values: Record<string, unknown>; scope: string }

/** Paramètres globaux, surchargés par ceux du pays demandé. */
export async function readPublicSettings(country?: string): Promise<PublicSettings> {
  const rows = await cachedValue(CACHE_KEYS.settings, TTL, () =>
    prisma.siteSetting.findMany({ select: { key: true, scope: true, value: true } }));
  const scope = country && /^[A-Z]{2}$/.test(country) ? country : 'global';
  const values: Record<string, unknown> = {};
  for (const row of rows) if (row.scope === 'global' && isSettingKey(row.key)) values[row.key] = row.value;
  if (scope !== 'global') for (const row of rows) if (row.scope === scope && isSettingKey(row.key)) values[row.key] = row.value;
  return { values, scope };
}

export const contentPublicController = {
  /** GET /site/settings?country=CI */
  async settings(req: Request, res: Response) {
    try {
      const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : undefined;
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(await readPublicSettings(country));
    } catch (err) {
      return fail(res, 'Paramètres publics indisponibles', err);
    }
  },

  /** GET /site/countries — pays actifs uniquement */
  async countries(_req: Request, res: Response) {
    try {
      const items = await cachedValue(CACHE_KEYS.countries, TTL, () => prisma.country.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { code: true, name: true, dialCode: true, currency: true, defaultLocale: true },
      }));
      res.set('Cache-Control', 'public, max-age=300');
      return res.json({ items });
    } catch (err) {
      return fail(res, 'Pays indisponibles', err);
    }
  },

  /** GET /site/pages/:slug?locale=fr — 404 si aucune page publiée (le site affiche alors son texte intégré) */
  async page(req: Request, res: Response) {
    const slug = String(req.params.slug ?? '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(404).json({ error: 'Page introuvable' });
    const locale = localeOf(req.query.locale);
    try {
      const page = await cachedValue(CACHE_KEYS.page(slug, locale), TTL, () => prisma.contentPage.findFirst({
        where: { slug, locale, status: 'published' },
        select: { slug: true, locale: true, title: true, summary: true, body: true, publishedAt: true, updatedAt: true },
      }));
      if (!page) return res.status(404).json({ error: 'Page introuvable' });
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(page);
    } catch (err) {
      return fail(res, 'Page indisponible', err);
    }
  },

  /** GET /site/faq?locale=fr */
  async faq(req: Request, res: Response) {
    const locale = localeOf(req.query.locale);
    try {
      const items = await cachedValue(CACHE_KEYS.faq(locale), TTL, () => prisma.faqItem.findMany({
        where: { locale, status: 'published' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, category: true, question: true, answer: true },
      }));
      res.set('Cache-Control', 'public, max-age=60');
      return res.json({ items });
    } catch (err) {
      return fail(res, 'FAQ indisponible', err);
    }
  },

  /** GET /site/announcements?locale=fr&country=CI — annonces publiées dans leur fenêtre de diffusion */
  async announcements(req: Request, res: Response) {
    const locale = localeOf(req.query.locale);
    const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : null;
    try {
      const rows = await cachedValue(CACHE_KEYS.announcements, 60, () => prisma.announcement.findMany({
        where: { status: 'published' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true, message: true, linkUrl: true, linkLabel: true, level: true, locale: true, countryCode: true,
          startsAt: true, endsAt: true, updatedAt: true,
        },
      }));
      const now = Date.now();
      const items = rows
        .filter((a) => (!a.startsAt || new Date(a.startsAt).getTime() <= now) && (!a.endsAt || new Date(a.endsAt).getTime() > now))
        .filter((a) => !a.locale || a.locale === locale)
        .filter((a) => !a.countryCode || a.countryCode === country)
        .slice(0, 3)
        .map(({ startsAt: _s, endsAt: _e, locale: _l, countryCode: _c, ...a }) => a);
      res.set('Cache-Control', 'public, max-age=60');
      return res.json({ items });
    } catch (err) {
      return fail(res, 'Annonces indisponibles', err);
    }
  },
};

// ════════════════════════════════════════════════════════════
// Administration — permissions content.manage / settings.manage
// ════════════════════════════════════════════════════════════

export const contentAdminController = {
  // ─── Pages ─────────────────────────────────────────────────
  async listPages(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const where: Prisma.ContentPageWhereInput = {
      ...(statusFilter(req.query.status) ? { status: statusFilter(req.query.status) } : {}),
      ...(typeof req.query.locale === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(req.query.locale) ? { locale: req.query.locale } : {}),
    };
    try {
      const [rows, total] = await Promise.all([
        prisma.contentPage.findMany({
          where, skip: getSkip({ page, limit }), take: limit, orderBy: [{ slug: 'asc' }, { locale: 'asc' }],
          select: { id: true, slug: true, locale: true, title: true, status: true, publishedAt: true, updatedAt: true },
        }),
        prisma.contentPage.count({ where }),
      ]);
      return res.json(paginate(rows, total, { page, limit }));
    } catch (err) {
      return fail(res, 'Liste des pages', err);
    }
  },

  async getPage(req: Request, res: Response) {
    try {
      const row = await prisma.contentPage.findUnique({ where: { id: req.params.id } });
      return row ? res.json(row) : res.status(404).json({ error: 'Page introuvable' });
    } catch (err) {
      return fail(res, 'Lecture de page', err);
    }
  },

  async createPage(req: Request, res: Response) {
    const data = req.body as CreatePageInput;
    try {
      const row = await prisma.contentPage.create({
        data: { ...data, summary: data.summary ?? null, publishedAt: publishedAtFor(data.status, null) ?? null, updatedById: req.user!.id },
      });
      await invalidateCache(CACHE_KEYS.page(row.slug, row.locale));
      await auditFromReq(req, 'admin.content.page.create', { entity: 'content_page', entityId: row.id, newData: { slug: row.slug, locale: row.locale, status: row.status, result: 'success' } });
      return res.status(201).json(row);
    } catch (err) {
      if (prismaCode(err) === 'P2002') return res.status(409).json({ error: 'Une page existe déjà avec cet identifiant dans cette langue.', code: 'PAGE_EXISTS' });
      return fail(res, 'Création de page', err);
    }
  },

  async updatePage(req: Request, res: Response) {
    const data = req.body as UpdatePageInput;
    try {
      const current = await prisma.contentPage.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ error: 'Page introuvable' });
      const row = await prisma.contentPage.update({
        where: { id: current.id },
        data: { ...data, publishedAt: publishedAtFor(data.status, current.publishedAt), updatedById: req.user!.id },
      });
      await invalidateCache(CACHE_KEYS.page(current.slug, current.locale), CACHE_KEYS.page(row.slug, row.locale));
      await auditFromReq(req, 'admin.content.page.update', {
        entity: 'content_page', entityId: row.id,
        oldData: { slug: current.slug, locale: current.locale, title: current.title, status: current.status, body: current.body },
        newData: { fields: Object.keys(data), status: row.status, result: 'success' },
      });
      return res.json(row);
    } catch (err) {
      if (prismaCode(err) === 'P2002') return res.status(409).json({ error: 'Une page existe déjà avec cet identifiant dans cette langue.', code: 'PAGE_EXISTS' });
      return fail(res, 'Modification de page', err);
    }
  },

  /** Suppression : le contenu complet est conservé dans le journal d'audit (restauration possible). */
  async deletePage(req: Request, res: Response) {
    try {
      const current = await prisma.contentPage.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ error: 'Page introuvable' });
      await prisma.contentPage.delete({ where: { id: current.id } });
      await invalidateCache(CACHE_KEYS.page(current.slug, current.locale));
      await auditFromReq(req, 'admin.content.page.delete', { entity: 'content_page', entityId: current.id, oldData: current, newData: { result: 'success' } });
      return res.json({ message: 'Page supprimée' });
    } catch (err) {
      if (prismaCode(err) === 'P2025') return res.status(404).json({ error: 'Page introuvable' });
      return fail(res, 'Suppression de page', err);
    }
  },

  // ─── FAQ ───────────────────────────────────────────────────
  async listFaq(req: Request, res: Response) {
    const locale = typeof req.query.locale === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(req.query.locale) ? req.query.locale : undefined;
    try {
      const items = await prisma.faqItem.findMany({
        where: { ...(locale ? { locale } : {}), ...(statusFilter(req.query.status) ? { status: statusFilter(req.query.status) } : {}) },
        orderBy: [{ locale: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        take: 500,
      });
      return res.json({ items });
    } catch (err) {
      return fail(res, 'Liste FAQ', err);
    }
  },

  async createFaq(req: Request, res: Response) {
    const data = req.body as CreateFaqInput;
    try {
      const row = await prisma.faqItem.create({ data: { ...data, category: data.category ?? null, updatedById: req.user!.id } });
      await invalidateCache(CACHE_KEYS.faq(row.locale));
      await auditFromReq(req, 'admin.content.faq.create', { entity: 'faq_item', entityId: row.id, newData: { status: row.status, result: 'success' } });
      return res.status(201).json(row);
    } catch (err) {
      return fail(res, 'Création FAQ', err);
    }
  },

  async updateFaq(req: Request, res: Response) {
    const data = req.body as UpdateFaqInput;
    try {
      const current = await prisma.faqItem.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ error: 'Question introuvable' });
      const row = await prisma.faqItem.update({ where: { id: current.id }, data: { ...data, updatedById: req.user!.id } });
      await invalidateCache(CACHE_KEYS.faq(current.locale), CACHE_KEYS.faq(row.locale));
      await auditFromReq(req, 'admin.content.faq.update', {
        entity: 'faq_item', entityId: row.id,
        oldData: { question: current.question, answer: current.answer, status: current.status },
        newData: { fields: Object.keys(data), status: row.status, result: 'success' },
      });
      return res.json(row);
    } catch (err) {
      return fail(res, 'Modification FAQ', err);
    }
  },

  async deleteFaq(req: Request, res: Response) {
    try {
      const current = await prisma.faqItem.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ error: 'Question introuvable' });
      await prisma.faqItem.delete({ where: { id: current.id } });
      await invalidateCache(CACHE_KEYS.faq(current.locale));
      await auditFromReq(req, 'admin.content.faq.delete', { entity: 'faq_item', entityId: current.id, oldData: current, newData: { result: 'success' } });
      return res.json({ message: 'Question supprimée' });
    } catch (err) {
      if (prismaCode(err) === 'P2025') return res.status(404).json({ error: 'Question introuvable' });
      return fail(res, 'Suppression FAQ', err);
    }
  },

  // ─── Annonces ──────────────────────────────────────────────
  async listAnnouncements(_req: Request, res: Response) {
    try {
      const items = await prisma.announcement.findMany({ orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }], take: 200 });
      return res.json({ items });
    } catch (err) {
      return fail(res, 'Liste des annonces', err);
    }
  },

  async createAnnouncement(req: Request, res: Response) {
    const data = req.body as CreateAnnouncementInput;
    try {
      const row = await prisma.announcement.create({
        data: {
          ...data,
          linkUrl: data.linkUrl ?? null, linkLabel: data.linkLabel ?? null, locale: data.locale ?? null, countryCode: data.countryCode ?? null,
          startsAt: data.startsAt ? new Date(data.startsAt) : null, endsAt: data.endsAt ? new Date(data.endsAt) : null,
          updatedById: req.user!.id,
        },
      });
      await invalidateCache(CACHE_KEYS.announcements);
      await auditFromReq(req, 'admin.content.announcement.create', { entity: 'announcement', entityId: row.id, newData: { status: row.status, result: 'success' } });
      return res.status(201).json(row);
    } catch (err) {
      return fail(res, 'Création d’annonce', err);
    }
  },

  async updateAnnouncement(req: Request, res: Response) {
    const data = req.body as UpdateAnnouncementInput;
    try {
      const current = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ error: 'Annonce introuvable' });
      const startsAt = data.startsAt === undefined ? current.startsAt : data.startsAt ? new Date(data.startsAt) : null;
      const endsAt = data.endsAt === undefined ? current.endsAt : data.endsAt ? new Date(data.endsAt) : null;
      if (startsAt && endsAt && startsAt >= endsAt) {
        return res.status(422).json({ error: 'La fin doit être postérieure au début', errors: { endsAt: ['La fin doit être postérieure au début'] } });
      }
      const row = await prisma.announcement.update({
        where: { id: current.id },
        data: { ...data, startsAt, endsAt, updatedById: req.user!.id },
      });
      await invalidateCache(CACHE_KEYS.announcements);
      await auditFromReq(req, 'admin.content.announcement.update', {
        entity: 'announcement', entityId: row.id,
        oldData: { message: current.message, status: current.status },
        newData: { fields: Object.keys(data), status: row.status, result: 'success' },
      });
      return res.json(row);
    } catch (err) {
      return fail(res, 'Modification d’annonce', err);
    }
  },

  async deleteAnnouncement(req: Request, res: Response) {
    try {
      const current = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!current) return res.status(404).json({ error: 'Annonce introuvable' });
      await prisma.announcement.delete({ where: { id: current.id } });
      await invalidateCache(CACHE_KEYS.announcements);
      await auditFromReq(req, 'admin.content.announcement.delete', { entity: 'announcement', entityId: current.id, oldData: current, newData: { result: 'success' } });
      return res.json({ message: 'Annonce supprimée' });
    } catch (err) {
      if (prismaCode(err) === 'P2025') return res.status(404).json({ error: 'Annonce introuvable' });
      return fail(res, 'Suppression d’annonce', err);
    }
  },

  // ─── Paramètres ────────────────────────────────────────────
  /** GET /admin/settings — catalogue des clés + valeurs enregistrées (toutes portées) */
  async listSettings(_req: Request, res: Response) {
    try {
      const rows = await prisma.siteSetting.findMany({ orderBy: [{ key: 'asc' }, { scope: 'asc' }] });
      const catalog = Object.entries(SETTINGS_REGISTRY).map(([key, def]) => ({ key, label: def.label, group: def.group, kind: def.kind }));
      return res.json({ catalog, items: rows });
    } catch (err) {
      return fail(res, 'Liste des paramètres', err);
    }
  },

  async upsertSetting(req: Request, res: Response) {
    const { key, scope, value } = req.body as UpsertSettingInput;
    if (!isSettingKey(key)) return res.status(422).json({ error: 'Paramètre inconnu', errors: { key: ['Paramètre inconnu'] } });
    const parsed = SETTINGS_REGISTRY[key].schema.safeParse(value);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Valeur invalide';
      return res.status(422).json({ error: message, errors: { value: [message] } });
    }
    try {
      if (scope !== 'global') {
        const country = await prisma.country.findUnique({ where: { code: scope }, select: { code: true } });
        if (!country) return res.status(422).json({ error: 'Pays inconnu : ajoutez-le d’abord dans « Pays ».', errors: { scope: ['Pays inconnu'] } });
      }
      const previous = await prisma.siteSetting.findUnique({ where: { key_scope: { key, scope } } });
      const row = await prisma.siteSetting.upsert({
        where: { key_scope: { key, scope } },
        create: { key, scope, value: parsed.data as Prisma.InputJsonValue, updatedById: req.user!.id },
        update: { value: parsed.data as Prisma.InputJsonValue, updatedById: req.user!.id },
      });
      await invalidateCache(CACHE_KEYS.settings);
      await auditFromReq(req, 'admin.settings.upsert', {
        entity: 'site_setting', entityId: row.id,
        oldData: previous ? { key, scope, value: previous.value } : null,
        newData: { key, scope, value: row.value, result: 'success' },
      });
      return res.json(row);
    } catch (err) {
      return fail(res, 'Enregistrement du paramètre', err);
    }
  },

  /** DELETE /admin/settings/:key?scope= — retour à la valeur par défaut du site */
  async deleteSetting(req: Request, res: Response) {
    const key = req.params.key;
    const scopeParsed = scopeSchema.safeParse(typeof req.query.scope === 'string' ? req.query.scope : 'global');
    if (!isSettingKey(key) || !scopeParsed.success) return res.status(404).json({ error: 'Paramètre introuvable' });
    const scope = scopeParsed.data;
    try {
      const current = await prisma.siteSetting.findUnique({ where: { key_scope: { key, scope } } });
      if (!current) return res.status(404).json({ error: 'Paramètre introuvable' });
      await prisma.siteSetting.delete({ where: { id: current.id } });
      await invalidateCache(CACHE_KEYS.settings);
      await auditFromReq(req, 'admin.settings.delete', { entity: 'site_setting', entityId: current.id, oldData: { key, scope, value: current.value }, newData: { result: 'success' } });
      return res.json({ message: 'Valeur par défaut rétablie' });
    } catch (err) {
      return fail(res, 'Suppression du paramètre', err);
    }
  },

  // ─── Pays ──────────────────────────────────────────────────
  async listCountries(_req: Request, res: Response) {
    try {
      const items = await prisma.country.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      return res.json({ items });
    } catch (err) {
      return fail(res, 'Liste des pays', err);
    }
  },

  async createCountry(req: Request, res: Response) {
    const data = req.body as CreateCountryInput;
    try {
      const row = await prisma.country.create({ data });
      await invalidateCache(CACHE_KEYS.countries);
      // entity_id est un UUID : le code pays figure dans les données de l'entrée.
      await auditFromReq(req, 'admin.country.create', { entity: 'country', newData: { ...row, result: 'success' } });
      return res.status(201).json(row);
    } catch (err) {
      if (prismaCode(err) === 'P2002') return res.status(409).json({ error: 'Ce pays existe déjà.', code: 'COUNTRY_EXISTS' });
      return fail(res, 'Création de pays', err);
    }
  },

  async updateCountry(req: Request, res: Response) {
    const data = req.body as UpdateCountryInput;
    const code = String(req.params.code ?? '').toUpperCase();
    try {
      const current = await prisma.country.findUnique({ where: { code } });
      if (!current) return res.status(404).json({ error: 'Pays introuvable' });
      const row = await prisma.country.update({ where: { code }, data });
      await invalidateCache(CACHE_KEYS.countries);
      await auditFromReq(req, 'admin.country.update', { entity: 'country', oldData: current, newData: { code, ...data, result: 'success' } });
      return res.json(row);
    } catch (err) {
      return fail(res, 'Modification de pays', err);
    }
  },

  /** Suppression refusée si le pays est utilisé (paramètres, annonces, profils) : le désactiver à la place. */
  async deleteCountry(req: Request, res: Response) {
    const code = String(req.params.code ?? '').toUpperCase();
    try {
      const current = await prisma.country.findUnique({ where: { code } });
      if (!current) return res.status(404).json({ error: 'Pays introuvable' });
      const [settings, announcements, profiles] = await Promise.all([
        prisma.siteSetting.count({ where: { scope: code } }),
        prisma.announcement.count({ where: { countryCode: code } }),
        prisma.profile.count({ where: { country: code } }),
      ]);
      if (settings + announcements + profiles > 0) {
        return res.status(409).json({
          error: 'Pays utilisé : désactivez-le plutôt que de le supprimer.',
          code: 'COUNTRY_IN_USE',
          usage: { settings, announcements, profiles },
        });
      }
      await prisma.country.delete({ where: { code } });
      await invalidateCache(CACHE_KEYS.countries);
      await auditFromReq(req, 'admin.country.delete', { entity: 'country', oldData: current, newData: { code, result: 'success' } });
      return res.json({ message: 'Pays supprimé' });
    } catch (err) {
      return fail(res, 'Suppression de pays', err);
    }
  },

  // ─── Médias ────────────────────────────────────────────────
  async listMedia(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const where = { deletedAt: null };
    try {
      const [rows, total] = await Promise.all([
        prisma.mediaAsset.findMany({ where, skip: getSkip({ page, limit }), take: limit, orderBy: { createdAt: 'desc' } }),
        prisma.mediaAsset.count({ where }),
      ]);
      return res.json(paginate(rows, total, { page, limit }));
    } catch (err) {
      return fail(res, 'Médiathèque', err);
    }
  },

  async uploadMedia(req: Request, res: Response) {
    if (!isCloudinaryConfigured()) return res.status(503).json({ error: 'Stockage de fichiers non configuré.', code: 'STORAGE_UNAVAILABLE' });
    if (!req.file) return res.status(400).json({ error: 'Aucune image valide (JPEG, PNG, WebP ou GIF, 5 Mo maximum).' });
    const alt = typeof req.body?.alt === 'string' ? req.body.alt.trim().slice(0, 200) : null;
    try {
      const result = await uploadBuffer(req.file.buffer, 'bla/site', 'image');
      const row = await prisma.mediaAsset.create({
        data: {
          url: result.secure_url, publicId: result.public_id, mimeType: req.file.mimetype, bytes: req.file.size,
          alt: alt || null, uploadedById: req.user!.id,
        },
      });
      await auditFromReq(req, 'admin.media.upload', { entity: 'media_asset', entityId: row.id, newData: { bytes: row.bytes, result: 'success' } });
      return res.status(201).json(row);
    } catch (err) {
      return fail(res, 'Téléversement de média', err);
    }
  },

  async updateMedia(req: Request, res: Response) {
    const { alt } = req.body as UpdateMediaInput;
    try {
      const { count } = await prisma.mediaAsset.updateMany({ where: { id: req.params.id, deletedAt: null }, data: { alt } });
      if (count === 0) return res.status(404).json({ error: 'Média introuvable' });
      return res.json(await prisma.mediaAsset.findUnique({ where: { id: req.params.id } }));
    } catch (err) {
      return fail(res, 'Modification de média', err);
    }
  },

  /** Suppression logique, refusée si l'image est utilisée (pages, annonces, catégories). */
  async deleteMedia(req: Request, res: Response) {
    try {
      const media = await prisma.mediaAsset.findFirst({ where: { id: req.params.id, deletedAt: null } });
      if (!media) return res.status(404).json({ error: 'Média introuvable' });
      const [pages, announcements, categories] = await Promise.all([
        prisma.contentPage.count({ where: { body: { contains: media.url } } }),
        prisma.announcement.count({ where: { linkUrl: media.url } }),
        prisma.category.count({ where: { iconUrl: media.url } }),
      ]);
      if (pages + announcements + categories > 0) {
        return res.status(409).json({ error: 'Image utilisée sur le site : retirez-la d’abord des contenus concernés.', code: 'MEDIA_IN_USE', usage: { pages, announcements, categories } });
      }
      await prisma.mediaAsset.update({ where: { id: media.id }, data: { deletedAt: new Date() } });
      await auditFromReq(req, 'admin.media.delete', { entity: 'media_asset', entityId: media.id, oldData: { url: media.url }, newData: { soft: true, result: 'success' } });
      return res.json({ message: 'Image retirée de la médiathèque' });
    } catch (err) {
      return fail(res, 'Suppression de média', err);
    }
  },
};
