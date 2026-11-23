import http from 'http';
import https from 'https';

// Set required env vars before any module is loaded
process.env.DATABASE_URL    = process.env.DATABASE_URL    || 'postgresql://test:test@localhost:5432/test_bla';
process.env.JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || 'test-private-key';
process.env.JWT_PUBLIC_KEY  = process.env.JWT_PUBLIC_KEY  || 'test-public-key';
process.env.ENCRYPTION_KEY  = process.env.ENCRYPTION_KEY  || 'a'.repeat(64);
process.env.REDIS_URL       = process.env.REDIS_URL       || 'redis://localhost:6379';
process.env.NODE_ENV        = 'test';

// ─── Aucun e-mail ni SMS réel pendant les tests ──────────────────
// 1. Les identifiants des fournisseurs sont neutralisés, même s'ils sont
//    présents dans l'environnement de la machine ou de la CI.
for (const key of ['BREVO_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']) {
  delete process.env[key];
}

// 2. Filet de sécurité : toute requête réseau vers Brevo ou Twilio est refusée.
export const BLOCKED_PROVIDER_HOSTS = /(^|\.)(brevo\.com|sendinblue\.com|twilio\.com)$/i;

function hostOf(target: unknown): string {
  if (typeof target === 'string') {
    try { return new URL(target).hostname; } catch { return ''; }
  }
  if (target instanceof URL) return target.hostname;
  const opts = (target ?? {}) as { hostname?: string; host?: string };
  return String(opts.hostname ?? opts.host ?? '').replace(/:\d+$/, '');
}

for (const mod of [http, https] as const) {
  for (const method of ['request', 'get'] as const) {
    const original = mod[method] as (...args: unknown[]) => unknown;
    (mod as unknown as Record<string, unknown>)[method] = function guarded(this: unknown, ...args: unknown[]) {
      const host = hostOf(args[0]);
      if (BLOCKED_PROVIDER_HOSTS.test(host)) {
        throw new Error(`Appel réseau réel interdit pendant les tests : ${host}`);
      }
      return original.apply(this, args);
    };
  }
}

afterEach(() => {
  jest.clearAllMocks();
});
