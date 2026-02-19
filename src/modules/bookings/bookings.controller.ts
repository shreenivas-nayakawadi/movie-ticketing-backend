import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../lib/http-error';
import { checkoutBooking, getBookingById } from './bookings.service';
import { bookingIdParamSchema, checkoutBookingSchema } from './bookings.validation';

// Validate checkout input, create booking from hold, and return booking payload.
export async function checkoutBookingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = checkoutBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request', 'INVALID_INPUT');
    }

    const idempotencyKeyRaw = req.header('Idempotency-Key') ?? req.header('idempotency-key');
    const idempotencyKey = idempotencyKeyRaw?.trim() || undefined;

    const result = await checkoutBooking({
      ...parsed.data,
      idempotencyKey,
    });

    res.status(result.isIdempotentReplay ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
}

// Validate booking id and return complete booking details.
export async function getBookingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = bookingIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid booking id', 'INVALID_INPUT');
    }

    const booking = await getBookingById(parsed.data.bookingId);
    res.status(200).json({ booking });
  } catch (error) {
    next(error);
  }
}
