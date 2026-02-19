import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../../lib/http-error';
import { cancelShowAndQueueCompensation } from './admin-shows.service';
import { adminShowIdParamSchema, cancelShowSchema } from './admin-shows.validation';

// Validate admin cancel-show request and queue downstream compensation jobs.
export async function cancelShowController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const paramsParsed = adminShowIdParamSchema.safeParse(req.params);
    if (!paramsParsed.success) {
      throw new HttpError(400, paramsParsed.error.issues[0]?.message ?? 'Invalid show id', 'INVALID_INPUT');
    }

    const bodyParsed = cancelShowSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      throw new HttpError(400, bodyParsed.error.issues[0]?.message ?? 'Invalid request body', 'INVALID_INPUT');
    }

    const result = await cancelShowAndQueueCompensation({
      showId: paramsParsed.data.showId,
      reason: bodyParsed.data.reason,
    });

    res.status(200).json({ result });
  } catch (error) {
    next(error);
  }
}
