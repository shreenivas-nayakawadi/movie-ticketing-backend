import { z } from 'zod';

const concessionSchema = z.object({
  itemCode: z.string().min(1),
  quantity: z.number().int().positive().max(20),
});

export const checkoutBookingSchema = z.object({
  holdId: z.string().min(1),
  concessions: z.array(concessionSchema).max(10).default([]),
  redeemPoints: z.number().int().min(0).default(0),
  paymentMethod: z
    .enum(['MOCK_CARD', 'MOCK_UPI', 'MOCK_NETBANKING', 'MOCK_FAIL'])
    .default('MOCK_CARD'),
  customerPhone: z.string().min(7).max(20).optional(),
});

export const bookingIdParamSchema = z.object({
  bookingId: z.string().min(1),
});
