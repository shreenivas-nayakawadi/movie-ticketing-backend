import { randomUUID } from 'crypto';

export type MockPaymentMethod = 'MOCK_CARD' | 'MOCK_UPI' | 'MOCK_NETBANKING' | 'MOCK_FAIL';

export type MockPaymentRequest = {
  amountCents: number;
  currency: string;
  method: MockPaymentMethod;
  idempotencyKey?: string;
  holdId: string;
};

export type MockPaymentResult = {
  success: boolean;
  provider: string;
  providerReference: string;
  status: 'CAPTURED' | 'FAILED';
  failureReason?: string;
  metadata: Record<string, string | number | boolean | null>;
};

const PROVIDER_NAME = 'MOCK_GATEWAY';

// Simulate payment authorization/capture without calling any external gateway.
export async function chargeWithMockGateway(
  request: MockPaymentRequest,
): Promise<MockPaymentResult> {
  if (request.method === 'MOCK_FAIL') {
    return {
      success: false,
      provider: PROVIDER_NAME,
      providerReference: `mock-failed-${request.holdId}-${randomUUID()}`,
      status: 'FAILED',
      failureReason: 'Mocked payment failure',
      metadata: {
        holdId: request.holdId,
        idempotencyKey: request.idempotencyKey ?? null,
        method: request.method,
      },
    };
  }

  return {
    success: true,
    provider: PROVIDER_NAME,
    providerReference: `mock-cap-${request.holdId}-${randomUUID()}`,
    status: 'CAPTURED',
    metadata: {
      holdId: request.holdId,
      idempotencyKey: request.idempotencyKey ?? null,
      method: request.method,
    },
  };
}
