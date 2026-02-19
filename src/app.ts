import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import holdsRouter from './modules/holds/holds.route';
import showsRouter from './modules/shows/shows.route';
import healthRouter from './routes/health.route';

const app = express();

// Global HTTP hardening + request parsing middleware.
app.use(helmet());
app.use(cors());
app.use(express.json());

// Feature route registration under /api namespace.
app.use('/api', healthRouter);
app.use('/api', showsRouter);
app.use('/api', holdsRouter);

// Fallback handlers for unknown routes and centralized errors.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
