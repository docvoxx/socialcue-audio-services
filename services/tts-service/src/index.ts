import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createClient } from 'redis';
import { logger } from '@socialcue-audio-services/shared';
import { TTSController } from './controllers/TTSController';
import { HealthController } from './controllers/HealthController';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { IdempotencyMiddleware } from './middleware/idempotency';

const app = express();
const PORT = process.env.PORT || 3006;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Redis client
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

// Initialize Redis connection
redis.connect().catch((err) => {
  logger.error('Failed to connect to Redis', err);
});

// Controllers
const ttsController = new TTSController(redis);
const healthController = new HealthController();
const idempotencyMiddleware = new IdempotencyMiddleware();

// Health routes (no idempotency)
app.get('/health/live', healthController.live.bind(healthController));
app.get('/health/ready', healthController.ready.bind(healthController));
app.get('/health', healthController.health.bind(healthController));

// TTS routes (with idempotency for synthesize endpoint)
app.post('/synthesize', idempotencyMiddleware.handle(), ttsController.synthesize.bind(ttsController));
app.get('/audio/:filename', ttsController.getAudio.bind(ttsController));
app.delete('/audio/:filename', ttsController.deleteAudio.bind(ttsController));
app.post('/audio/:filename/save', ttsController.saveAudio.bind(ttsController));
app.delete('/audio/:filename/save', ttsController.unsaveAudio.bind(ttsController));
app.get('/audio/:filename/info', ttsController.getAudioInfo.bind(ttsController));
app.get('/cleanup/stats', ttsController.getCleanupStats.bind(ttsController));

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`TTS Service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await healthController.cleanup();
  await idempotencyMiddleware.cleanup();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await healthController.cleanup();
  await idempotencyMiddleware.cleanup();
  await redis.quit();
  process.exit(0);
});