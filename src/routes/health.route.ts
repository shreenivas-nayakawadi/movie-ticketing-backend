import { Router } from 'express';
import { checkPostgresConnection } from '../lib/postgres';
import { checkRedisConnection } from '../lib/redis';
import { checkTemporalConnection } from '../lib/temporal';

const healthRouter = Router();

// Fast liveness endpoint to confirm API process is running.
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'movie-ticketing-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Readiness endpoint that verifies all required infra dependencies.
healthRouter.get('/ready', async (_req, res, next) => {
  try {
    await Promise.all([
      checkPostgresConnection(),
      checkRedisConnection(),
      checkTemporalConnection(),
    ]);

    res.status(200).json({
      status: 'ready',
      dependencies: { postgres: 'up', redis: 'up', temporal: 'up' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default healthRouter;
