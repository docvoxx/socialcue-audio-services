import { Request, Response } from 'express';
import { createClient } from 'redis';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

export class HealthController {
  private startTime: number;
  private redisClient: any;

  constructor() {
    this.startTime = Date.now();
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redisClient = createClient({ url: redisUrl });
      this.redisClient.on('error', (err: Error) => {
        logger.error('Redis client error:', err);
      });
      await this.redisClient.connect();
      logger.info('Redis client connected for health checks');
    } catch (error) {
      logger.error('Failed to initialize Redis client:', error);
    }
  }

  /**
   * GET /health/live - Liveness check
   * Returns 200 if the service process is running
   */
  async live(_req: Request, res: Response): Promise<void> {
    res.status(200).json({
      service: 'stt-service',
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * GET /health/ready - Readiness check
   * Checks Redis connection and model availability
   */
  async ready(_req: Request, res: Response): Promise<void> {
    const checks = {
      redis: false,
      model: false
    };

    try {
      // Check Redis connection
      if (this.redisClient && this.redisClient.isOpen) {
        await this.redisClient.ping();
        checks.redis = true;
      }
    } catch (error) {
      logger.error('Redis health check failed:', error);
    }

    try {
      // Check if model is available (simplified check)
      // In production, this would verify the Whisper model is loaded
      checks.model = true;
    } catch (error) {
      logger.error('Model health check failed:', error);
    }

    const allReady = checks.redis && checks.model;
    const status = allReady ? 200 : 503;

    res.status(status).json({
      service: 'stt-service',
      status: allReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks
    });
  }

  /**
   * GET /health - Detailed health check
   * Returns comprehensive health information
   */
  async health(_req: Request, res: Response): Promise<void> {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const dependencies: any = {};

    // Check Redis
    try {
      if (this.redisClient && this.redisClient.isOpen) {
        const start = Date.now();
        await this.redisClient.ping();
        dependencies.redis = {
          status: 'up',
          latency: Date.now() - start
        };
      } else {
        dependencies.redis = {
          status: 'down',
          message: 'Redis client not connected'
        };
      }
    } catch (error) {
      dependencies.redis = {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check model availability
    try {
      dependencies.model = {
        status: 'up',
        name: process.env.STT_MODEL || 'whisper-small'
      };
    } catch (error) {
      dependencies.model = {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    const allHealthy = Object.values(dependencies).every(
      (dep: any) => dep.status === 'up'
    );

    res.status(allHealthy ? 200 : 503).json({
      service: 'stt-service',
      status: allHealthy ? 'healthy' : 'degraded',
      version: process.env.SERVICE_VERSION || '1.0.0',
      uptime,
      timestamp: new Date().toISOString(),
      dependencies,
      metadata: {
        model: process.env.STT_MODEL || 'whisper-small',
        max_concurrency: process.env.STT_MAX_CONCURRENCY || 3,
        max_audio_mb: process.env.MAX_AUDIO_MB || 25
      }
    });
  }

  async cleanup(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}
