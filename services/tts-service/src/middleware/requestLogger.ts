import { Request, Response, NextFunction } from 'express';
import { logger } from '@socialcue-audio-services/shared';
import { v4 as uuidv4 } from 'uuid';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  
  // Add request ID to headers for downstream services
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  // Log request
  logger.info('TTS Request', {
    method: req.method,
    path: req.path,
    requestId,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('TTS Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      requestId
    });
  });

  next();
};