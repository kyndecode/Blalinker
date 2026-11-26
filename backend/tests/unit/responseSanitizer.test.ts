import express from 'express';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { logger } from '../../src/config/logger';
import { responseSanitizer, stripSecrets, SECRET_RESPONSE_KEYS } from '../../src/middlewares/responseSanitizer.middleware';

describe('stripSecrets — filet de sécurité des réponses', () => {
  it('retire les secrets à toute profondeur (objets imbriqués et tableaux)', () => {
    const removed: string[] = [];
    const out = stripSecrets({
      data: [
        { id: '1', email: 'a@b.c', passwordHash: 'h1', profile: { firstName: 'A', mfaSecret: 's' } },
        { id: '2', client: { passwordHash: 'h2', refreshHash: 'r' }, codeHash: 'c' },
      ],
      meta: { page: 1 },
    }, removed);

    const json = JSON.stringify(out);
    for (const key of ['passwordHash', 'mfaSecret', 'refreshHash', 'codeHash']) expect(json).not.toContain(key);
    expect(json).toContain('a@b.c'); // les autres champs sont conservés
    expect(removed).toEqual([
      '$.data[0].passwordHash', '$.data[0].profile.mfaSecret', '$.data[1].client.passwordHash',
      '$.data[1].client.refreshHash', '$.data[1].codeHash',
    ]);
  });

  it('conserve les dates et les décimaux Prisma sans les altérer', () => {
    const date = new Date('2026-11-24T10:00:00Z');
    const amount = new Prisma.Decimal('15000.50');
    const out = stripSecrets({ createdAt: date, amount }) as { createdAt: Date; amount: Prisma.Decimal };
    expect(out.createdAt).toBe(date);
    expect(JSON.stringify(out)).toBe('{"createdAt":"2026-11-24T10:00:00.000Z","amount":"15000.5"}');
  });

  it('couvre les noms en camelCase et en snake_case', () => {
    expect([...SECRET_RESPONSE_KEYS]).toEqual(expect.arrayContaining(['passwordHash', 'password_hash', 'mfaSecret', 'mfa_secret']));
  });
});

describe('responseSanitizer — middleware Express', () => {
  const app = express();
  app.use(responseSanitizer);
  app.get('/fuite', (_req, res) => res.json({ user: { id: 'u1', passwordHash: '$2b$12$secret-hash-value' } }));
  app.get('/propre', (_req, res) => res.json({ ok: true }));

  it('retire l’empreinte et journalise le CHEMIN (jamais la valeur)', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const res = await request(app).get('/fuite');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: 'u1' } });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls[0]);
    expect(logged).toContain('$.user.passwordHash');
    expect(logged).not.toContain('secret-hash-value');
    warn.mockRestore();
  });

  it('ne journalise rien quand la réponse est propre', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    await request(app).get('/propre');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
