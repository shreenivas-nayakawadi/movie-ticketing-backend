import app from './app';
import { env } from './config/env';
import { bootstrapInfrastructure } from './bootstrap';
import { startHoldExpiryWorker, stopHoldExpiryWorker } from './workers/hold-expiry.worker';

// Boot infra checks, start background worker, then start HTTP server.
async function startServer(): Promise<void> {
  await bootstrapInfrastructure();
  startHoldExpiryWorker();

  const server = app.listen(env.PORT, () => {
    console.log(`Server running at http://localhost:${env.PORT}`);
  });

  // Handle process termination signals with graceful cleanup.
  const shutdown = (): void => {
    stopHoldExpiryWorker();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Exit with code 1 if startup fails so orchestration can restart the service.
startServer().catch((error: unknown) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
