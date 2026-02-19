import { z } from 'zod';

export const customerEmailParamSchema = z.object({
  email: z.string().email(),
});
