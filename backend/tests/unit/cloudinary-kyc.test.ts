/**
 * Pièces d'identité : décomposition des URL Cloudinary et lien signé à durée limitée.
 * Aucun appel réseau : la signature est calculée localement par le SDK.
 */
import { v2 as cloudinary } from 'cloudinary';
import { parseCloudinaryUrl, signedDownloadUrl } from '../../src/config/cloudinary';

describe('parseCloudinaryUrl', () => {
  it('image publique versionnée', () => {
    expect(parseCloudinaryUrl('https://res.cloudinary.com/acme/image/upload/v1712345678/bla/kyc/u1/abc123.jpg', 'acme')).toEqual({
      resourceType: 'image', deliveryType: 'upload', publicId: 'bla/kyc/u1/abc123', format: 'jpg',
    });
  });

  it('document « authenticated » avec signature de livraison', () => {
    expect(parseCloudinaryUrl('https://res.cloudinary.com/acme/image/authenticated/s--AbC123--/v1/bla/kyc/u2/doc.pdf', 'acme')).toEqual({
      resourceType: 'image', deliveryType: 'authenticated', publicId: 'bla/kyc/u2/doc', format: 'pdf',
    });
  });

  it('fichier brut : l\'extension fait partie de l\'identifiant', () => {
    expect(parseCloudinaryUrl('https://res.cloudinary.com/acme/raw/upload/v2/bla/kyc/u3/scan.pdf', 'acme')).toMatchObject({
      resourceType: 'raw', publicId: 'bla/kyc/u3/scan.pdf', format: null,
    });
  });

  it.each([
    ['autre compte', 'https://res.cloudinary.com/intrus/image/upload/v1/x.jpg'],
    ['autre domaine', 'https://evil.example/acme/image/upload/v1/x.jpg'],
    ['http non chiffré', 'http://res.cloudinary.com/acme/image/upload/v1/x.jpg'],
    ['type inconnu', 'https://res.cloudinary.com/acme/image/fetch/v1/x.jpg'],
    ['pas une URL', 'javascript:alert(1)'],
  ])('refuse : %s', (_label, value) => {
    expect(parseCloudinaryUrl(value, 'acme')).toBeNull();
  });
});

describe('signedDownloadUrl', () => {
  beforeAll(() => {
    cloudinary.config({ cloud_name: 'acme', api_key: '123456789012345', api_secret: 'test-secret-local', secure: true });
  });

  it('URL d\'API signée, expirant au délai demandé', () => {
    const before = Date.now();
    const { url, expiresAt } = signedDownloadUrl(
      { resourceType: 'image', deliveryType: 'authenticated', publicId: 'bla/kyc/u2/doc', format: 'pdf' },
      300,
    );
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('api.cloudinary.com');
    expect(parsed.searchParams.get('type')).toBe('authenticated');
    expect(parsed.searchParams.get('signature')).toBeTruthy();
    const exp = Number(parsed.searchParams.get('expires_at'));
    expect(exp).toBe(Math.floor(expiresAt.getTime() / 1000));
    expect(exp * 1000).toBeGreaterThanOrEqual(before + 299_000);
    expect(exp * 1000).toBeLessThanOrEqual(Date.now() + 301_000);
    expect(url).not.toContain('test-secret-local');
  });
});
