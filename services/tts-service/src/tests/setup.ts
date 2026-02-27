import { logger } from '@socialcue-audio-services/shared';

// Mock Redis client for testing
export const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  zAdd: jest.fn(),
  zRem: jest.fn(),
  zRangeByScore: jest.fn(),
  zRangeWithScores: jest.fn(),
  zCard: jest.fn(),
  zScore: jest.fn(),
  zRange: jest.fn(),
  sAdd: jest.fn(),
  sRem: jest.fn(),
  sIsMember: jest.fn(),
  sMembers: jest.fn(),
  sCard: jest.fn(),
  connect: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
};

// Mock logger to avoid console output during tests
jest.mock('@socialcue-audio-services/shared', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createServiceLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
  },
}));

// Mock child_process spawn
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// Mock axios for external API calls
jest.mock('axios');

// Setup test environment
beforeEach(() => {
  jest.clearAllMocks();
  
  // Reset Redis mock implementations
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.setEx.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
  mockRedis.zAdd.mockResolvedValue(1);
  mockRedis.zRem.mockResolvedValue(1);
  mockRedis.zRangeByScore.mockResolvedValue([]);
  mockRedis.zRangeWithScores.mockResolvedValue([]);
  mockRedis.zCard.mockResolvedValue(0);
  mockRedis.zScore.mockResolvedValue(null);
  mockRedis.zRange.mockResolvedValue([]);
  mockRedis.sAdd.mockResolvedValue(1);
  mockRedis.sRem.mockResolvedValue(1);
  mockRedis.sIsMember.mockResolvedValue(false);
  mockRedis.sMembers.mockResolvedValue([]);
  mockRedis.sCard.mockResolvedValue(0);
});

// Cleanup after tests
afterAll(async () => {
  // Clean up any test artifacts
});

export { logger };