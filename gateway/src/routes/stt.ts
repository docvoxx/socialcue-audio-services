import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import multer from 'multer';
import { config } from '../config';

const router = Router();

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

// Forward STT transcription requests to internal STT service
router.post('/transcribe', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = req.headers['x-request-id'] as string;
    const idempotencyKey = req.headers['x-idempotency-key'] as string;
    
    // Check if file was uploaded
    if (!req.file) {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'No audio file provided',
        trace_id: requestId,
      });
      return;
    }
    
    // Create form data for forwarding to internal service
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    
    // Add optional parameters
    if (req.body.language) {
      formData.append('language', req.body.language);
    }
    if (req.body.diarize) {
      formData.append('diarize', req.body.diarize);
    }
    
    // Prepare headers
    const headers: any = {
      ...formData.getHeaders(),
    };
    if (requestId) {
      headers['X-Request-Id'] = requestId;
    }
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    
    // Forward request to internal STT service
    const response = await axios.post(
      `${config.services.stt}/v1/stt/transcribe`,
      formData,
      {
        headers,
        timeout: config.timeouts.stt,
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
