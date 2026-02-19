import { createClient } from 'redis';
import { env } from '../config/env';

export const redisClient = createClient({ url: env.REDIS_URL });

redisClient.on('error', (error: unknown) => {
  console.error('[redis] client error', error);
});

// Ensure the redis client is connected and responsive.
export async function checkRedisConnection(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  await redisClient.ping();
}
