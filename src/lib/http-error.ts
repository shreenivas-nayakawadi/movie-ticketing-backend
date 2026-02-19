// Domain-friendly error type carrying HTTP status + machine-readable code.
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  // Build a typed application error for controller/service layers.
  constructor(statusCode: number, message: string, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
