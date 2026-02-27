import { Request, Response, NextFunction } from 'express';
import { createClient, RedisClientType } from 'redis';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('tts-service');

export class IdempotencyMiddleware {
  private redisClient: RedisClientType | null = null;
  private readonly TTL = 60; // 60 seconds

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redisClient = createClient({ url: redisUrl }) as RedisClientType;
      
      this.redisClient.on('error', (err: Error) => {
        logger.error('Idempotency Redis client error:', err);
      });
      
      await this.redisClient.connect();
      logger.info('Idempotency Redis client connected');
    } catch (error) {
      logger.error('Failed to initialize idempotency Redis client:', error);
    }
  }

  /**
   * Middleware to handle idempotency for TTS requests
   */
  handle() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const idempotencyKey = req.headers['x-idempotency-key'] as string;

      // If no idempotency key, proceed normally
      if (!idempotencyKey) {
        return next();
      }

      // Check if we have a cached response
      try {
        if (this.redisClient && this.redisClient.isOpen) {
          const cacheKey = `idempotency:tts:${idempotencyKey}`;
          const cachedData = await this.redisClient.get(cacheKey);

          if (cachedData) {
            // Return cached response
            const cached = JSON.parse(cachedData);
            logger.info('Returning cached response for idempotency key', {
              idempotency_key: idempotencyKey
            });

            // Set cached headers
            if (cached.headers) {
              Object.entries(cached.headers).forEach(([key, value]) => {
                res.setHeader(key, value as string);
              });
            }

            // Handle binary audio data
            if (cached.isAudio && cached.body) {
              const audioBuffer = Buffer.from(cached.body, 'base64');
              return res.status(cached.statusCode || 200).send(audioBuffer);
            }

            // Handle JSON responses (errors)
            return res.status(cached.statusCode || 200).json(cached.body);
          }
        }
      } catch (error) {
        logger.error('Error checking idempotency cache:', error);
        // Continue with request if cache check fails
      }

      // Intercept response to cache it
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = (body: any) => {
        this.cacheResponse(idempotencyKey, res.statusCode, body, {
          'Content-Type': 'application/json',
          'X-Trace-Id': res.getHeader('X-Trace-Id') as string,
          'X-Service-Status': res.getHeader('X-Service-Status') as string
        }, false);
        return originalJson(body);
      };

      res.send = (body: any) => {
        const contentType = res.getHeader('Content-Type') as string;
        const isAudio = Boolean(contentType && (contentType.includes('audio/') || contentType.includes('application/octet-stream')));
        
        this.cacheResponse(idempotencyKey, res.statusCode, body, {
          'Content-Type': contentType,
          'X-Trace-Id': res.getHeader('X-Trace-Id') as string,
          'X-Service-Status': res.getHeader('X-Service-Status') as string
        }, isAudio);
        return originalSend(body);
      };

      next();
    };
  }

  private async cacheResponse(
    idempotencyKey: string,
    statusCode: number,
    body: any,
    headers: Record<string, string>,
    isAudio: boolean
  ) {
    try {
      if (this.redisClient && this.redisClient.isOpen) {
        const cacheKey = `idempotency:tts:${idempotencyKey}`;
        
        // Convert audio buffer to base64 for storage
        const bodyToStore = isAudio && Buffer.isBuffer(body) 
          ? body.toString('base64')
          : body;

        const cacheData = JSON.stringify({
          statusCode,
          body: bodyToStore,
          headers: Object.fromEntries(
            Object.entries(headers).filter(([_, v]) => v !== undefined)
          ),
          isAudio,
          timestamp: Date.now()
        });

        await this.redisClient.setEx(cacheKey, this.TTL, cacheData);
        
        logger.info('Cached response for idempotency key', {
          idempotency_key: idempotencyKey,
          ttl: this.TTL,
          is_audio: isAudio
        });
      }
    } catch (error) {
      logger.error('Error caching idempotency response:', error);
      // Don't fail the request if caching fails
    }
  }

  async cleanup() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}
