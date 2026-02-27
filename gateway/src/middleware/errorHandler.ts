import { Request, Response, NextFunction } from 'express';
import { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';

interface ErrorResponse {
  code: string;
  message: string;
  trace_id: string;
  details?: any;
}

/**
 * Global error handler middleware
 * Normalizes errors from internal services and network issues
 */
export function errorHandler(
  error: Error | AxiosError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Log error
  console.error(JSON.stringify({
    type: 'error',
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.path,
    error: error.message,
    stack: error.stack,
  }));

  // Handle Axios errors (from internal service calls)
  if ('isAxiosError' in error && error.isAxiosError) {
    const axiosError = error as AxiosError;
    
    // Service returned an error response
    if (axiosError.response) {
      const status = axiosError.response.status;
      const data = axiosError.response.data as any;
      
      // If service already returned normalized error, forward it
      if (data && typeof data === 'object' && data.code && data.message) {
        res.status(status).json({
          code: data.code,
          message: data.message,
          trace_id: data.trace_id || requestId,
          details: data.details,
        } as ErrorResponse);
        return;
      }
      
      // Map HTTP status to error code
      const errorResponse: ErrorResponse = {
        code: getErrorCode(status),
        message: data?.message || `Internal service error`,
        trace_id: requestId,
        details: { status },
      };
      
      res.status(status).json(errorResponse);
      return;
    }
    
    // Network error (service unreachable)
    if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
      res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Internal service is temporarily unavailable',
        trace_id: requestId,
        details: { error: 'Service unreachable' },
      } as ErrorResponse);
      return;
    }
    
    // Timeout error
    if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
      res.status(504).json({
        code: 'TIMEOUT',
        message: 'Request to internal service timed out',
        trace_id: requestId,
      } as ErrorResponse);
      return;
    }
  }
  
  // Generic error
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    trace_id: requestId,
  } as ErrorResponse);
}

/**
 * Map HTTP status codes to error codes
 */
function getErrorCode(status: number): string {
  const codeMap: { [key: number]: string } = {
    400: 'INVALID_INPUT',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    413: 'FILE_TOO_LARGE',
    422: 'INVALID_INPUT',
    429: 'RATE_LIMIT_EXCEEDED',
    500: 'INTERNAL_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'TIMEOUT',
  };
  
  return codeMap[status] || 'INTERNAL_ERROR';
}
