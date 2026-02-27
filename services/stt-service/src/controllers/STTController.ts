import { Request, Response } from 'express';
import { STTService } from '../services/STTService';
import { StreamingProcessor } from '../services/StreamingProcessor';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['audio/wav', 'audio/mpeg', 'audio/webm', 'audio/mp3'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format'));
    }
  },
});

export class STTController {
  private sttService: STTService;
  private streamingProcessor: StreamingProcessor;

  constructor() {
    this.sttService = new STTService();
    this.streamingProcessor = new StreamingProcessor();
  }

  async transcribe(req: Request, res: Response): Promise<void> {
    const uploadMiddleware = upload.single('audio');
    
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        logger.error('File upload error:', err);
        res.status(400).json({
          error: {
            code: 'UPLOAD_ERROR',
            message: err.message,
            retryable: false,
          },
        });
        return;
      }

      try {
        const startTime = Date.now();
        
        if (!req.file) {
          res.status(400).json({
            error: {
              code: 'NO_AUDIO_FILE',
              message: 'No audio file provided',
              retryable: false,
            },
          });
          return;
        }

        const { dialect_hint, language = 'vi' } = req.body;
        
        // Determine format from mimetype
        let format: 'wav' | 'mp3' | 'webm' = 'wav';
        if (req.file.mimetype.includes('mpeg') || req.file.mimetype.includes('mp3')) {
          format = 'mp3';
        } else if (req.file.mimetype.includes('webm')) {
          format = 'webm';
        }

        const result = await this.sttService.transcribe({
          audio_data: req.file.buffer.buffer as ArrayBuffer,
          format,
          language: language as 'vi',
          dialect_hint: dialect_hint as 'north' | 'central' | 'south' | undefined,
        });

        const processingTime = Date.now() - startTime;
        
        logger.info('STT transcription completed', {
          confidence: result.confidence,
          processing_time_ms: processingTime,
          text_length: result.text.length,
        });

        res.json({
          ...result,
          processing_time_ms: processingTime,
        });
      } catch (error) {
        logger.error('STT transcription error:', error);
        res.status(500).json({
          error: {
            code: 'TRANSCRIPTION_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          },
        });
      }
    });
  }

  async startStream(req: Request, res: Response): Promise<void> {
    try {
      const { stream_id, language = 'vi' } = req.body;
      
      if (!stream_id) {
        res.status(400).json({
          error: {
            code: 'MISSING_STREAM_ID',
            message: 'Stream ID is required',
            retryable: false,
          },
        });
        return;
      }

      await this.streamingProcessor.startStream(stream_id, language);
      
      res.json({
        stream_id,
        status: 'started',
        language,
      });
    } catch (error) {
      logger.error('Failed to start streaming:', error);
      res.status(500).json({
        error: {
          code: 'STREAM_START_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
      });
    }
  }

  async processStreamChunk(req: Request, res: Response): Promise<void> {
    const uploadMiddleware = upload.single('audio_chunk');
    
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        logger.error('Stream chunk upload error:', err);
        res.status(400).json({
          error: {
            code: 'UPLOAD_ERROR',
            message: err.message,
            retryable: false,
          },
        });
        return;
      }

      try {
        const { stream_id, chunk_id, timestamp, is_last = false } = req.body;
        
        if (!stream_id || !chunk_id || !req.file) {
          res.status(400).json({
            error: {
              code: 'INVALID_CHUNK_DATA',
              message: 'Stream ID, chunk ID, and audio data are required',
              retryable: false,
            },
          });
          return;
        }

        const result = await this.streamingProcessor.processChunk(stream_id, {
          id: chunk_id,
          audio: req.file.buffer.buffer as ArrayBuffer,
          timestamp: parseInt(timestamp) || Date.now(),
          isLast: is_last === 'true' || is_last === true,
        });

        res.json(result);
      } catch (error) {
        logger.error('Stream chunk processing error:', error);
        res.status(500).json({
          error: {
            code: 'CHUNK_PROCESSING_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          },
        });
      }
    });
  }

  async endStream(req: Request, res: Response): Promise<void> {
    try {
      const { stream_id } = req.body;
      
      if (!stream_id) {
        res.status(400).json({
          error: {
            code: 'MISSING_STREAM_ID',
            message: 'Stream ID is required',
            retryable: false,
          },
        });
        return;
      }

      await this.streamingProcessor.endStream(stream_id);
      
      res.json({
        stream_id,
        status: 'ended',
      });
    } catch (error) {
      logger.error('Failed to end streaming:', error);
      res.status(500).json({
        error: {
          code: 'STREAM_END_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
      });
    }
  }

  async getPerformanceStats(_req: Request, res: Response): Promise<void> {
    try {
      const report = await this.sttService.getPerformanceReport();
      res.json(report);
    } catch (error) {
      logger.error('Failed to get performance stats:', error);
      res.status(500).json({
        error: {
          code: 'STATS_ERROR',
          message: 'Failed to retrieve performance statistics',
          retryable: true,
        },
      });
    }
  }
}