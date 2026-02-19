import { z } from 'zod';

export const createHoldSchema = z.object({
  showId: z.string().min(1),
  customerEmail: z.string().email(),
  showSeatIds: z.array(z.string().min(1)).min(1).max(10),
});

export const holdIdParamSchema = z.object({
  holdId: z.string().min(1),
});
