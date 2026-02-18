import { Router } from 'express';

const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'movie-ticketing-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default healthRouter;
