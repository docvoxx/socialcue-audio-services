import { createClient } from 'redis';
import { logger } from '@socialcue-audio-services/shared';
import { TTSRequest, TTSResponse } from '@socialcue-audio-services/shared';
import { VoiceManager } from './VoiceManager';
import { AudioProcessor } from './AudioProcessor';
import { AudioFileManager } from './AudioFileManager';
import { CleanupScheduler } from './CleanupScheduler';
import { v4 as uuidv4 } from 'uuid';

type RedisClient = ReturnType<typeof createClient>;

export class TTSService {
  private redis: RedisClient;
  private voiceManager: VoiceManager;
  private audioProcessor: AudioProcessor;
  private audioFileManager: AudioFileManager;
  private cleanupScheduler: CleanupScheduler;

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.voiceManager = new VoiceManager();
    this.audioProcessor = new AudioProcessor();
    this.audioFileManager = new AudioFileManager();
    this.cleanupScheduler = new CleanupScheduler(redis, this.audioFileManager);
  }

  async synthesize(request: TTSRequest, requestId: string): Promise<TTSResponse> {
    const startTime = Date.now();
    
    try {
      // Validate and sanitize input
      const sanitizedRequest = this.validateAndSanitizeRequest(request);
      
      // Validate voice ID - use voice or voice_id, default to 'default'
      const voiceId = sanitizedRequest.voice_id || sanitizedRequest.voice || 'default';
      const voice = await this.voiceManager.getVoice(voiceId);
      if (!voice) {
        throw new Error(`Voice not found: ${voiceId}`);
      }

      // Check cache first
      const cacheKey = this.generateCacheKey(sanitizedRequest);
      const cachedResponse = await this.getCachedResponse(cacheKey);
      
      if (cachedResponse) {
        logger.info('TTS cache hit', {
          service: 'tts-service',
          requestId,
          cacheKey,
          textLength: sanitizedRequest.text.length
        });
        return cachedResponse;
      }

      // Generate unique filename
      const format = sanitizedRequest.format || 'wav';
      const filename = `${uuidv4()}.${format}`;
      
      // Synthesize audio
      const speed = sanitizedRequest.speed || 1.0;
      const audioBuffer = await this.audioProcessor.synthesize({
        text: sanitizedRequest.text,
        voice: voice,
        speed: speed,
        emotion: sanitizedRequest.emotion || 'neutral',
        format: format
      });

      // Save audio file
      await this.audioFileManager.saveAudioFile(filename, audioBuffer);
      
      // Calculate duration (approximate based on text length and speed)
      const estimatedDuration = this.estimateAudioDuration(sanitizedRequest.text, speed);
      
      const response: TTSResponse = {
        audio_url: `/audio/${filename}`,
        duration_ms: estimatedDuration,
        generation_time_ms: Date.now() - startTime
      };

      // Cache the response
      await this.cacheResponse(cacheKey, response);
      
      // Schedule cleanup after 24 hours
      await this.cleanupScheduler.scheduleFileForCleanup(filename);

      logger.info('TTS synthesis completed', {
        service: 'tts-service',
        requestId,
        filename,
        durationMs: estimatedDuration,
        generationTimeMs: response.generation_time_ms,
        textLength: sanitizedRequest.text.length
      });

      return response;
      
    } catch (error) {
      logger.error('TTS synthesis failed', error instanceof Error ? error : new Error('Unknown error'), {
        service: 'tts-service',
        textLength: request.text?.length || 0,
        voiceId: request.voice_id
      });
      throw error;
    }
  }

  private generateCacheKey(request: TTSRequest): string {
    // Create a hash of the request parameters for caching
    const keyData = {
      text: request.text,
      voice_id: request.voice_id,
      speed: request.speed,
      emotion: request.emotion || 'neutral',
      format: request.format
    };
    
    return `tts:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }

  private validateAndSanitizeRequest(request: TTSRequest): TTSRequest {
    // Validate and sanitize text
    const text = typeof request.text === 'string' ? request.text : '';
    if (text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Validate and sanitize speed
    let speed = request.speed;
    if (typeof speed !== 'number' || isNaN(speed) || !isFinite(speed) || speed <= 0) {
      speed = 1.0; // Default to normal speed
    }
    // Clamp speed to reasonable range
    speed = Math.max(0.5, Math.min(2.0, speed));

    // Validate voice_id
    if (!request.voice_id || typeof request.voice_id !== 'string') {
      throw new Error('Valid voice_id is required');
    }

    // Validate format
    const format = request.format === 'wav' ? 'wav' : 'mp3'; // Default to mp3

    // Validate emotion
    const validEmotions = ['neutral', 'happy', 'confident', 'gentle'];
    const emotion = validEmotions.includes(request.emotion || '') ? request.emotion : 'neutral';

    return {
      text,
      voice_id: request.voice_id,
      speed,
      emotion,
      format
    };
  }

  private async getCachedResponse(cacheKey: string): Promise<TTSResponse | null> {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as TTSResponse;
      }
    } catch (error) {
      logger.warn('Cache retrieval failed', { service: 'tts-service', error, cacheKey });
    }
    return null;
  }

  private async cacheResponse(cacheKey: string, response: TTSResponse): Promise<void> {
    try {
      // Cache for 1 hour
      await this.redis.setEx(cacheKey, 3600, JSON.stringify(response));
    } catch (error) {
      logger.warn('Cache storage failed', { service: 'tts-service', error, cacheKey });
    }
  }

  private estimateAudioDuration(text: string, speed: number): number {
    // Rough estimation: average speaking rate is ~150 words per minute
    // Adjust for Vietnamese language characteristics
    const cleanText = text?.trim() || '';
    const words = cleanText.split(/\s+/).filter(word => word.length > 0).length;
    const baseWpm = 130; // Slightly slower for Vietnamese
    
    // Ensure speed is a valid number, default to 1.0 if invalid
    const validSpeed = (typeof speed === 'number' && isFinite(speed) && !isNaN(speed) && speed > 0) ? speed : 1.0;
    const adjustedWpm = baseWpm * validSpeed;
    const durationMinutes = words / adjustedWpm;
    const durationMs = Math.round(durationMinutes * 60 * 1000); // Convert to milliseconds
    
    // Ensure minimum duration for very short text or empty text
    const finalDuration = Math.max(durationMs, 100); // At least 100ms
    
    // Double-check the result is valid
    return isFinite(finalDuration) && !isNaN(finalDuration) ? finalDuration : 100;
  }
}