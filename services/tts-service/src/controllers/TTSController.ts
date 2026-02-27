import { Request, Response } from 'express';
import { createClient } from 'redis';
import { logger } from '@socialcue-audio-services/shared';
import { TTSRequestSchema } from '@socialcue-audio-services/shared';
import { TTSService } from '../services/TTSService';
import { AudioFileManager } from '../services/AudioFileManager';
import { CleanupScheduler } from '../services/CleanupScheduler';

type RedisClient = ReturnType<typeof createClient>;

export class TTSController {
  private ttsService: TTSService;
  private audioFileManager: AudioFileManager;
  private cleanupScheduler: CleanupScheduler;

  constructor(redis: RedisClient) {
    this.audioFileManager = new AudioFileManager();
    this.ttsService = new TTSService(redis);
    this.cleanupScheduler = new CleanupScheduler(redis, this.audioFileManager);
    
    // Start cleanup scheduler
    this.cleanupScheduler.start();
  }

  async synthesize(req: Request, res: Response): Promise<void> {
    try {
      const requestId = req.headers['x-request-id'] as string;
      
      // Validate request
      const validatedRequest = TTSRequestSchema.parse(req.body);
      
      logger.info('TTS synthesis request', {
        requestId,
        textLength: validatedRequest.text.length,
        voice: validatedRequest.voice,
        speed: validatedRequest.speed,
        format: validatedRequest.format
      });

      // Generate audio
      const response = await this.ttsService.synthesize(validatedRequest, requestId);
      
      res.json(response);
    } catch (error) {
      logger.error('TTS synthesis error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id']
      });
      
      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request format',
            retryable: false,
            trace_id: req.headers['x-request-id']
          }
        });
        return;
      }
      
      res.status(500).json({
        error: {
          code: 'TTS_ERROR',
          message: 'Failed to synthesize audio',
          retryable: true,
          trace_id: req.headers['x-request-id']
        }
      });
    }
  }

  async getAudio(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;
      const requestId = req.headers['x-request-id'] as string;
      
      logger.info('Audio file request', {
        requestId,
        filename
      });

      const audioPath = await this.audioFileManager.getAudioFile(filename);
      
      if (!audioPath) {
        res.status(404).json({
          error: {
            code: 'AUDIO_NOT_FOUND',
            message: 'Audio file not found',
            retryable: false,
            trace_id: requestId
          }
        });
        return;
      }

      // Set appropriate headers for audio streaming
      const format = filename.endsWith('.wav') ? 'wav' : 'mp3';
      res.setHeader('Content-Type', format === 'wav' ? 'audio/wav' : 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      
      // Stream the audio file
      res.sendFile(audioPath);
      
    } catch (error) {
      logger.error('Audio file retrieval error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id'],
        filename: req.params.filename
      });
      
      res.status(500).json({
        error: {
          code: 'AUDIO_RETRIEVAL_ERROR',
          message: 'Failed to retrieve audio file',
          retryable: true,
          trace_id: req.headers['x-request-id']
        }
      });
    }
  }

  async deleteAudio(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;
      const requestId = req.headers['x-request-id'] as string;
      
      logger.info('Audio file deletion request', {
        requestId,
        filename
      });

      const deleted = await this.audioFileManager.deleteAudioFile(filename);
      
      if (!deleted) {
        res.status(404).json({
          error: {
            code: 'AUDIO_NOT_FOUND',
            message: 'Audio file not found',
            retryable: false,
            trace_id: requestId
          }
        });
        return;
      }

      res.json({
        message: 'Audio file deleted successfully',
        filename
      });
      
    } catch (error) {
      logger.error('Audio file deletion error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id'],
        filename: req.params.filename
      });
      
      res.status(500).json({
        error: {
          code: 'AUDIO_DELETION_ERROR',
          message: 'Failed to delete audio file',
          retryable: true,
          trace_id: req.headers['x-request-id']
        }
      });
    }
  }

  async saveAudio(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;
      const requestId = req.headers['x-request-id'] as string;
      
      logger.info('Audio file save request', {
        requestId,
        filename
      });

      // Check if file exists
      const audioPath = await this.audioFileManager.getAudioFile(filename);
      if (!audioPath) {
        res.status(404).json({
          error: {
            code: 'AUDIO_NOT_FOUND',
            message: 'Audio file not found',
            retryable: false,
            trace_id: requestId
          }
        });
        return;
      }

      // Mark file as saved
      await this.cleanupScheduler.markFileAsSaved(filename);

      res.json({
        message: 'Audio file marked as saved',
        filename,
        saved: true
      });
      
    } catch (error) {
      logger.error('Audio file save error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id'],
        filename: req.params.filename
      });
      
      res.status(500).json({
        error: {
          code: 'AUDIO_SAVE_ERROR',
          message: 'Failed to save audio file',
          retryable: true,
          trace_id: req.headers['x-request-id']
        }
      });
    }
  }

  async unsaveAudio(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;
      const requestId = req.headers['x-request-id'] as string;
      
      logger.info('Audio file unsave request', {
        requestId,
        filename
      });

      // Check if file is currently saved
      const isSaved = await this.cleanupScheduler.isFileSaved(filename);
      if (!isSaved) {
        res.status(404).json({
          error: {
            code: 'AUDIO_NOT_SAVED',
            message: 'Audio file is not marked as saved',
            retryable: false,
            trace_id: requestId
          }
        });
        return;
      }

      // Unmark file as saved and reschedule for cleanup
      await this.cleanupScheduler.unmarkFileAsSaved(filename);

      res.json({
        message: 'Audio file unmarked as saved and scheduled for cleanup',
        filename,
        saved: false
      });
      
    } catch (error) {
      logger.error('Audio file unsave error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id'],
        filename: req.params.filename
      });
      
      res.status(500).json({
        error: {
          code: 'AUDIO_UNSAVE_ERROR',
          message: 'Failed to unsave audio file',
          retryable: true,
          trace_id: req.headers['x-request-id']
        }
      });
    }
  }

  async getAudioInfo(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;
      const requestId = req.headers['x-request-id'] as string;
      
      logger.info('Audio file info request', {
        requestId,
        filename
      });

      const [fileInfo, isSaved] = await Promise.all([
        this.audioFileManager.getFileInfo(filename),
        this.cleanupScheduler.isFileSaved(filename)
      ]);

      if (!fileInfo || !fileInfo.exists) {
        res.status(404).json({
          error: {
            code: 'AUDIO_NOT_FOUND',
            message: 'Audio file not found',
            retryable: false,
            trace_id: requestId
          }
        });
        return;
      }

      res.json({
        filename,
        size: fileInfo.size,
        format: fileInfo.format,
        createdAt: fileInfo.createdAt.toISOString(),
        saved: isSaved,
        exists: fileInfo.exists
      });
      
    } catch (error) {
      logger.error('Audio file info error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id'],
        filename: req.params.filename
      });
      
      res.status(500).json({
        error: {
          code: 'AUDIO_INFO_ERROR',
          message: 'Failed to get audio file info',
          retryable: true,
          trace_id: req.headers['x-request-id']
        }
      });
    }
  }

  async getCleanupStats(req: Request, res: Response): Promise<void> {
    try {
      const requestId = req.headers['x-request-id'] as string;
      
      logger.info('Cleanup stats request', { requestId });

      const stats = await this.cleanupScheduler.getCleanupStats();

      res.json({
        totalScheduled: stats.totalScheduled,
        totalSaved: stats.totalSaved,
        nextCleanupTime: stats.nextCleanupTime?.toISOString() || null
      });
      
    } catch (error) {
      logger.error('Cleanup stats error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id']
      });
      
      res.status(500).json({
        error: {
          code: 'CLEANUP_STATS_ERROR',
          message: 'Failed to get cleanup statistics',
          retryable: true,
          trace_id: req.headers['x-request-id']
        }
      });
    }
  }
}