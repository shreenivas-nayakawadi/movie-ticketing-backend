import { randomUUID } from 'crypto';
import { env } from '../../config/env';

export type SendSmsInput = {
  recipient: string;
  message: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type SendSmsResult = {
  success: boolean;
  externalId?: string;
  error?: string;
};

// Send SMS via configured gateway; fallback to mock success when URL is not configured.
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  if (!env.SMS_GATEWAY_URL) {
    return {
      success: true,
      externalId: `mock-sms-${randomUUID()}`,
    };
  }

  const response = await fetch(env.SMS_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.SMS_GATEWAY_API_KEY ? { Authorization: `Bearer ${env.SMS_GATEWAY_API_KEY}` } : {}),
      'Idempotency-Key': input.idempotencyKey ?? randomUUID(),
    },
    body: JSON.stringify({
      to: input.recipient,
      message: input.message,
      metadata: input.metadata ?? {},
    }),
  });

  if (response.status >= 200 && response.status < 300) {
    let externalId: string | undefined;
    try {
      const json = (await response.json()) as { id?: string };
      externalId = json.id;
    } catch {
      externalId = undefined;
    }

    return {
      success: true,
      externalId: externalId ?? `sms-${randomUUID()}`,
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
    error: `SMS gateway failed with status ${response.status}${errorBody ? `: ${errorBody}` : ''}`,
  };
}
