/**
 * Les notifications dans l'application sont écrites en arrière-plan, après la réponse HTTP
 * (pour ne pas la retarder). Compter juste après la réponse donne donc parfois 0 : le test
 * attend qu'au moins `min` notifications soient écrites (3 s au plus), puis renvoie le nombre
 * réel, ce qui laisse l'assertion détecter aussi les doublons.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export async function countNotifications(
  prisma: PrismaClient,
  where: Prisma.NotificationWhereInput,
  min = 1,
  timeoutMs = 3000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const count = await prisma.notification.count({ where });
    if (count >= min || Date.now() >= deadline) return count;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
