import * as fc from 'fast-check';
import { createMockAudioBuffer, createSilentAudioBuffer, createNoiseAudioBuffer } from '../setup';

// Import the STT service after mocks are set up
import { STTService } from '../../services/STTService';
import { STTRequest } from '@socialcue-audio-services/shared';

describe('STT Service Property Tests', () => {
  let sttService: STTService;

  beforeAll(async () => {
    sttService = new STTService();
  });

  afterAll(async () => {
    await sttService.cleanup();
  });

  describe('Property 13: STT Processing Performance', () => {
    /**
     * Feature: socialcue-main-app, Property 13: STT Processing Performance
     * For any voice input, the STT_Service should complete transcription within P95 latency of 2 seconds for transcription-only processing.
     * Validates: Requirements 6.5
     */
    test('should complete transcription within 2 seconds for valid audio inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            durationMs: fc.integer({ min: 100, max: 5000 }), // 0.1 to 5 seconds
            format: fc.constantFrom('wav', 'mp3', 'webm'),
            dialect_hint: fc.option(fc.constantFrom('north', 'central', 'south')),
          }),
          async ({ durationMs, format, dialect_hint }) => {
            // Create test audio buffer
            const audioBuffer = createMockAudioBuffer(durationMs);
            
            const request: STTRequest = {
              audio_data: audioBuffer,
              format: format as 'wav' | 'mp3' | 'webm',
              language: 'vi',
              dialect_hint: dialect_hint as 'north' | 'central' | 'south' | undefined,
            };

            const startTime = Date.now();
            
            const result = await sttService.transcribe(request);
            const processingTime = Date.now() - startTime;
            
            // Property: Processing time should be within 2 seconds (2000ms)
            expect(processingTime).toBeLessThanOrEqual(2000);
            
            // Additional validations
            expect(result.processing_time_ms).toBeGreaterThanOrEqual(0); // Allow 0 for very fast mocked operations
            expect(result.processing_time_ms).toBeLessThanOrEqual(processingTime + 100); // Allow small variance
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
            expect(typeof result.text).toBe('string');
          }
        ),
        { 
          numRuns: 100,
          timeout: 5000, // 5 second timeout per test
        }
      );
    }, 30000); // 30 second test timeout

    test('should handle edge cases within performance bounds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            { name: 'empty', buffer: new ArrayBuffer(0) },
            { name: 'very_short', buffer: createMockAudioBuffer(50) }, // 50ms
            { name: 'silent', buffer: createSilentAudioBuffer(1000) },
            { name: 'noise', buffer: createNoiseAudioBuffer(1000) },
          ),
          async ({ buffer }) => {
            const request: STTRequest = {
              audio_data: buffer,
              format: 'wav',
              language: 'vi',
            };

            const startTime = Date.now();
            
            try {
              const result = await sttService.transcribe(request);
              const processingTime = Date.now() - startTime;
              
              // Property: Even edge cases should complete within reasonable time
              expect(processingTime).toBeLessThanOrEqual(5000); // 5 seconds for edge cases
              
              // Validate response structure
              expect(result).toHaveProperty('text');
              expect(result).toHaveProperty('confidence');
              expect(result).toHaveProperty('processing_time_ms');
              
            } catch (error) {
              const processingTime = Date.now() - startTime;
              
              // Even errors should be returned quickly
              expect(processingTime).toBeLessThanOrEqual(2000);
              
              // Validate error types for edge cases
              if (error instanceof Error) {
                expect(typeof error.message).toBe('string');
                expect(error.message.length).toBeGreaterThan(0);
              }
            }
          }
        ),
        { 
          numRuns: 50,
          timeout: 10000,
        }
      );
    }, 60000);
  });

  describe('Response Structure Properties', () => {
    test('should always return valid response structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            durationMs: fc.integer({ min: 500, max: 3000 }),
            format: fc.constantFrom('wav', 'mp3', 'webm'),
          }),
          async ({ durationMs, format }) => {
            const audioBuffer = createMockAudioBuffer(durationMs);
            const request: STTRequest = {
              audio_data: audioBuffer,
              format: format as 'wav' | 'mp3' | 'webm',
              language: 'vi',
            };

            const result = await sttService.transcribe(request);
            
            // Property: Response must have required fields
            expect(result).toHaveProperty('text');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('processing_time_ms');
            
            // Property: Field types must be correct
            expect(typeof result.text).toBe('string');
            expect(typeof result.confidence).toBe('number');
            expect(typeof result.processing_time_ms).toBe('number');
            
            // Property: Confidence must be in valid range
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
            
            // Property: Processing time must be non-negative
            expect(result.processing_time_ms).toBeGreaterThanOrEqual(0);
            
            // Property: Optional fields must be correct type if present
            if (result.dialect_detected) {
              expect(['north', 'central', 'south']).toContain(result.dialect_detected);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Input Validation Properties', () => {
    test('should handle various input sizes gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            durationMs: fc.integer({ min: 0, max: 10000 }),
            format: fc.constantFrom('wav', 'mp3', 'webm'),
          }),
          async ({ durationMs, format }) => {
            const audioBuffer = durationMs > 0 ? createMockAudioBuffer(durationMs) : new ArrayBuffer(0);
            const request: STTRequest = {
              audio_data: audioBuffer,
              format: format as 'wav' | 'mp3' | 'webm',
              language: 'vi',
            };

            try {
              const result = await sttService.transcribe(request);
              
              // Property: Valid results should have proper structure
              expect(result).toHaveProperty('text');
              expect(result).toHaveProperty('confidence');
              expect(result).toHaveProperty('processing_time_ms');
              
            } catch (error) {
              // Property: Errors should be informative and properly typed
              expect(error).toBeInstanceOf(Error);
              expect(typeof (error as Error).message).toBe('string');
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});