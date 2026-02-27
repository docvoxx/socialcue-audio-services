import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to log all incoming requests with trace IDs
 * Generates X-Request-Id if not provided by client
 * Logs request method, path, and response time
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate or use existing request ID for tracing
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Store request ID in request object for use by other middleware
  req.headers['x-request-id'] = requestId;
  
  // Record start time for response time calculation
  const startTime = Date.now();
  
  // Log incoming request
  console.log(JSON.stringify({
    type: 'request',
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  }));
  
  // Capture the original res.json to log response
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const responseTime = Date.now() - startTime;
    
    // Log response
    console.log(JSON.stringify({
      type: 'response',
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
    }));
    
    // Set X-Request-Id header in response
    res.set('X-Request-Id', requestId);
    
    return originalJson(body);
  };
  
  next();
}
