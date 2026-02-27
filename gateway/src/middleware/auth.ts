import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

/**
 * Middleware to authenticate API requests using Bearer token
 * Validates the API key against the configured list of valid keys
 */
export function authenticateAPIKey(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Check if Authorization header is present
  if (!authHeader) {
    console.warn(`Authentication failed: Missing Authorization header from ${req.ip}`, {
      path: req.path,
      method: req.method,
      requestId,
    });
    
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Missing Authorization header',
      trace_id: requestId,
    });
    return;
  }
  
  // Check if Authorization header has Bearer scheme
  if (!authHeader.startsWith('Bearer ')) {
    console.warn(`Authentication failed: Invalid Authorization header format from ${req.ip}`, {
      path: req.path,
      method: req.method,
      requestId,
    });
    
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Invalid Authorization header format. Expected: Bearer <token>',
      trace_id: requestId,
    });
    return;
  }
  
  // Extract token from Bearer scheme
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  // Validate token against configured API keys
  if (!config.apiKeys.includes(token)) {
    console.warn(`Authentication failed: Invalid API key from ${req.ip}`, {
      path: req.path,
      method: req.method,
      requestId,
      keyPrefix: token.substring(0, 8) + '...', // Log only prefix for security
    });
    
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Invalid API key',
      trace_id: requestId,
    });
    return;
  }
  
  // Authentication successful - proceed to next middleware
  next();
}
