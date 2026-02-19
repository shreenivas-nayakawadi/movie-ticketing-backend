import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import bookingsRouter from './modules/bookings/bookings.route';
import customersRouter from './modules/customers/customers.route';
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
app.use('/api', bookingsRouter);
app.use('/api', customersRouter);

// Fallback handlers for unknown routes and centralized errors.
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
