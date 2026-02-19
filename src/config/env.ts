import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TEMPORAL_ADDRESS: z.string().min(1),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  HOLD_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
});

export const env = envSchema.parse(process.env);
