import { Connection } from '@temporalio/client';
import { env } from '../config/env';

let temporalConnection: Connection | null = null;

// Reuse one Temporal gRPC connection for the process lifetime.
export async function getTemporalConnection(): Promise<Connection> {
  if (temporalConnection) return temporalConnection;

  temporalConnection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  return temporalConnection;
}

// Validate Temporal reachability during startup/readiness checks.
export async function checkTemporalConnection(): Promise<void> {
  await getTemporalConnection();
}
