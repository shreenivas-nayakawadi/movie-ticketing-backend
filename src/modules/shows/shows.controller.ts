import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error';
import { getShowSeatMap } from './shows.service';

const showIdParamSchema = z.object({
  showId: z.string().min(1),
});

// Validate show id and return seat map from service layer.
export async function getShowSeatsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = showIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid show id', 'INVALID_INPUT');
    }

    const seatMap = await getShowSeatMap(parsed.data.showId);
    res.status(200).json(seatMap);
  } catch (error) {
    next(error);
  }
}
