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
  TEMPORAL_TASK_QUEUE: z.string().default('movie-ticketing'),
  TEMPORAL_KITCHEN_WORKFLOW_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  HOLD_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  REFUND_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  LOYALTY_POINT_VALUE_CENTS: z.coerce.number().int().positive().default(100),
  LOYALTY_EARN_PER_CURRENCY_UNIT: z.coerce.number().int().positive().default(10),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SMS_GATEWAY_URL: z.string().url().optional(),
  SMS_GATEWAY_API_KEY: z.string().optional(),
  REFUND_GATEWAY_URL: z.string().url().optional(),
  REFUND_GATEWAY_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
