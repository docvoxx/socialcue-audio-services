// Configure test environment
process.env.NODE_ENV = 'test';

// Mock the entire shared module for tests
jest.mock('@socialcue-audio-services/shared', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  
  return {
    logger: mockLogger,
    createServiceLogger: jest.fn(() => mockLogger),
    // Mock other exports as needed
    STTRequestSchema: {
      parse: jest.fn((data) => data),
    },
    STTResponseSchema: {
      parse: jest.fn((data) => data),
    },
  };
});

// Mock all service modules to avoid compilation issues
jest.mock('../services/WhisperProcessor', () => ({
  WhisperProcessor: jest.fn().mockImplementation(() => ({
    transcribe: jest.fn().mockResolvedValue({
      text: 'mocked transcription',
      logprobs: [-0.1, -0.2, -0.15],
    }),
    warmup: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../services/AudioPreprocessor', () => ({
  AudioPreprocessor: jest.fn().mockImplementation(() => ({
    process: jest.fn().mockImplementation((buffer) => Promise.resolve(buffer)),
  })),
}));

jest.mock('../services/DialectDetector', () => ({
  DialectDetector: jest.fn().mockImplementation(() => ({
    detect: jest.fn().mockResolvedValue('north'),
  })),
}));

jest.mock('../services/ConfidenceScorer', () => ({
  ConfidenceScorer: jest.fn().mockImplementation(() => ({
    calculate: jest.fn().mockReturnValue(0.85),
  })),
}));

jest.mock('../services/AudioFileManager', () => ({
  AudioFileManager: jest.fn().mockImplementation(() => ({
    saveAudioFile: jest.fn().mockResolvedValue('file-id'),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../services/LatencyOptimizer', () => ({
  LatencyOptimizer: jest.fn().mockImplementation(() => ({
    optimizeAudioProcessing: jest.fn().mockImplementation((buffer) => 
      Promise.resolve({ optimizedBuffer: buffer, optimizations: [] })
    ),
    recordMetrics: jest.fn(),
    getPerformanceReport: jest.fn().mockReturnValue({
      averageLatency: 500,
      p95Latency: 800,
    }),
  })),
}));

// Global test setup
beforeAll(async () => {
  // Any global setup needed for tests
});

afterAll(async () => {
  // Cleanup after all tests
});

// Helper functions for tests
export function createMockAudioBuffer(durationMs: number = 1000): ArrayBuffer {
  // Create a simple sine wave audio buffer for testing
  const sampleRate = 16000;
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = new Float32Array(samples);
  
  for (let i = 0; i < samples; i++) {
    // Generate a 440Hz sine wave (A note)
    buffer[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
  }
  
  return buffer.buffer;
}

export function createSilentAudioBuffer(durationMs: number = 1000): ArrayBuffer {
  const sampleRate = 16000;
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = new Float32Array(samples);
  // Buffer is already filled with zeros (silence)
  return buffer.buffer;
}

export function createNoiseAudioBuffer(durationMs: number = 1000): ArrayBuffer {
  const sampleRate = 16000;
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = new Float32Array(samples);
  
  for (let i = 0; i < samples; i++) {
    // Generate random noise
    buffer[i] = (Math.random() - 0.5) * 0.1; // Low amplitude noise
  }
  
  return buffer.buffer;
}