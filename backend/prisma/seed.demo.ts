import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DEMO_BOOKING_MARKER = 'DEMO_BOOKING_CLIENT_PROVIDER_V1';

const demoAccounts = {
  client: {
    email: 'client.demo@blalinker.com',
    phone: '+221770001001',
    password: 'ClientDemo123!',
    firstName: 'Awa',
    lastName: 'Diop',
    city: 'Dakar',
    address: 'Mermoz, Dakar',
  },
  provider: {
    email: 'prestataire.demo@blalinker.com',
    phone: '+221770001002',
    password: 'ProviderDemo123!',
    firstName: 'Moussa',
    lastName: 'Ndiaye',
    city: 'Dakar',
    address: 'Point E, Dakar',
    businessName: 'Ndiaye Plomberie Express',
  },
  admin: {
    email: 'admin.demo@blalinker.com',
    phone: '+221770001003',
    password: 'AdminDemo123!',
    firstName: 'Fatou',
    lastName: 'Sarr',
    city: 'Dakar',
    address: 'Plateau, Dakar',
  },
};

async function upsertUser(params: {
  email: string;
  phone: string;
  password: string;
  role: 'client' | 'provider' | 'admin';
  firstName: string;
  lastName: string;
  city: string;
  address: string;
}) {
  const passwordHash = await bcrypt.hash(params.password, 12);

  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: {
      phone: params.phone,
      passwordHash,
      role: params.role,
      status: 'active',
      mfaEnabled: false,
      loginAttempts: 0,
      lockedUntil: null,
      deletedAt: null,
    },
    create: {
      email: params.email,
      phone: params.phone,
      passwordHash,
      role: params.role,
      status: 'active',
      mfaEnabled: false,
    },
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {
      firstName: params.firstName,
      lastName: params.lastName,
      city: params.city,
      address: params.address,
      country: 'SN',
      idVerified: true,
      idVerifiedAt: new Date(),
    },
    create: {
      userId: user.id,
      firstName: params.firstName,
      lastName: params.lastName,
      city: params.city,
      address: params.address,
      country: 'SN',
      idVerified: true,
      idVerifiedAt: new Date(),
    },
  });

  return user;
}

async function getOrCreateCategory() {
  const bySlug = await prisma.category.findFirst({
    where: { slug: 'plomberie', isActive: true },
  });
  if (bySlug) return bySlug;

  const firstActive = await prisma.category.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (firstActive) return firstActive;

  return prisma.category.create({
    data: {
      name: 'Services Généraux',
      slug: 'services-generaux',
      description: 'Catégorie générique de démonstration',
      isActive: true,
      sortOrder: 999,
    },
  });
}

async function main() {
  console.log('=== Seed DEMO comptes + demande de prestation ===');

  const client = await upsertUser({
    ...demoAccounts.client,
    role: 'client',
  });

  const provider = await upsertUser({
    ...demoAccounts.provider,
    role: 'provider',
  });

  const admin = await upsertUser({
    ...demoAccounts.admin,
    role: 'admin',
  });

  await prisma.providerProfile.upsert({
    where: { userId: provider.id },
    update: {
      businessName: demoAccounts.provider.businessName,
      yearsExperience: 6,
      hourlyRate: new Prisma.Decimal('8000'),
      dailyRate: new Prisma.Decimal('45000'),
      currency: 'XOF',
      radiusKm: 25,
      isAvailable: true,
      bioPro: 'Interventions rapides en plomberie à Dakar et environs.',
    },
    create: {
      userId: provider.id,
      businessName: demoAccounts.provider.businessName,
      yearsExperience: 6,
      hourlyRate: new Prisma.Decimal('8000'),
      dailyRate: new Prisma.Decimal('45000'),
      currency: 'XOF',
      radiusKm: 25,
      isAvailable: true,
      bioPro: 'Interventions rapides en plomberie à Dakar et environs.',
    },
  });

  const category = await getOrCreateCategory();

  const service = await prisma.providerService.upsert({
    where: {
      providerId_categoryId: {
        providerId: provider.id,
        categoryId: category.id,
      },
    },
    update: {
      title: 'Dépannage plomberie à domicile',
      description: 'Réparation fuite, débouchage et maintenance plomberie.',
      priceType: 'fixed',
      price: new Prisma.Decimal('15000'),
      isActive: true,
    },
    create: {
      providerId: provider.id,
      categoryId: category.id,
      title: 'Dépannage plomberie à domicile',
      description: 'Réparation fuite, débouchage et maintenance plomberie.',
      priceType: 'fixed',
      price: new Prisma.Decimal('15000'),
      isActive: true,
    },
  });

  let booking = await prisma.booking.findFirst({
    where: {
      clientId: client.id,
      providerId: provider.id,
      notes: DEMO_BOOKING_MARKER,
    },
  });

  if (!booking) {
    booking = await prisma.booking.create({
      data: {
        clientId: client.id,
        providerId: provider.id,
        serviceId: service.id,
        status: 'pending',
        description: 'Fuite sous évier cuisine + vérification pression eau.',
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        clientAddress: 'HLM Grand-Yoff, Dakar',
        clientLat: new Prisma.Decimal('14.7467'),
        clientLng: new Prisma.Decimal('-17.4582'),
        amount: new Prisma.Decimal('15000'),
        currency: 'XOF',
        commissionRate: new Prisma.Decimal('5.00'),
        commissionAmt: new Prisma.Decimal('750'),
        notes: DEMO_BOOKING_MARKER,
      },
    });
  }

  console.log('');
  console.log('Comptes DEMO prêts:');
  console.log(`- CLIENT      ${demoAccounts.client.email} / ${demoAccounts.client.password}`);
  console.log(`- PRESTATAIRE ${demoAccounts.provider.email} / ${demoAccounts.provider.password}`);
  console.log(`- ADMIN       ${demoAccounts.admin.email} / ${demoAccounts.admin.password}`);
  console.log('');
  console.log(`Demande de prestation créée: ${booking.id} (status: ${booking.status})`);
  console.log(`Service associé: ${service.title}`);
}

main()
  .catch((error) => {
    console.error('Erreur seed DEMO:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
