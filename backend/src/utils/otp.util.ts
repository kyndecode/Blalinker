import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/** Génère un OTP numérique à 6 chiffres */
export function generateOTP(): string {
  // Utiliser crypto pour garantir l'entropie
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
}

/** Hache un OTP pour stockage sécurisé en base */
export async function hashOTP(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

/** Vérifie un OTP en comparaison sécurisée (timing-safe) */
export async function verifyOTP(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

/** Calcule la date d'expiration d'un OTP */
export function otpExpiresAt(minutes = 10): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
