import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { STTController } from './controllers/STTController';
import { HealthController } from './controllers/HealthController';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { IdempotencyMiddleware } from './middleware/idempotency';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

const app = express();
const port = process.env.PORT || 3005;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(requestLogger);

// Controllers
const sttController = new STTController();
const healthController = new HealthController();
const idempotencyMiddleware = new IdempotencyMiddleware();

// Health routes (no idempotency)
app.get('/health/live', healthController.live.bind(healthController));
app.get('/health/ready', healthController.ready.bind(healthController));
app.get('/health', healthController.health.bind(healthController));

// STT routes (with idempotency for transcribe endpoint)
app.post('/transcribe', idempotencyMiddleware.handle(), sttController.transcribe.bind(sttController));
app.post('/stream/start', sttController.startStream.bind(sttController));
app.post('/stream/chunk', sttController.processStreamChunk.bind(sttController));
app.post('/stream/end', sttController.endStream.bind(sttController));
app.get('/stats', sttController.getPerformanceStats.bind(sttController));

// Error handling
app.use(errorHandler);

const server = createServer(app);

server.listen(port, () => {
  logger.info(`STT Service listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await healthController.cleanup();
  await idempotencyMiddleware.cleanup();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app };