import { generateOTP, hashOTP, verifyOTP, otpExpiresAt } from '../../src/utils/otp.util';

describe('OTP Utilities', () => {
  describe('generateOTP()', () => {
    it('génère un code à 6 chiffres', () => {
      const otp = generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('deux OTPs successifs sont différents (probabilité >99.99%)', () => {
      const codes = new Set(Array.from({ length: 20 }, () => generateOTP()));
      expect(codes.size).toBeGreaterThan(10);
    });
  });

  describe('hashOTP() + verifyOTP()', () => {
    it('le hash est différent du code original', async () => {
      const code = '123456';
      const hash = await hashOTP(code);
      expect(hash).not.toBe(code);
      expect(hash).toMatch(/^\$2/); // format bcrypt
    });

    it('verifyOTP retourne true pour le code correct', async () => {
      const code = generateOTP();
      const hash = await hashOTP(code);
      expect(await verifyOTP(code, hash)).toBe(true);
    });

    it('verifyOTP retourne false pour un mauvais code', async () => {
      const hash = await hashOTP('123456');
      expect(await verifyOTP('000000', hash)).toBe(false);
    });
  });

  describe('otpExpiresAt()', () => {
    it('retourne une date dans le futur', () => {
      const expiry = otpExpiresAt(10);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });

    it('expiration correcte à +10 minutes (±5s)', () => {
      const before = Date.now();
      const expiry = otpExpiresAt(10);
      const after  = Date.now();
      expect(expiry.getTime()).toBeGreaterThan(before + 9 * 60_000);
      expect(expiry.getTime()).toBeLessThan(after + 10 * 60_000 + 5_000);
    });
  });
});
