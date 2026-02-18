import { Connection } from '@temporalio/client';
import { env } from '../config/env';

let temporalConnection: Connection | null = null;

export async function getTemporalConnection(): Promise<Connection> {
  if (temporalConnection) return temporalConnection;

  temporalConnection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  return temporalConnection;
}

export async function checkTemporalConnection(): Promise<void> {
  await getTemporalConnection();
}
