import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../lib/http-error';
import { getCustomerLoyaltyProfile } from './customers.service';
import { customerEmailParamSchema } from './customers.validation';

// Validate email param and return customer loyalty profile details.
export async function getCustomerLoyaltyController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = customerEmailParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid customer email', 'INVALID_INPUT');
    }

    const loyalty = await getCustomerLoyaltyProfile(parsed.data.email);
    res.status(200).json({ loyalty });
  } catch (error) {
    next(error);
  }
}
