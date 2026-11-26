/**
 * Durcissements issus de l'audit du 25/11/2026 :
 * - type réel des fichiers envoyés (signature) ;
 * - cookie de renouvellement lu seulement avec l'en-tête X-Auth-Mode (anti-CSRF) ;
 * - origines localhost refusées par défaut en production (CORS) ;
 * - erreurs de requête (JSON invalide, fichier trop gros) en 4xx, pas en 500.
 */
import type { Request } from 'express';
import multer from 'multer';
import { detectFileKind, isAllowedFile, AVATAR_KINDS, ID_DOCUMENT_KINDS } from '../../src/utils/fileType.util';
import { getRefreshToken, REFRESH_COOKIE_NAME } from '../../src/utils/cookies.util';
import { getCorsOrigins } from '../../src/config/env';

jest.mock('prom-client', () => {
  class Registry { contentType = 'text/plain'; setDefaultLabels() { /* noop */ } metrics() { return Promise.resolve(''); } }
  return { __esModule: true, default: { Registry, collectDefaultMetrics: jest.fn() }, Registry, collectDefaultMetrics: jest.fn() };
});
jest.mock('../../src/config/redis', () => ({ redis: { ping: jest.fn(), get: jest.fn(), call: jest.fn() } }));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PDF = Buffer.from('%PDF-1.7\n');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');

describe('Type réel des fichiers envoyés', () => {
  it('reconnaît JPEG, PNG, WebP et PDF d’après leur contenu', () => {
    expect(detectFileKind(JPEG)).toBe('jpeg');
    expect(detectFileKind(PNG)).toBe('png');
    expect(detectFileKind(WEBP)).toBe('webp');
    expect(detectFileKind(PDF)).toBe('pdf');
  });

  it('refuse SVG, HTML, exécutable et fichier vide, quel que soit le type déclaré', () => {
    for (const buf of [SVG, HTML, EXE, Buffer.alloc(0)]) {
      expect(isAllowedFile(buf, ID_DOCUMENT_KINDS)).toBe(false);
      expect(isAllowedFile(buf, AVATAR_KINDS)).toBe(false);
    }
  });

  it('photo de profil : PDF refusé ; pièce d’identité : PDF accepté', () => {
    expect(isAllowedFile(PDF, AVATAR_KINDS)).toBe(false);
    expect(isAllowedFile(PDF, ID_DOCUMENT_KINDS)).toBe(true);
  });
});

describe('Cookie de renouvellement (anti-CSRF)', () => {
  const req = (headers: Record<string, string>, body: unknown = {}) =>
    ({ headers, cookies: { [REFRESH_COOKIE_NAME]: 'from-cookie' }, body }) as unknown as Request;

  it('ignoré sans l’en-tête X-Auth-Mode (formulaire d’un site tiers)', () => {
    expect(getRefreshToken(req({}))).toBeUndefined();
  });

  it('lu avec X-Auth-Mode: cookie (site BLA)', () => {
    expect(getRefreshToken(req({ 'x-auth-mode': 'cookie' }))).toBe('from-cookie');
  });

  it('jeton dans le corps (mobile, administration) : inchangé', () => {
    expect(getRefreshToken(req({}, { refreshToken: 'from-body' }))).toBe('from-body');
  });
});

describe('CORS', () => {
  it('production : aucune origine localhost par défaut', () => {
    const origins = getCorsOrigins('https://www.blalinker.com', 'production');
    expect(origins).not.toEqual(expect.arrayContaining(['http://localhost:5173']));
    expect(origins).toEqual(expect.arrayContaining(['https://www.blalinker.com', 'https://admin.blalinker.com', 'https://blalinker.com']));
  });

  it('développement : serveurs locaux autorisés', () => {
    expect(getCorsOrigins('', 'development')).toEqual(expect.arrayContaining(['http://localhost:5173', 'http://localhost:5174']));
  });

  it('une origine explicitement configurée reste autorisée en production', () => {
    expect(getCorsOrigins('https://preview.example.test/', 'production')).toContain('https://preview.example.test');
  });
});

describe('Erreurs dues à la requête', () => {
  // Import tardif : app.ts charge toute l'application (routes) après les mocks.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { clientErrorResponse } = require('../../src/app') as typeof import('../../src/app');

  it('JSON invalide → 400, corps trop gros → 413, fichier trop gros → 413', () => {
    expect(clientErrorResponse(Object.assign(new SyntaxError('x'), { type: 'entity.parse.failed' }))?.status).toBe(400);
    expect(clientErrorResponse(Object.assign(new Error('x'), { type: 'entity.too.large' }))?.status).toBe(413);
    expect(clientErrorResponse(new multer.MulterError('LIMIT_FILE_SIZE'))?.status).toBe(413);
    expect(clientErrorResponse(new multer.MulterError('LIMIT_UNEXPECTED_FILE'))?.status).toBe(400);
  });

  it('erreur technique → null (traitée en 500 sans détail en production)', () => {
    expect(clientErrorResponse(new Error('base indisponible'))).toBeNull();
  });
});
