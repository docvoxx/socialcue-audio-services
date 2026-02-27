import { Request, Response, NextFunction } from 'express';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('STT Service error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
  });

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let retryable = true;

  // Handle specific error types
  if (error.message.includes('Invalid audio format')) {
    statusCode = 400;
    errorCode = 'INVALID_FORMAT';
    message = 'Invalid audio format';
    retryable = false;
  } else if (error.message.includes('Audio file too large')) {
    statusCode = 413;
    errorCode = 'FILE_TOO_LARGE';
    message = 'Audio file too large';
    retryable = false;
  } else if (error.message.includes('Audio too long')) {
    statusCode = 400;
    errorCode = 'AUDIO_TOO_LONG';
    message = error.message;
    retryable = false;
  } else if (error.message.includes('Whisper')) {
    statusCode = 503;
    errorCode = 'MODEL_UNAVAILABLE';
    message = 'Speech recognition service temporarily unavailable';
    retryable = true;
  } else if (error.message.includes('timeout')) {
    statusCode = 504;
    errorCode = 'TIMEOUT';
    message = 'Request timeout';
    retryable = true;
  }

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: isDevelopment ? error.message : message,
      retryable,
      trace_id: req.headers['x-trace-id'] || 'unknown',
    },
    timestamp: new Date().toISOString(),
    request_id: req.headers['x-request-id'] || 'unknown',
  });
}