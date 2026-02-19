import { bootstrapInfrastructure } from '../bootstrap';
import { startOutboxWorker, stopOutboxWorker } from './outbox.worker';

async function main(): Promise<void> {
  await bootstrapInfrastructure();
  startOutboxWorker();

  const shutdown = (): void => {
    stopOutboxWorker();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[worker] outbox entry failed', error);
  process.exit(1);
});
