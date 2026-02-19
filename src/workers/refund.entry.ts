import { bootstrapInfrastructure } from '../bootstrap';
import { startRefundWorker, stopRefundWorker } from './refund.worker';

async function main(): Promise<void> {
  await bootstrapInfrastructure();
  startRefundWorker();

  const shutdown = (): void => {
    stopRefundWorker();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[worker] refund entry failed', error);
  process.exit(1);
});
