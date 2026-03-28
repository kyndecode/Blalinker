/**
 * BLA — Seed de base de données
 * Données initiales : catégories, admin par défaut
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Démarrage du seed...');

  // ─── Catégories de services ───────────────────────────────
  const categories = [
    { name: 'Plomberie',       slug: 'plomberie',      sortOrder: 1 },
    { name: 'Électricité',     slug: 'electricite',    sortOrder: 2 },
    { name: 'Menuiserie',      slug: 'menuiserie',     sortOrder: 3 },
    { name: 'Climatisation',   slug: 'climatisation',  sortOrder: 4 },
    { name: 'Peinture',        slug: 'peinture',       sortOrder: 5 },
    { name: 'Jardinage',       slug: 'jardinage',      sortOrder: 6 },
    { name: 'Déménagement',    slug: 'demenagement',   sortOrder: 7 },
    { name: 'Sécurité/Alarme', slug: 'securite',       sortOrder: 8 },
    { name: 'Informatique',    slug: 'informatique',   sortOrder: 9 },
    { name: 'Nettoyage',       slug: 'nettoyage',      sortOrder: 10 },
    { name: 'Maçonnerie',      slug: 'maconnerie',     sortOrder: 11 },
    { name: 'Carrelage',       slug: 'carrelage',      sortOrder: 12 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { ...cat, isActive: true },
    });
  }
  console.log(`✅ ${categories.length} catégories créées`);

  // ─── Compte Admin par défaut ──────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@bla-app.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'BlaAdmin2024!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: 'super_admin',
      status: 'active',
      mfaEnabled: false,
      profile: {
        create: {
          firstName: 'Super',
          lastName: 'Admin',
          country: 'SN',
          idVerified: true,
        },
      },
    },
  });

  console.log(`✅ Admin créé : ${admin.email}`);
  console.log('');
  console.log('⚠️  IMPORTANT : Changez le mot de passe admin en production !');
  console.log(`   Email : ${adminEmail}`);
  console.log(`   Mot de passe : ${adminPassword}`);
  console.log('');
  console.log('🎉 Seed terminé avec succès !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur de seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
