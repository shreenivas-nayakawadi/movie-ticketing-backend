import { checkPostgresConnection } from './lib/postgres';
import { checkRedisConnection } from './lib/redis';
import { checkTemporalConnection } from './lib/temporal';

// Verify all critical infrastructure dependencies before accepting requests.
export async function bootstrapInfrastructure(): Promise<void> {
  await checkPostgresConnection();
  console.log('[infra] postgres connected');

  await checkRedisConnection();
  console.log('[infra] redis connected');

  await checkTemporalConnection();
  console.log('[infra] temporal connected');
}
