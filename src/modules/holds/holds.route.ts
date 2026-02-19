import { Router } from 'express';
import {
  cancelHoldController,
  createHoldController,
  getHoldController,
} from './holds.controller';

const holdsRouter = Router();

// Hold lifecycle endpoints.
holdsRouter.post('/holds', createHoldController);
holdsRouter.get('/holds/:holdId', getHoldController);
holdsRouter.delete('/holds/:holdId', cancelHoldController);

export default holdsRouter;
