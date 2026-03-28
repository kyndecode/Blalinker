// Utiliser une clé de test (64 hex chars = 32 bytes)
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.DATABASE_URL   = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_PRIVATE_KEY = 'test-private-key';
process.env.JWT_PUBLIC_KEY  = 'test-public-key';

import { encrypt, decrypt } from '../../src/utils/encryption.util';

describe('Encryption Utilities', () => {
  it('chiffre et déchiffre correctement une chaîne', () => {
    const original = 'données sensibles: carte identité CN123456';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('deux chiffrements produisent des résultats différents (IV aléatoire)', () => {
    const text = 'même texte';
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    expect(enc1).not.toBe(enc2);
  });

  it('le texte chiffré contient 3 parties séparées par ":"', () => {
    const encrypted = encrypt('test');
    expect(encrypted.split(':')).toHaveLength(3);
  });

  it('lève une erreur si le format est invalide', () => {
    expect(() => decrypt('format:invalide')).toThrow();
  });
});
