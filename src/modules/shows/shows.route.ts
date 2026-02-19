import { Router } from 'express';
import { getShowSeatsController } from './shows.controller';

const showsRouter = Router();

// Show browsing endpoint used by seat-selection UI.
showsRouter.get('/shows/:showId/seats', getShowSeatsController);

export default showsRouter;
