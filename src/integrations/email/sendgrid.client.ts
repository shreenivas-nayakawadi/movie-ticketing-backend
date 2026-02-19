import { randomUUID } from 'crypto';
import { env } from '../../config/env';

type EmailAttachment = {
  filename: string;
  contentBase64: string;
  mimeType?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachment?: EmailAttachment;
  idempotencyKey?: string;
};

export type SendEmailResult = {
  success: boolean;
  externalId?: string;
  error?: string;
};

// Send ticket email using SendGrid, with mock success fallback in local/dev setup.
export async function sendEmailWithSendGrid(input: SendEmailInput): Promise<SendEmailResult> {
  if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
    return {
      success: true,
      externalId: `mock-email-${randomUUID()}`,
    };
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey ?? randomUUID(),
    },
    body: JSON.stringify({
      from: {
        email: env.SENDGRID_FROM_EMAIL,
      },
      personalizations: [
        {
          to: [{ email: input.to }],
          subject: input.subject,
        },
      ],
      content: [
        {
          type: 'text/plain',
          value: input.text,
        },
        ...(input.html
          ? [
              {
                type: 'text/html',
                value: input.html,
              },
            ]
          : []),
      ],
      attachments: input.attachment
        ? [
            {
              content: input.attachment.contentBase64,
              filename: input.attachment.filename,
              type: input.attachment.mimeType ?? 'application/pdf',
              disposition: 'attachment',
            },
          ]
        : [],
    }),
  });

  if (response.status >= 200 && response.status < 300) {
    return {
      success: true,
      externalId: response.headers.get('x-message-id') ?? `sendgrid-${randomUUID()}`,
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
    error: `SendGrid failed with status ${response.status}${errorBody ? `: ${errorBody}` : ''}`,
  };
}
