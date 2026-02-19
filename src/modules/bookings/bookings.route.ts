import { Router } from 'express';
import { checkoutBookingController, getBookingController } from './bookings.controller';

const bookingsRouter = Router();

// Booking checkout and booking lookup endpoints.
bookingsRouter.post('/bookings/checkout', checkoutBookingController);
bookingsRouter.get('/bookings/:bookingId', getBookingController);

export default bookingsRouter;
