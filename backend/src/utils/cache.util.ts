import { redis } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Cache Redis « au mieux » : une panne de Redis ne bloque jamais la réponse
 * (lecture et écriture ignorées, valeur recalculée).
 */
export async function cachedValue<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    logger.warn('Cache indisponible (lecture)', { key, error: err instanceof Error ? err.message : String(err) });
  }
  const value = await compute();
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.warn('Cache indisponible (écriture)', { key, error: err instanceof Error ? err.message : String(err) });
  }
  return value;
}

/** Invalide des clés exactes (après une modification de contenu). Ne lève jamais d'exception. */
export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.warn('Cache indisponible (invalidation)', { keys, error: err instanceof Error ? err.message : String(err) });
  }
}
