import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connecté'));
redis.on('error', (err) => logger.error('Redis erreur:', err));

// Graceful shutdown
process.on('beforeExit', async () => {
  await redis.quit();
});
