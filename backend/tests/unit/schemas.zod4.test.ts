/**
 * Non-régression de la migration zod 3 → 4 :
 * - une modification partielle n'injecte JAMAIS de valeur par défaut (zod 4 applique les
 *   .default() même dans les champs optionnels : les schémas de modification n'en ont pas) ;
 * - messages d'erreur personnalisés conservés (option `error`) ;
 * - format des erreurs 422 inchangé (middleware validate).
 */
import express from 'express';
import request from 'supertest';
import {
  createAnnouncementSchema, createCountrySchema, createFaqSchema, createPageSchema,
  updateAnnouncementSchema, updateCountrySchema, updateFaqSchema, updatePageSchema,
} from '../../src/modules/content/content.schemas';
import { verifyIdentitySchema, updateUserStatusSchema, updateCategorySchema } from '../../src/modules/admin/admin.schemas';
import { createReportSchema } from '../../src/modules/reports/reports.schemas';
import { validate } from '../../src/middlewares/validate.middleware';

describe('zod 4 — modifications partielles sans valeur par défaut', () => {
  it.each([
    ['page', updatePageSchema, { title: 'Nouveau titre' }],
    ['FAQ', updateFaqSchema, { question: 'Nouvelle question ?' }],
    ['annonce', updateAnnouncementSchema, { message: 'Nouveau message' }],
    ['pays', updateCountrySchema, { name: 'Nouveau nom' }],
    ['catégorie', updateCategorySchema, { name: 'Nouveau nom' }],
  ])('%s : seuls les champs envoyés ressortent', (_label, schema, input) => {
    const parsed = (schema as { parse: (v: unknown) => Record<string, unknown> }).parse(input);
    expect(parsed).toEqual(input);
  });

  it('création : valeurs par défaut appliquées', () => {
    expect(createPageSchema.parse({ slug: 'cgu', title: 'CGU', body: 'Texte' })).toMatchObject({ status: 'draft', locale: 'fr' });
    expect(createFaqSchema.parse({ question: 'Comment faire ?', answer: 'Ainsi.' })).toMatchObject({ status: 'draft', sortOrder: 0, locale: 'fr' });
    expect(createAnnouncementSchema.parse({ message: 'Bonjour' })).toMatchObject({ status: 'draft', level: 'info', sortOrder: 0 });
    expect(createCountrySchema.parse({ code: 'xa', name: 'Pays', dialCode: '+999', currency: 'xof' }))
      .toEqual({ code: 'XA', name: 'Pays', dialCode: '+999', currency: 'XOF', defaultLocale: 'fr', isActive: false, sortOrder: 0 });
  });
});

describe('zod 4 — messages personnalisés', () => {
  const first = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues[0]?.message;

  it('énumérations', () => {
    expect(first(updateUserStatusSchema.safeParse({ status: 'superviseur' }))).toBe('Statut invalide');
    expect(first(createReportSchema.safeParse({ reportedId: '11111111-1111-4111-8111-111111111111', reason: 'autre' }))).toBe('Motif de signalement invalide');
  });

  it('booléen absent ou de mauvais type', () => {
    expect(first(verifyIdentitySchema.safeParse({}))).toBe('Décision requise');
    expect(first(verifyIdentitySchema.safeParse({ approved: 'oui' }))).toBe('Décision invalide');
  });
});

describe('zod 4 — format 422 du middleware inchangé', () => {
  it('{ error, code, errors: { champ: [messages] } }', async () => {
    const app = express();
    app.use(express.json());
    app.post('/t', validate(updateUserStatusSchema), (_req, res) => res.json({ ok: true }));
    const res = await request(app).post('/t').send({ status: 'x' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Données invalides', code: 'VALIDATION_ERROR', errors: { status: ['Statut invalide'] } });
  });
});
