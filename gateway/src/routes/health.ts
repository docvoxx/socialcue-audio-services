import { Router, Request, Response } from 'express';
import { HealthAggregator } from '../services/healthAggregator';
import { config } from '../config';

const router = Router();
const healthAggregator = new HealthAggregator();

// Liveness endpoint - simple check if service is running
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    service: config.serviceName,
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

// Readiness endpoint - check if service is ready to handle requests
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const health = await healthAggregator.aggregateHealth();
    const isReady = health.status === 'healthy';
    
    res.status(isReady ? 200 : 503).json({
      service: config.serviceName,
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      dependencies: health.dependencies,
    });
  } catch (error) {
    res.status(503).json({
      service: config.serviceName,
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Combined health endpoint - detailed health information
router.get('/', async (_req: Request, res: Response) => {
  try {
    const health = await healthAggregator.aggregateHealth();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      service: config.serviceName,
      status: 'unhealthy',
      version: config.serviceVersion,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
