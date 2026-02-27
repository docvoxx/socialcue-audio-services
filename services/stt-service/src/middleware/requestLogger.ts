import { Request, Response, NextFunction } from 'express';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const traceId = req.headers['x-trace-id'] || requestId;

  // Add IDs to request for downstream use
  req.headers['x-request-id'] = requestId as string;
  req.headers['x-trace-id'] = traceId as string;

  // Log request start
  logger.info('STT request started', {
    method: req.method,
    url: req.url,
    user_agent: req.headers['user-agent'],
    content_type: req.headers['content-type'],
    content_length: req.headers['content-length'],
    request_id: requestId,
    trace_id: traceId,
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const duration = Date.now() - startTime;
    
    logger.info('STT request completed', {
      method: req.method,
      url: req.url,
      status_code: res.statusCode,
      duration_ms: duration,
      request_id: requestId,
      trace_id: traceId,
      response_size: JSON.stringify(body).length,
    });

    return originalJson.call(this, body);
  };

  // Handle response end for non-JSON responses
  res.on('finish', () => {
    if (!res.headersSent) return;
    
    const duration = Date.now() - startTime;
    
    logger.info('STT request finished', {
      method: req.method,
      url: req.url,
      status_code: res.statusCode,
      duration_ms: duration,
      request_id: requestId,
      trace_id: traceId,
    });
  });

  next();
}