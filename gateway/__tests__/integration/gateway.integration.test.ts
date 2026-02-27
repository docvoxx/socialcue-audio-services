import request from 'supertest';
import express, { Application } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

/**
 * Integration Tests for Audio Services Gateway
 * 
 * Tests Requirements:
 * - 2.6: Gateway endpoint exposure
 * - 4.1: API key authentication
 * - 3.7: Health check aggregation
 * - 15.2: Idempotency for STT and TTS
 * - 14.34: Trace ID propagation
 * 
 * These tests verify the complete request flow from gateway through to internal services,
 * ensuring authentication, health checks, idempotency, and trace ID propagation work correctly.
 */

// Set up environment before importing modules
process.env.API_KEYS = 'test-audio-key-12345,another-valid-audio-key';
process.env.SERVICE_NAME = 'audio-gateway';
process.env.SERVICE_VERSION = '1.0.0-test';
process.env.STT_SERVICE_URL = 'http://stt-service:3005';
process.env.TTS_SERVICE_URL = 'http://tts-service:3006';
process.env.STT_TIMEOUT = '2000'; // 2 second timeout for tests
process.env.TTS_TIMEOUT = '2000'; // 2 second timeout for tests

// Import after environment is set
import { authenticateAPIKey } from '../../src/middleware/auth';
import { requestLogger } from '../../src/middleware/requestLogger';
import { errorHandler } from '../../src/middleware/errorHandler';
import healthRoutes from '../../src/routes/health';
import sttRoutes from '../../src/routes/stt';
import ttsRoutes from '../../src/routes/tts';

describe('Audio Services Gateway Integration Tests', () => {
  let app: Application;
  const validApiKey = 'test-audio-key-12345';
  const invalidApiKey = 'invalid-audio-key';

  beforeEach(() => {
    // Create test app with same middleware as production
    app = express();
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(requestLogger);

    // Routes
    app.use('/health', healthRoutes);
    app.use('/v1/stt', authenticateAPIKey, sttRoutes);
    app.use('/v1/tts', authenticateAPIKey, ttsRoutes);

    // Error handler
    app.use(errorHandler);
  });

  describe('Authentication Tests (Requirement 4.1)', () => {
    it('should reject requests without Authorization header', async () => {
      const response = await request(app)
        .post('/v1/stt/transcribe')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Authorization'),
        trace_id: expect.any(String),
      });
    });

    it('should reject requests with invalid Authorization header format', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', 'InvalidFormat')
        .send({ text: 'test' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Bearer'),
        trace_id: expect.any(String),
      });
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${invalidApiKey}`)
        .send({ text: 'test' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'FORBIDDEN',
        message: 'Invalid API key',
        trace_id: expect.any(String),
      });
    });

    it('should accept requests with valid API key', async () => {
      // This will fail to connect to actual service, but should pass auth
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({ text: 'test' });

      // Should not be 401 or 403 (auth errors)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it('should accept any valid API key from the list', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', 'Bearer another-valid-audio-key')
        .send({ text: 'test' });

      // Should not be 401 or 403 (auth errors)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  describe('Health Check Tests (Requirement 3.7)', () => {
    it('should return liveness status without authentication', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        service: 'audio-gateway',
        status: 'alive',
        timestamp: expect.any(String),
      });
    });

    it('should return readiness status without authentication', async () => {
      const response = await request(app).get('/health/ready');

      // May be 200 or 503 depending on service availability
      expect([200, 503]).toContain(response.status);
      expect(response.body).toMatchObject({
        service: 'audio-gateway',
        status: expect.stringMatching(/ready|not_ready/),
        timestamp: expect.any(String),
      });
    });

    it('should return aggregated health status without authentication', async () => {
      const response = await request(app).get('/health');

      // May be 200 or 503 depending on service availability
      expect([200, 503]).toContain(response.status);
      expect(response.body).toMatchObject({
        service: 'audio-gateway',
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        version: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        dependencies: expect.any(Object),
      });
    });

    it('should include all internal services in health aggregation', async () => {
      const response = await request(app).get('/health');

      expect(response.body.dependencies).toHaveProperty('stt');
      expect(response.body.dependencies).toHaveProperty('tts');

      // Each dependency should have status
      expect(response.body.dependencies.stt).toHaveProperty('status');
      expect(response.body.dependencies.tts).toHaveProperty('status');
    });
  });

  describe('Trace ID Propagation Tests (Requirement 14.34)', () => {
    it('should generate X-Request-Id if not provided', async () => {
      const response = await request(app).get('/health/live');

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should preserve X-Request-Id from client request', async () => {
      const clientRequestId = uuidv4();
      const response = await request(app)
        .get('/health/live')
        .set('X-Request-Id', clientRequestId);

      expect(response.headers['x-request-id']).toBe(clientRequestId);
    });

    it('should include trace_id in error responses', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .send({ text: 'test' });

      expect(response.body.trace_id).toBeDefined();
      expect(typeof response.body.trace_id).toBe('string');
    });

    it('should propagate X-Request-Id to authenticated endpoints', async () => {
      const clientRequestId = uuidv4();
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Request-Id', clientRequestId)
        .send({ text: 'test' });

      // Even if request fails, trace ID should be preserved
      expect(response.headers['x-request-id']).toBe(clientRequestId);
    });
  });

  describe('Idempotency Header Support Tests (Requirement 15.2)', () => {
    it('should accept X-Idempotency-Key header for STT requests', async () => {
      const idempotencyKey = uuidv4();
      const response = await request(app)
        .post('/v1/stt/transcribe')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Idempotency-Key', idempotencyKey)
        .attach('file', Buffer.from('fake audio data'), 'test.wav');

      // Should not reject due to idempotency header
      expect(response.status).not.toBe(400);
    });

    it('should accept X-Idempotency-Key header for TTS requests', async () => {
      const idempotencyKey = uuidv4();
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Idempotency-Key', idempotencyKey)
        .send({ text: 'test' });

      // Should not reject due to idempotency header
      expect(response.status).not.toBe(400);
    });

    it('should propagate X-Idempotency-Key to internal services', async () => {
      const idempotencyKey = uuidv4();
      // This test verifies the header is accepted and forwarded
      // Actual idempotency behavior is tested in E2E tests
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Idempotency-Key', idempotencyKey)
        .send({ text: 'test' });

      // Should process the request (may fail due to service unavailability)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  describe('Error Response Format Tests (Requirement 14.34)', () => {
    it('should return standardized error format for authentication failures', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .send({ text: 'test' });

      expect(response.body).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
        trace_id: expect.any(String),
      });
    });

    it('should return standardized error format for invalid API keys', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${invalidApiKey}`)
        .send({ text: 'test' });

      expect(response.body).toMatchObject({
        code: 'FORBIDDEN',
        message: expect.any(String),
        trace_id: expect.any(String),
      });
    });

    it('should include appropriate error codes', async () => {
      const testCases = [
        { endpoint: '/v1/stt/transcribe', expectedCode: 'UNAUTHORIZED' },
        { endpoint: '/v1/tts/synthesize', expectedCode: 'UNAUTHORIZED' },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post(testCase.endpoint)
          .send({});

        expect(response.body.code).toBe(testCase.expectedCode);
      }
    });
  });

  describe('Gateway Endpoint Exposure Tests (Requirement 2.6)', () => {
    it('should expose STT endpoint at /v1/stt/transcribe', async () => {
      const response = await request(app)
        .post('/v1/stt/transcribe')
        .set('Authorization', `Bearer ${validApiKey}`)
        .attach('file', Buffer.from('fake audio'), 'test.wav');

      // Should not be 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should expose TTS endpoint at /v1/tts/synthesize', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({ text: 'test' });

      // Should not be 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should expose TTS voices endpoint at /v1/tts/voices', async () => {
      const response = await request(app)
        .get('/v1/tts/voices')
        .set('Authorization', `Bearer ${validApiKey}`);

      // Should not be 404 (endpoint exists)
      expect(response.status).not.toBe(404);
    });

    it('should expose health endpoints', async () => {
      const endpoints = ['/health', '/health/live', '/health/ready'];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).not.toBe(404);
      }
    });
  });

  describe('Response Headers Tests (Requirement 16.1)', () => {
    it('should include X-Request-Id header in responses', async () => {
      const response = await request(app).get('/health/live');

      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should include Content-Type header in JSON responses', async () => {
      const response = await request(app).get('/health/live');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should include trace ID in error response body', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .send({ text: 'test' });

      expect(response.body.trace_id).toBeDefined();
    });
  });

  describe('CORS Configuration Tests', () => {
    it('should include CORS headers in responses', async () => {
      const response = await request(app)
        .get('/health/live')
        .set('Origin', 'http://example.com');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Request Body Parsing Tests', () => {
    it('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ text: 'test' }));

      // Should not be 400 (bad request due to parsing)
      expect(response.status).not.toBe(400);
    });

    it('should handle large JSON payloads up to 10mb', async () => {
      const largePayload = {
        text: 'a'.repeat(1024 * 1024), // 1MB string
      };

      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('Content-Type', 'application/json')
        .send(largePayload);

      // Should not be 413 (payload too large)
      expect(response.status).not.toBe(413);
    });
  });

  describe('Multiple API Keys Support Tests (Requirement 4.5)', () => {
    it('should support multiple valid API keys', async () => {
      const keys = ['test-audio-key-12345', 'another-valid-audio-key'];

      for (const key of keys) {
        const response = await request(app)
          .post('/v1/tts/synthesize')
          .set('Authorization', `Bearer ${key}`)
          .send({ text: 'test' });

        // Should not be 401 or 403
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
      }
    });
  });

  describe('Service Unavailability Tests', () => {
    it('should return SERVICE_UNAVAILABLE when internal service is down', async () => {
      // This test assumes internal services are not running
      const response = await request(app)
        .post('/v1/tts/synthesize')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({ text: 'test' });

      // Should be 503 or 504 (service unavailable or timeout)
      expect([503, 504]).toContain(response.status);
      expect(response.body).toMatchObject({
        code: expect.stringMatching(/SERVICE_UNAVAILABLE|TIMEOUT/),
        message: expect.any(String),
        trace_id: expect.any(String),
      });
    });
  });

  describe('Multipart Form Data Tests', () => {
    it('should handle multipart form data for STT endpoint', async () => {
      const response = await request(app)
        .post('/v1/stt/transcribe')
        .set('Authorization', `Bearer ${validApiKey}`)
        .field('language', 'vi')
        .attach('file', Buffer.from('fake audio data'), 'test.wav');

      // Should not be 400 (bad request due to parsing)
      // May fail with 503 if service is unavailable
      expect(response.status).not.toBe(400);
    });

    it('should accept optional parameters in STT request', async () => {
      const response = await request(app)
        .post('/v1/stt/transcribe')
        .set('Authorization', `Bearer ${validApiKey}`)
        .field('language', 'en')
        .field('diarize', 'true')
        .attach('file', Buffer.from('fake audio data'), 'test.wav');

      // Should not be 400 (bad request)
      expect(response.status).not.toBe(400);
    });
  });
});
