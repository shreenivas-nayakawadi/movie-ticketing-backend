import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import healthRouter from './routes/health.route';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api', healthRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
