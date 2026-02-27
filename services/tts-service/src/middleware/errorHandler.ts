import { Request, Response, NextFunction } from 'express';
import { logger } from '@socialcue-audio-services/shared';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  logger.error('TTS Service Error', {
    error: message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id']
  });

  res.status(statusCode).json({
    error: {
      code: err.name || 'INTERNAL_ERROR',
      message,
      retryable: statusCode >= 500,
      trace_id: req.headers['x-request-id']
    },
    timestamp: new Date().toISOString(),
    request_id: req.headers['x-request-id']
  });
};