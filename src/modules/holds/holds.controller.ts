import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../lib/http-error';
import { cancelHold, createHold, getHoldById } from './holds.service';
import { createHoldSchema, holdIdParamSchema } from './holds.validation';

// Validate hold-create request, delegate to service, and return created hold payload.
export async function createHoldController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = createHoldSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request', 'INVALID_INPUT');
    }

    const hold = await createHold(parsed.data);
    res.status(201).json({ hold });
  } catch (error) {
    next(error);
  }
}

// Validate hold id param, load hold details, and return current state.
export async function getHoldController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = holdIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid hold id', 'INVALID_INPUT');
    }

    const hold = await getHoldById(parsed.data.holdId);
    res.status(200).json({ hold });
  } catch (error) {
    next(error);
  }
}

// Validate hold id param, cancel active hold, and return updated hold state.
export async function cancelHoldController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = holdIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid hold id', 'INVALID_INPUT');
    }

    const hold = await cancelHold(parsed.data.holdId);
    res.status(200).json({ hold });
  } catch (error) {
    next(error);
  }
}
