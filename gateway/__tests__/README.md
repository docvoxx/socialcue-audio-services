# Audio Services Gateway Tests

This directory contains integration and end-to-end tests for the Audio Services Gateway.

## Test Structure

- **integration/**: Integration tests that test the gateway in isolation without requiring running services
- **e2e/**: End-to-end tests that require the full Audio services stack to be running

## Requirements Tested

### Integration Tests (gateway.integration.test.ts)
- **Requirement 2.6**: Gateway endpoint exposure
- **Requirement 4.1**: API key authentication with valid and invalid keys
- **Requirement 3.7**: Health check aggregation
- **Requirement 15.2**: Idempotency header support for STT and TTS
- **Requirement 14.34**: Trace ID propagation
- **Requirement 16.1**: Response headers

### E2E Tests (gateway.e2e.test.ts)
- **Requirement 2.6**: End-to-end request flow through gateway to services
- **Requirement 4.1**: Authentication with valid and invalid keys
- **Requirement 3.7**: Health check aggregation with real services
- **Requirement 15.2**: Idempotency for STT and TTS with Redis caching
- **Requirement 14.34**: Trace ID propagation through entire request chain

## Running Tests

### Prerequisites

Install dependencies:
```bash
cd socialcue-audio-services/gateway
npm install
```

### Integration Tests

Integration tests can run without any services running:

```bash
npm test
```

Or run specific test file:
```bash
npm test -- gateway.integration.test.ts
```

### End-to-End Tests

E2E tests require the full Audio services stack to be running.

1. Start the services:
```bash
cd socialcue-audio-services
docker-compose up -d
```

2. Wait for services to be ready (check health):
```bash
curl http://localhost:3000/health
```

3. Set environment variables:
```bash
export GATEWAY_URL=http://localhost:3000
export TEST_API_KEY=your-test-api-key
```

4. Run E2E tests:
```bash
cd gateway
npm test -- gateway.e2e.test.ts
```

### Skip E2E Tests

To skip E2E tests (useful for CI/CD):
```bash
export SKIP_E2E=true
npm test
```

## Test Configuration

### Environment Variables

- `GATEWAY_URL`: Base URL for the gateway (default: http://localhost:3000)
- `TEST_API_KEY`: Valid API key for testing (default: test-api-key)
- `SKIP_E2E`: Set to 'true' to skip E2E tests
- `TEST_VERBOSE`: Set to 'true' to enable console logs during tests

### Jest Configuration

See `jest.config.js` for test configuration including:
- Test timeout: 10 seconds
- Coverage collection
- TypeScript support via ts-jest

## Test Coverage

Run tests with coverage:
```bash
npm test -- --coverage
```

Coverage reports are generated in the `coverage/` directory.

## Writing New Tests

### Integration Tests

Integration tests should:
- Not require external services to be running
- Test middleware and routing logic
- Verify error handling and response formats
- Use mocks for external service calls if needed

Example:
```typescript
it('should reject requests without Authorization header', async () => {
  const response = await request(app)
    .post('/v1/tts/synthesize')
    .send({ text: 'test' });

  expect(response.status).toBe(401);
  expect(response.body).toMatchObject({
    code: 'UNAUTHORIZED',
    message: expect.stringContaining('Authorization'),
    trace_id: expect.any(String),
  });
});
```

### E2E Tests

E2E tests should:
- Require full services stack to be running
- Test complete request flow from client to services
- Verify actual service responses
- Test real authentication and authorization
- Test idempotency with Redis caching
- Use `describeE2E` wrapper to allow skipping

Example:
```typescript
describeE2E('End-to-End Request Flow', () => {
  it('should successfully process TTS request', async () => {
    const response = await request(baseURL)
      .post('/v1/tts/synthesize')
      .set('Authorization', `Bearer ${validApiKey}`)
      .send({ text: 'Hello world', voice: 'default' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/audio/);
    expect(response.body).toBeInstanceOf(Buffer);
  });
});
```

## Troubleshooting

### Tests Timeout

If tests timeout, increase the timeout in `jest.config.js`:
```javascript
testTimeout: 30000, // 30 seconds
```

### Connection Refused Errors

If E2E tests fail with connection errors:
1. Verify services are running: `docker-compose ps`
2. Check service health: `curl http://localhost:3000/health`
3. Verify correct `GATEWAY_URL` environment variable

### Authentication Failures

If tests fail with 401/403 errors:
1. Verify `TEST_API_KEY` matches a key in `API_KEYS` environment variable
2. Check gateway logs: `docker-compose logs audio-gateway`

### Service Unavailable Errors

If tests fail with 503 errors:
1. Check internal service health: `curl http://localhost:3000/health`
2. Verify all services are running: `docker-compose ps`
3. Check service logs: `docker-compose logs stt-service tts-service`

### Idempotency Tests Failing

If idempotency tests fail:
1. Verify Redis is running: `docker-compose ps redis`
2. Check Redis connection: `docker-compose logs redis`
3. Verify idempotency middleware is enabled in services

## CI/CD Integration

For CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Integration Tests
  run: |
    cd socialcue-audio-services/gateway
    npm install
    npm test

- name: Run E2E Tests
  run: |
    cd socialcue-audio-services
    docker-compose up -d
    sleep 30  # Wait for services to start
    cd gateway
    export GATEWAY_URL=http://localhost:3000
    export TEST_API_KEY=test-key
    npm test -- gateway.e2e.test.ts
    cd ..
    docker-compose down
```

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Audio Services API Documentation](../../API_DOCUMENTATION.md)
