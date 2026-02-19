import { randomUUID } from 'crypto';
import { env } from '../../config/env';

export type RefundRequest = {
  bookingId: string;
  showId: string;
  providerReference: string;
  amount: number;
  currency: string;
  idempotencyKey?: string;
};

export type RefundResult = {
  success: boolean;
  externalId?: string;
  error?: string;
};

// Trigger payment refund using external gateway; in local mode returns mock success.
export async function processRefund(request: RefundRequest): Promise<RefundResult> {
  if (!env.REFUND_GATEWAY_URL) {
    return {
      success: true,
      externalId: `mock-refund-${randomUUID()}`,
    };
  }

  const response = await fetch(env.REFUND_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.REFUND_GATEWAY_API_KEY
        ? { Authorization: `Bearer ${env.REFUND_GATEWAY_API_KEY}` }
        : {}),
      'Idempotency-Key': request.idempotencyKey ?? `${request.showId}:${request.bookingId}`,
    },
    body: JSON.stringify({
      bookingId: request.bookingId,
      showId: request.showId,
      providerReference: request.providerReference,
      amount: request.amount,
      currency: request.currency,
    }),
  });

  if (response.status >= 200 && response.status < 300) {
    let externalId: string | undefined;
    try {
      const json = (await response.json()) as { refundId?: string; id?: string };
      externalId = json.refundId ?? json.id;
    } catch {
      externalId = undefined;
    }

    return {
      success: true,
      externalId: externalId ?? `refund-${randomUUID()}`,
    };
  }

  let errorBody = '';
  try {
    errorBody = await response.text();
  } catch {
    errorBody = '';
  }

  return {
    success: false,
    error: `Refund gateway failed with status ${response.status}${errorBody ? `: ${errorBody}` : ''}`,
  };
}
