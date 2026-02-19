import { Router } from 'express';
import { getCustomerLoyaltyController } from './customers.controller';

const customersRouter = Router();

// Customer lookup endpoints for loyalty balance and ledger history.
customersRouter.get('/customers/:email/loyalty', getCustomerLoyaltyController);

export default customersRouter;
