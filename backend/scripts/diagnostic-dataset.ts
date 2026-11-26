/**
 * Jeu de données de DIAGNOSTIC — 3 lignes maximum par table, identités fictives.
 *
 * Sert à vérifier de bout en bout (API, site, administration) sur une base LOCALE ou
 * JETABLE. Le script REFUSE toute base distante (Supabase, Render, etc.) : il ne doit
 * jamais toucher la production. Chaque ligne est marquée « [DIAG] » et les e-mails sont
 * en @diagnostic.invalid (domaine réservé, jamais distribuable).
 *
 * Usage (depuis backend/, DATABASE_URL = base locale) :
 *   npx tsx scripts/diagnostic-dataset.ts --create    (affiche le mot de passe des comptes, généré au hasard)
 *   npx tsx scripts/diagnostic-dataset.ts --cleanup   (supprime uniquement les lignes [DIAG])
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

export const DIAG_DOMAIN = 'diagnostic.invalid';
export const DIAG_TAG = '[DIAG]';

/** Refuse toute base qui n'est pas manifestement locale. */
export function assertLocalDatabase(url: string | undefined): void {
  if (!url) throw new Error('DATABASE_URL absente.');
  if (/supabase|pooler|onrender|render\.com|amazonaws|neon\.tech|azure|gcp|cloud/i.test(url)) {
    throw new Error('Base distante détectée : refusé (jeu de diagnostic réservé aux bases locales jetables).');
  }
  if (!/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url)) {
    throw new Error('Seules les bases locales (localhost) sont acceptées.');
  }
}

export interface DiagnosticIds {
  client: string; providerA: string; providerB: string;
  categories: string[]; services: string[]; booking: string; review: string;
}

export async function createDiagnosticDataset(prisma: PrismaClient, passwordHash: string, suffix = ''): Promise<DiagnosticIds> {
  const mail = (local: string) => `${local}${suffix}@${DIAG_DOMAIN}`;
  const slug = (s: string) => `diag-${s}${suffix ? `-${suffix}` : ''}`;

  // categories : 3 lignes
  const categories = await Promise.all([
    ['Plomberie', 'plomberie', '🔧'], ['Électricité', 'electricite', '⚡'], ['Ménage', 'menage', '🧹'],
  ].map(([name, s, icon], i) => prisma.category.create({
    data: { name: `${DIAG_TAG} ${name}`, slug: slug(s), iconUrl: icon, sortOrder: 900 + i, isActive: true },
    select: { id: true },
  }).then((c) => c.id)));

  // users + profiles (3 lignes chacune), provider_profiles (2), provider_services (3)
  const client = await prisma.user.create({
    data: {
      email: mail('client'), passwordHash, role: 'client', status: 'active', mfaEnabled: true,
      profile: { create: { firstName: 'Client', lastName: `${DIAG_TAG} Test`, city: 'Abidjan' } },
    },
    select: { id: true },
  });
  const provider = (local: string, first: string, city: string, lat: number, lng: number, catIndex: number[], prices: number[]) =>
    prisma.user.create({
      data: {
        email: mail(local), passwordHash, role: 'provider', status: 'active', mfaEnabled: true,
        profile: { create: { firstName: first, lastName: `${DIAG_TAG} Test`, city, latitude: lat, longitude: lng, idVerified: true, idVerifiedAt: new Date() } },
        providerProfile: { create: { businessName: `${DIAG_TAG} ${first} Services`, isAvailable: true } },
        services: {
          create: catIndex.map((ci, k) => ({ title: `${DIAG_TAG} ${['Réparation de fuite', 'Installation électrique', 'Ménage complet'][ci]}`, categoryId: categories[ci], price: prices[k] })),
        },
      },
      select: { id: true, services: { select: { id: true } } },
    });
  const providerA = await provider('prestataire-a', 'Awa', 'Abidjan', 5.35, -4.0, [0, 1], [15000, 20000]);
  const providerB = await provider('prestataire-b', 'Moussa', 'Dakar', 14.69, -17.44, [2], [8000]);

  // bookings : 1 ligne (mission validée) ; reviews : 1 ligne (avis publié)
  const booking = await prisma.booking.create({
    data: {
      clientId: client.id, providerId: providerA.id, serviceId: providerA.services[0].id, status: 'validated',
      amount: 15000, description: `${DIAG_TAG} mission de diagnostic`, validatedAt: new Date(),
    },
    select: { id: true },
  });
  const review = await prisma.review.create({
    data: {
      bookingId: booking.id, reviewerId: client.id, reviewedId: providerA.id, rating: 5,
      comment: `${DIAG_TAG} Intervention de diagnostic, rapide et soignée.`, isApproved: true, approvedAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.providerProfile.update({ where: { userId: providerA.id }, data: { ratingAverage: 5, ratingCount: 1, completedJobs: 1 } });

  return {
    client: client.id, providerA: providerA.id, providerB: providerB.id, categories,
    services: [...providerA.services, ...providerB.services].map((s) => s.id), booking: booking.id, review: review.id,
  };
}

/** Supprime uniquement les lignes du jeu de diagnostic (comptes @diagnostic.invalid, catégories diag-*). */
export async function removeDiagnosticDataset(prisma: PrismaClient, suffix = ''): Promise<void> {
  const users = (await prisma.user.findMany({
    where: { email: { endsWith: `${suffix}@${DIAG_DOMAIN}` } },
    select: { id: true },
  })).map((u) => u.id);
  if (users.length) {
    await prisma.review.deleteMany({ where: { reviewerId: { in: users } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.otpCode.deleteMany({ where: { userId: { in: users } } });
    await prisma.userSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
    await prisma.booking.deleteMany({ where: { clientId: { in: users } } });
    await prisma.providerService.deleteMany({ where: { providerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  await prisma.category.deleteMany({
    where: suffix ? { AND: [{ slug: { startsWith: 'diag-' } }, { slug: { endsWith: `-${suffix}` } }] } : { slug: { startsWith: 'diag-' } },
  });
}

async function main(): Promise<number> {
  const mode = process.argv.includes('--create') ? 'create' : process.argv.includes('--cleanup') ? 'cleanup' : null;
  if (!mode) {
    console.error('Usage : npx tsx scripts/diagnostic-dataset.ts --create | --cleanup');
    return 2;
  }
  assertLocalDatabase(process.env.DATABASE_URL);
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    if (mode === 'cleanup') {
      await removeDiagnosticDataset(prisma);
      console.log('Jeu de diagnostic supprimé.');
      return 0;
    }
    const password = `Diag-${randomBytes(6).toString('hex')}-A1`;
    const ids = await createDiagnosticDataset(prisma, await bcrypt.hash(password, 10));
    console.log(JSON.stringify({ comptes: [`client@${DIAG_DOMAIN}`, `prestataire-a@${DIAG_DOMAIN}`, `prestataire-b@${DIAG_DOMAIN}`], motDePasse: password, ids }, null, 2));
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
