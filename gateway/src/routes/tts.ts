import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config';

const router = Router();

// Forward TTS synthesis requests to internal TTS service
router.post('/synthesize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = req.headers['x-request-id'] as string;
    const idempotencyKey = req.headers['x-idempotency-key'] as string;
    
    // Prepare headers
    const headers: any = {
      'Content-Type': 'application/json',
    };
    if (requestId) {
      headers['X-Request-Id'] = requestId;
    }
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    
    // Forward request to internal TTS service
    const response = await axios.post(
      `${config.services.tts}/v1/tts/synthesize`,
      req.body,
      {
        headers,
        timeout: config.timeouts.tts,
        responseType: 'arraybuffer', // Handle binary audio response
      }
    );
    
    // Check if response is audio or JSON error
    const contentType = response.headers['content-type'];
    
    if (contentType && (contentType.includes('audio/') || contentType.includes('application/octet-stream'))) {
      // Binary audio response - forward as-is
      res.set('Content-Type', contentType);
      res.set('X-Trace-Id', response.headers['x-trace-id'] || requestId);
      res.set('X-Service-Name', config.serviceName);
      res.set('X-Service-Version', config.serviceVersion);
      
      if (response.headers['x-service-status']) {
        res.set('X-Service-Status', response.headers['x-service-status']);
      }
      
      res.status(response.status).send(Buffer.from(response.data));
    } else {
      // JSON response (likely an error)
      const jsonData = JSON.parse(response.data.toString());
      res.set('Content-Type', 'application/json');
      res.set('X-Trace-Id', jsonData.trace_id || requestId);
      res.set('X-Service-Name', config.serviceName);
      res.set('X-Service-Version', config.serviceVersion);
      res.status(response.status).json(jsonData);
    }
  } catch (error) {
    next(error);
  }
});

// Get available voices from internal TTS service
router.get('/voices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = req.headers['x-request-id'] as string;
    
    const response = await axios.get(
      `${config.services.tts}/v1/tts/voices`,
      {
        headers: requestId ? { 'X-Request-Id': requestId } : {},
        timeout: config.timeouts.tts,
      }
    );
    
    // Forward response with headers
    res.set('X-Trace-Id', response.data.trace_id || requestId);
    res.set('X-Service-Name', config.serviceName);
    res.set('X-Service-Version', config.serviceVersion);
    res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
});

export default router;
