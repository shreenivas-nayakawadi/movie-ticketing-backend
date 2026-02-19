import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http-error';

// Return a consistent 404 payload when no route matches the request.
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    code: 'ROUTE_NOT_FOUND',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

// Convert thrown errors into standardized API error responses.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ code: err.code, message: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ code: 'INTERNAL_ERROR', message });
}
