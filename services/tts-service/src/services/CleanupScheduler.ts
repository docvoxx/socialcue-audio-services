import { createClient } from 'redis';
import { logger } from '@socialcue-audio-services/shared';
import { AudioFileManager } from './AudioFileManager';

type RedisClient = ReturnType<typeof createClient>;

export class CleanupScheduler {
  private redis: RedisClient;
  private audioFileManager: AudioFileManager;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(redis: RedisClient, audioFileManager: AudioFileManager) {
    this.redis = redis;
    this.audioFileManager = audioFileManager;
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('Cleanup scheduler already running', { service: 'tts-service' });
      return;
    }

    this.isRunning = true;
    
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      await this.performCleanup();
    }, 60 * 60 * 1000); // 1 hour

    // Run initial cleanup
    this.performCleanup();

    logger.info('Cleanup scheduler started', { service: 'tts-service' });
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    logger.info('Cleanup scheduler stopped', { service: 'tts-service' });
  }

  async performCleanup(): Promise<void> {
    try {
      logger.info('Starting scheduled cleanup', { service: 'tts-service' });
      
      // Get files scheduled for cleanup
      const now = Date.now();
      const expiredFiles = await this.redis.zRangeByScore('tts:cleanup', 0, now);
      
      let deletedCount = 0;
      let savedCount = 0;
      
      for (const filename of expiredFiles) {
        try {
          // Check if file is marked as saved
          const isSaved = await this.isFileSaved(filename);
          
          if (isSaved) {
            // Remove from cleanup queue but don't delete
            await this.redis.zRem('tts:cleanup', filename);
            savedCount++;
            logger.info('Skipped cleanup for saved file', { service: 'tts-service', filename });
          } else {
            // Delete the file
            const deleted = await this.audioFileManager.deleteAudioFile(filename);
            if (deleted) {
              await this.redis.zRem('tts:cleanup', filename);
              deletedCount++;
              logger.info('Cleaned up expired audio file', { service: 'tts-service', filename });
            }
          }
        } catch (error) {
          logger.warn('Failed to cleanup audio file', { 
            service: 'tts-service',
            error: error instanceof Error ? error.message : 'Unknown error',
            filename 
          });
        }
      }

      // Also perform general cleanup of old files (fallback)
      const generalCleanupCount = await this.audioFileManager.cleanupExpiredFiles(24);
      
      logger.info('Scheduled cleanup completed', {
        service: 'tts-service',
        expiredFilesProcessed: expiredFiles.length,
        deletedCount,
        savedCount,
        generalCleanupCount,
        totalDeleted: deletedCount + generalCleanupCount
      });
      
    } catch (error) {
      logger.error('Scheduled cleanup failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  async scheduleFileForCleanup(filename: string, cleanupTimeMs?: number): Promise<void> {
    try {
      // Default to 24 hours from now
      const cleanupTime = cleanupTimeMs || (Date.now() + (24 * 60 * 60 * 1000));
      
      await this.redis.zAdd('tts:cleanup', {
        score: cleanupTime,
        value: filename
      });
      
      logger.info('File scheduled for cleanup', {
        service: 'tts-service',
        filename,
        cleanupTime: new Date(cleanupTime).toISOString()
      });
    } catch (error) {
      logger.warn('Failed to schedule file for cleanup', {
        service: 'tts-service',
        error: error instanceof Error ? error.message : 'Unknown error',
        filename
      });
    }
  }

  async markFileAsSaved(filename: string): Promise<void> {
    try {
      // Add to saved files set
      await this.redis.sAdd('tts:saved_files', filename);
      
      // Remove from cleanup queue
      await this.redis.zRem('tts:cleanup', filename);
      
      logger.info('File marked as saved', { service: 'tts-service', filename });
    } catch (error) {
      logger.error('Failed to mark file as saved', error instanceof Error ? error : new Error(String(error)), {
        service: 'tts-service',
        filename
      });
      throw error;
    }
  }

  async unmarkFileAsSaved(filename: string): Promise<void> {
    try {
      // Remove from saved files set
      await this.redis.sRem('tts:saved_files', filename);
      
      // Reschedule for cleanup (24 hours from now)
      await this.scheduleFileForCleanup(filename);
      
      logger.info('File unmarked as saved and rescheduled for cleanup', { service: 'tts-service', filename });
    } catch (error) {
      logger.error('Failed to unmark file as saved', error instanceof Error ? error : new Error(String(error)), {
        service: 'tts-service',
        filename
      });
      throw error;
    }
  }

  async isFileSaved(filename: string): Promise<boolean> {
    try {
      return await this.redis.sIsMember('tts:saved_files', filename);
    } catch (error) {
      logger.warn('Failed to check if file is saved', {
        service: 'tts-service',
        error: error instanceof Error ? error.message : 'Unknown error',
        filename
      });
      return false; // Default to not saved
    }
  }

  async getSavedFiles(): Promise<string[]> {
    try {
      return await this.redis.sMembers('tts:saved_files');
    } catch (error) {
      logger.error('Failed to get saved files list', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async getScheduledCleanups(): Promise<Array<{ filename: string; cleanupTime: Date }>> {
    try {
      const scheduled = await this.redis.zRangeWithScores('tts:cleanup', 0, -1);
      
      return scheduled.map(item => ({
        filename: item.value,
        cleanupTime: new Date(item.score)
      }));
    } catch (error) {
      logger.error('Failed to get scheduled cleanups', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async getCleanupStats(): Promise<{
    totalScheduled: number;
    totalSaved: number;
    nextCleanupTime: Date | null;
  }> {
    try {
      const [totalScheduled, totalSaved, nextCleanup] = await Promise.all([
        this.redis.zCard('tts:cleanup'),
        this.redis.sCard('tts:saved_files'),
        this.redis.zRange('tts:cleanup', 0, 0, { BY: 'SCORE' })
      ]);

      return {
        totalScheduled,
        totalSaved,
        nextCleanupTime: nextCleanup.length > 0 ? 
          new Date(await this.redis.zScore('tts:cleanup', nextCleanup[0]) || 0) : 
          null
      };
    } catch (error) {
      logger.error('Failed to get cleanup stats', error instanceof Error ? error : new Error(String(error)));
      return {
        totalScheduled: 0,
        totalSaved: 0,
        nextCleanupTime: null
      };
    }
  }
}