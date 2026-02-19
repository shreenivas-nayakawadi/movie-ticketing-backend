import { Router } from 'express';
import { cancelShowController } from './admin-shows.controller';

const adminShowsRouter = Router();

// Admin operational route for show cancellation and compensation queueing.
adminShowsRouter.post('/admin/shows/:showId/cancel', cancelShowController);

export default adminShowsRouter;
