/**
 * Test setup file for Audio Services Gateway integration tests
 * 
 * This file runs before all tests to configure the test environment
 */

// Suppress console logs during tests unless explicitly needed
if (process.env.TEST_VERBOSE !== 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Set test environment variables
process.env.NODE_ENV = 'test';

// Increase timeout for integration tests
jest.setTimeout(10000);
