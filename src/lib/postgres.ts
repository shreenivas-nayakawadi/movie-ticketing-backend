import { Pool } from 'pg';
import { env } from '../config/env';

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

export async function checkPostgresConnection(): Promise<void> {
  await pgPool.query('SELECT 1');
}
