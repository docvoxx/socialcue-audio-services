import fc from 'fast-check';
import { TTSService } from '../../services/TTSService';
import { AudioFileManager } from '../../services/AudioFileManager';
import { CleanupScheduler } from '../../services/CleanupScheduler';
import { mockRedis } from '../setup';
import { TTSRequest } from '@socialcue-audio-services/shared';
import { promises as fs } from 'fs';

// Mock implementations
jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('TTS Service Property Tests', () => {
  let ttsService: TTSService;
  let audioFileManager: AudioFileManager;
  let cleanupScheduler: CleanupScheduler;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup mocks
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(Buffer.from('mock audio data'));
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({
      isFile: () => true,
      size: 1024,
      birthtime: new Date(),
    } as any);

    // Reset Redis mocks
    mockRedis.zAdd.mockResolvedValue(1);
    mockRedis.zRem.mockResolvedValue(1);
    mockRedis.sAdd.mockResolvedValue(1);
    mockRedis.sRem.mockResolvedValue(1);

    // Initialize services
    ttsService = new TTSService(mockRedis as any);
    audioFileManager = new AudioFileManager();
    cleanupScheduler = new CleanupScheduler(mockRedis as any, audioFileManager);
  });

  /**
   * Property 14: TTS Audio Generation
   * For any text-to-speech request, the TTS_Service should generate audio output and return a valid audio URL.
   * Validates: Requirements 7.1
   */
  describe('Property 14: TTS Audio Generation', () => {
    const validTTSRequest = fc.record({
      text: fc.string({ minLength: 1, maxLength: 1000 }).filter(s => s.trim().length > 0),
      voice_id: fc.constantFrom(
        'vi-female-north-young',
        'vi-male-north-adult',
        'vi-female-south-adult',
        'vi-male-central-adult',
        'vi-female-north-adult'
      ),
      speed: fc.float({ min: 0.5, max: 2.0 }).filter(n => isFinite(n) && !isNaN(n)),
      emotion: fc.option(fc.constantFrom('neutral', 'happy', 'confident', 'gentle') as fc.Arbitrary<'neutral' | 'happy' | 'confident' | 'gentle'>, { nil: undefined }),
      format: fc.constantFrom('mp3', 'wav') as fc.Arbitrary<'mp3' | 'wav'>
    });

    it('should generate valid audio URL for any valid TTS request', async () => {
      await fc.assert(
        fc.asyncProperty(validTTSRequest, async (request: TTSRequest) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();
          mockRedis.zAdd.mockResolvedValue(1);
          
          // Mock successful audio generation
          const mockAudioBuffer = Buffer.from('mock audio data');
          
          // Mock the audio processor to return successful synthesis
          jest.spyOn(require('../../services/AudioProcessor').AudioProcessor.prototype, 'synthesize')
            .mockResolvedValue(mockAudioBuffer);

          const requestId = 'test-request-id';
          const response = await ttsService.synthesize(request, requestId);

          // Verify response structure
          expect(response).toHaveProperty('audio_url');
          expect(response).toHaveProperty('duration_ms');
          expect(response).toHaveProperty('generation_time_ms');

          // Verify audio URL format
          expect(response.audio_url).toMatch(/^\/audio\/[a-f0-9-]+\.(mp3|wav)$/);
          
          // Verify duration is positive and finite
          expect(response.duration_ms).toBeGreaterThan(0);
          expect(isFinite(response.duration_ms)).toBe(true);
          expect(isNaN(response.duration_ms)).toBe(false);
          
          // Verify generation time is recorded
          expect(response.generation_time_ms).toBeGreaterThanOrEqual(0);
          expect(isFinite(response.generation_time_ms)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle different voice options consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 0),
          fc.constantFrom(
            'vi-female-north-young',
            'vi-male-north-adult',
            'vi-female-south-adult',
            'vi-male-central-adult',
            'vi-female-north-adult'
          ),
          async (text: string, voiceId: string) => {
            // Reset mocks for each iteration
            jest.clearAllMocks();
            
            const request: TTSRequest = {
              text,
              voice_id: voiceId,
              speed: 1.0,
              emotion: 'neutral',
              format: 'mp3'
            };

            // Mock successful audio generation
            jest.spyOn(require('../../services/AudioProcessor').AudioProcessor.prototype, 'synthesize')
              .mockResolvedValue(Buffer.from('mock audio data'));

            const response = await ttsService.synthesize(request, 'test-id');
            
            // Should always generate valid response regardless of voice
            expect(response.audio_url).toBeTruthy();
            expect(response.duration_ms).toBeGreaterThan(0);
            expect(isFinite(response.duration_ms)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 15: Audio File Cleanup
   * For any generated audio file, it should be automatically deleted after 24 hours 
   * unless explicitly flagged as saved in the database.
   * Validates: Requirements 7.6
   */
  describe('Property 15: Audio File Cleanup', () => {
    const validFilename = fc.string({ minLength: 1, maxLength: 50 })
      .map(s => `${s.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`)
      .filter(s => s.length > 4); // Ensure we have at least "x.mp3"

    it('should schedule files for cleanup after 24 hours by default', async () => {
      await fc.assert(
        fc.asyncProperty(validFilename, async (filename: string) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();
          mockRedis.zAdd.mockResolvedValue(1);
          
          const currentTime = Date.now();
          
          await cleanupScheduler.scheduleFileForCleanup(filename);
          
          // Verify file was scheduled for cleanup exactly once
          expect(mockRedis.zAdd).toHaveBeenCalledTimes(1);
          expect(mockRedis.zAdd).toHaveBeenCalledWith(
            'tts:cleanup',
            expect.objectContaining({
              value: filename,
              score: expect.any(Number)
            })
          );

          // Verify cleanup time is approximately 24 hours from now
          const lastCall = mockRedis.zAdd.mock.calls[0];
          const scheduledTime = lastCall[1].score;
          const expectedTime = currentTime + (24 * 60 * 60 * 1000);
          const timeDiff = Math.abs(scheduledTime - expectedTime);
          
          // Allow 1 second tolerance for execution time
          expect(timeDiff).toBeLessThan(1000);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle save/unsave operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(validFilename, async (filename: string) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();
          mockRedis.sAdd.mockResolvedValue(1);
          mockRedis.zRem.mockResolvedValue(1);
          mockRedis.sRem.mockResolvedValue(1);
          mockRedis.zAdd.mockResolvedValue(1);
          
          // Mark file as saved
          await cleanupScheduler.markFileAsSaved(filename);
          
          // Verify file was added to saved set and removed from cleanup queue
          expect(mockRedis.sAdd).toHaveBeenCalledWith('tts:saved_files', filename);
          expect(mockRedis.zRem).toHaveBeenCalledWith('tts:cleanup', filename);

          // Reset mocks for unsave operation
          jest.clearAllMocks();
          mockRedis.sRem.mockResolvedValue(1);
          mockRedis.zAdd.mockResolvedValue(1);

          // Unmark file as saved
          await cleanupScheduler.unmarkFileAsSaved(filename);
          
          // Verify file was removed from saved set and rescheduled for cleanup
          expect(mockRedis.sRem).toHaveBeenCalledWith('tts:saved_files', filename);
          expect(mockRedis.zAdd).toHaveBeenCalledWith(
            'tts:cleanup',
            expect.objectContaining({
              value: filename,
              score: expect.any(Number)
            })
          );
        }),
        { numRuns: 100 }
      );
    });
  });
});