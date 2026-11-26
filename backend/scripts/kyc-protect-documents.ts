/**
 * Protection des pièces d'identité déposées AVANT le passage en livraison « authenticated ».
 *
 * Les anciens documents ont une URL publique Cloudinary (type « upload ») : non devinable,
 * mais lisible par quiconque la connaît. Ce script les convertit en type « authenticated »
 * (lisibles uniquement via une URL signée générée pour un membre habilité de l'équipe)
 * et met à jour profiles.id_card_url. Aucun fichier n'est supprimé, aucune donnée n'est
 * effacée : seul le mode de livraison change.
 *
 * Usage (depuis backend/, variables DATABASE_URL et CLOUDINARY_* de l'environnement visé) :
 *   npx tsx scripts/kyc-protect-documents.ts            (simulation : liste ce qui serait converti)
 *   npx tsx scripts/kyc-protect-documents.ts --confirm  (exécution)
 *
 * N'affiche ni URL complète, ni identifiant Cloudinary, ni donnée personnelle.
 */
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { parseCloudinaryUrl } from '../src/config/cloudinary';

async function main(): Promise<number> {
  const confirm = process.argv.includes('--confirm');
  const { DATABASE_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!DATABASE_URL || !CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error('DATABASE_URL et CLOUDINARY_* doivent être définies dans le terminal (jamais affichées).');
    return 2;
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });

  const prisma = new PrismaClient();
  try {
    const profiles = await prisma.profile.findMany({
      where: { idCardUrl: { not: null } },
      select: { userId: true, idCardUrl: true },
    });
    let toConvert = 0;
    let converted = 0;
    let skipped = 0;
    let failed = 0;
    for (const profile of profiles) {
      const ref = parseCloudinaryUrl(profile.idCardUrl!, CLOUDINARY_CLOUD_NAME);
      if (!ref) { skipped += 1; continue; }
      if (ref.deliveryType !== 'upload') continue; // déjà protégé
      toConvert += 1;
      if (!confirm) continue;
      try {
        const result = await cloudinary.uploader.rename(ref.publicId, ref.publicId, {
          resource_type: ref.resourceType,
          type: 'upload',
          to_type: 'authenticated',
          overwrite: false,
          invalidate: true,
        });
        await prisma.profile.update({ where: { userId: profile.userId }, data: { idCardUrl: result.secure_url } });
        converted += 1;
      } catch (err) {
        failed += 1;
        console.error(`Échec de conversion (profil n°${converted + failed + skipped}) : ${err instanceof Error ? err.message.slice(0, 120) : 'erreur'}`);
      }
    }
    console.log(JSON.stringify({
      mode: confirm ? 'exécution' : 'simulation',
      documents: profiles.length,
      publicsAConvertir: toConvert,
      convertis: converted,
      nonReconnus: skipped,
      echecs: failed,
    }));
    return failed > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => process.exit(code), (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
