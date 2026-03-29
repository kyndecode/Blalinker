/**
 * BLA — Seed de base de données
 * Données initiales : catégories hiérarchiques + admin par défaut
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Catégories parentes ────────────────────────────────────────
const PARENTS = [
  { name: 'Bâtiment & Travaux',       slug: 'batiment',         iconUrl: '🏗️', sortOrder: 1 },
  { name: 'Transport & Déplacement',  slug: 'transport',        iconUrl: '🚗', sortOrder: 2 },
  { name: 'Beauté & Bien-être',       slug: 'beaute',           iconUrl: '💇', sortOrder: 3 },
  { name: 'Éducation & Formation',    slug: 'education',        iconUrl: '🎓', sortOrder: 4 },
  { name: 'Nettoyage & Services',     slug: 'nettoyage-menage', iconUrl: '🧹', sortOrder: 5 },
  { name: 'Informatique & Digital',   slug: 'numerique',        iconUrl: '💻', sortOrder: 6 },
  { name: 'Réparation & Maintenance', slug: 'reparation',       iconUrl: '🔧', sortOrder: 7 },
  { name: 'Recrutement & Emploi',     slug: 'emploi',           iconUrl: '💼', sortOrder: 8 },
];

// ─── Sous-catégories par parent slug ───────────────────────────
const CHILDREN: Record<string, Array<{ name: string; slug: string; sortOrder: number }>> = {
  batiment: [
    { name: 'Maçonnerie',    slug: 'maconnerie',    sortOrder: 1 },
    { name: 'Électricité',   slug: 'electricite',   sortOrder: 2 },
    { name: 'Plomberie',     slug: 'plomberie',     sortOrder: 3 },
    { name: 'Peinture',      slug: 'peinture',      sortOrder: 4 },
    { name: 'Menuiserie',    slug: 'menuiserie',    sortOrder: 5 },
    { name: 'Climatisation', slug: 'climatisation', sortOrder: 6 },
    { name: 'Carrelage',     slug: 'carrelage',     sortOrder: 7 },
  ],
  transport: [
    { name: 'Chauffeur privé',      slug: 'chauffeur-prive',   sortOrder: 1 },
    { name: 'Taxi',                 slug: 'taxi',              sortOrder: 2 },
    { name: 'Livraison',            slug: 'livraison',         sortOrder: 3 },
    { name: 'Déménagement',         slug: 'demenagement',      sortOrder: 4 },
    { name: 'Location de véhicule', slug: 'location-vehicule', sortOrder: 5 },
  ],
  beaute: [
    { name: 'Coiffeur',            slug: 'coiffeur',          sortOrder: 1 },
    { name: 'Coiffeur à domicile', slug: 'coiffeur-domicile', sortOrder: 2 },
    { name: 'Esthétique',          slug: 'esthetique',        sortOrder: 3 },
    { name: 'Massage',             slug: 'massage',           sortOrder: 4 },
    { name: 'Maquillage',          slug: 'maquillage',        sortOrder: 5 },
  ],
  education: [
    { name: 'Cours à domicile',   slug: 'cours-domicile',   sortOrder: 1 },
    { name: 'Soutien scolaire',   slug: 'soutien-scolaire', sortOrder: 2 },
    { name: 'Formation pro',      slug: 'formation-pro',    sortOrder: 3 },
    { name: 'Coaching',           slug: 'coaching',         sortOrder: 4 },
    { name: 'Langues étrangères', slug: 'langues',          sortOrder: 5 },
  ],
  'nettoyage-menage': [
    { name: 'Ménage à domicile',    slug: 'menage-domicile',   sortOrder: 1 },
    { name: 'Nettoyage',            slug: 'nettoyage',         sortOrder: 2 },
    { name: 'Nettoyage de bureaux', slug: 'nettoyage-bureaux', sortOrder: 3 },
    { name: 'Pressing',             slug: 'pressing',          sortOrder: 4 },
    { name: 'Jardinage',            slug: 'jardinage',         sortOrder: 5 },
    { name: 'Espaces verts',        slug: 'espaces-verts',     sortOrder: 6 },
  ],
  numerique: [
    { name: 'Développement web',      slug: 'dev-web',             sortOrder: 1 },
    { name: 'Réparation PC',          slug: 'reparation-pc',       sortOrder: 2 },
    { name: 'Installation réseau',    slug: 'installation-reseau', sortOrder: 3 },
    { name: 'Community manager',      slug: 'community-manager',   sortOrder: 4 },
    { name: 'Informatique',           slug: 'informatique',        sortOrder: 5 },
  ],
  reparation: [
    { name: 'Mécanicien',               slug: 'mecanicien',                sortOrder: 1 },
    { name: 'Réparation électroménager',slug: 'reparation-electromenager', sortOrder: 2 },
    { name: 'Réparation téléphone',     slug: 'reparation-telephone',      sortOrder: 3 },
    { name: 'Maintenance informatique', slug: 'maintenance-info',          sortOrder: 4 },
    { name: 'Sécurité / Alarme',        slug: 'securite',                  sortOrder: 5 },
  ],
  emploi: [
    { name: "Recherche d'emploi",  slug: 'recherche-emploi',  sortOrder: 1 },
    { name: "Publication d'offres",slug: 'publication-offres',sortOrder: 2 },
    { name: 'Freelance',           slug: 'freelance',         sortOrder: 3 },
    { name: 'Assistance RH',       slug: 'assistance-rh',     sortOrder: 4 },
  ],
};

async function main() {
  console.log('🌱 Démarrage du seed...');

  // ─── 1. Catégories parentes ────────────────────────────────
  const parentMap: Record<string, string> = {};

  for (const parent of PARENTS) {
    const record = await prisma.category.upsert({
      where:  { slug: parent.slug },
      update: { name: parent.name, iconUrl: parent.iconUrl, sortOrder: parent.sortOrder },
      create: { ...parent, isActive: true, parentId: null },
    });
    parentMap[parent.slug] = record.id;
  }
  console.log(`✅ ${PARENTS.length} catégories parentes créées`);

  // ─── 2. Sous-catégories ────────────────────────────────────
  let totalChildren = 0;
  for (const [parentSlug, children] of Object.entries(CHILDREN)) {
    const parentId = parentMap[parentSlug];
    if (!parentId) continue;
    for (const child of children) {
      await prisma.category.upsert({
        where:  { slug: child.slug },
        update: { name: child.name, parentId, sortOrder: child.sortOrder },
        create: { ...child, isActive: true, parentId },
      });
      totalChildren++;
    }
  }
  console.log(`✅ ${totalChildren} sous-catégories créées`);

  // ─── 3. Admin par défaut ───────────────────────────────────
  const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@bla-app.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'BlaAdmin2024!';
  const passwordHash  = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where:  { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role:       'super_admin',
      status:     'active',
      mfaEnabled: false,
      profile: {
        create: {
          firstName:  'Super',
          lastName:   'Admin',
          country:    'SN',
          idVerified: true,
        },
      },
    },
  });

  console.log(`✅ Admin créé : ${admin.email}`);
  console.log('');
  console.log('⚠️  IMPORTANT : Changez le mot de passe admin en production !');
  console.log(`   Email    : ${adminEmail}`);
  console.log(`   Password : ${adminPassword}`);
  console.log('');
  console.log('🎉 Seed terminé avec succès !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur de seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
