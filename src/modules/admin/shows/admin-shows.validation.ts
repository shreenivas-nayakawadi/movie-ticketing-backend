import { z } from 'zod';

export const adminShowIdParamSchema = z.object({
  showId: z.string().min(1),
});

export const cancelShowSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
