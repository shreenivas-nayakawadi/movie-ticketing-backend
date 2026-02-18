import app from './app';
import { env } from './config/env';
import { bootstrapInfrastructure } from './bootstrap';

async function startServer(): Promise<void> {
  await bootstrapInfrastructure();

  app.listen(env.PORT, () => {
    console.log(`Server running at http://localhost:${env.PORT}`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
