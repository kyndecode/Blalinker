/**
 * Réinitialisation de DERNIER RECOURS de l'application d'authentification (TOTP)
 * d'un compte d'administration — par exemple le seul super-administrateur qui a
 * perdu son téléphone ET ses codes de récupération, sans accès à sa boîte e-mail.
 *
 * Usage (depuis backend/, DATABASE_URL de la base visée dans l'environnement) :
 *   npx tsx scripts/reset-admin-mfa.ts --email contact@blalinker.com            (simulation)
 *   npx tsx scripts/reset-admin-mfa.ts --email contact@blalinker.com --confirm  (exécution)
 *
 * Effets (avec --confirm) : secret TOTP et codes de récupération effacés, toutes les
 * sessions du compte fermées, entrée « auth.mfa.totp_reset » au journal d'audit.
 * Le MFA reste ACTIF : la prochaine connexion repasse par le code e-mail, puis
 * l'application devra être configurée de nouveau. N'affiche aucun secret.
 */
import { PrismaClient } from '@prisma/client';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function mask(email: string): string {
  const at = email.lastIndexOf('@');
  return at > 0 ? `${email.slice(0, Math.min(2, at))}***${email.slice(at)}` : '***';
}

async function main(): Promise<number> {
  const email = argValue('--email')?.trim().toLowerCase();
  const confirm = process.argv.includes('--confirm');

  if (!email) {
    console.error('Usage : npx tsx scripts/reset-admin-mfa.ts --email <adresse> [--confirm]');
    return 2;
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL absente : définissez-la dans le terminal (elle n\'est jamais affichée).');
    return 2;
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, role: true, status: true, mfaTotpEnabledAt: true },
    });
    if (!user) {
      console.error(`Aucun compte actif pour ${mask(email)}.`);
      return 1;
    }
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      console.error('Ce script ne concerne que les comptes d\'administration.');
      return 1;
    }

    const codes = await prisma.mfaRecoveryCode.count({ where: { userId: user.id } });
    const sessions = await prisma.userSession.count({ where: { userId: user.id } });
    console.log(`Compte : ${mask(email)} (${user.role}, ${user.status})`);
    console.log(`Application d'authentification : ${user.mfaTotpEnabledAt ? 'configurée' : 'non configurée'}`);
    console.log(`Codes de récupération : ${codes} | Sessions ouvertes : ${sessions}`);

    if (!confirm) {
      console.log('\nSimulation : rien n\'a été modifié. Relancez avec --confirm pour réinitialiser.');
      return 0;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { mfaSecret: null, mfaTotpEnabledAt: null, mfaTotpLastStep: null, mfaEnabled: true },
      }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.userSession.deleteMany({ where: { userId: user.id } }),
      prisma.auditLog.create({
        data: { userId: null, action: 'auth.mfa.totp_reset', entity: 'user', entityId: user.id, newData: { via: 'script' } },
      }),
    ]);

    console.log('\nRéinitialisation effectuée : connexion suivante par code e-mail, puis nouvelle configuration.');
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Échec :', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
