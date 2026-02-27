import { STTRequest, STTResponse } from '@socialcue-audio-services/shared';
import { WhisperProcessor } from './WhisperProcessor';
import { AudioPreprocessor } from './AudioPreprocessor';
import { DialectDetector } from './DialectDetector';
import { ConfidenceScorer } from './ConfidenceScorer';
import { AudioFileManager } from './AudioFileManager';
import { LatencyOptimizer } from './LatencyOptimizer';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

export class STTService {
  private whisperProcessor: WhisperProcessor;
  private audioPreprocessor: AudioPreprocessor;
  private dialectDetector: DialectDetector;
  private confidenceScorer: ConfidenceScorer;
  private audioFileManager: AudioFileManager;
  private latencyOptimizer: LatencyOptimizer;

  constructor() {
    this.whisperProcessor = new WhisperProcessor();
    this.audioPreprocessor = new AudioPreprocessor();
    this.dialectDetector = new DialectDetector();
    this.confidenceScorer = new ConfidenceScorer();
    this.audioFileManager = new AudioFileManager();
    this.latencyOptimizer = new LatencyOptimizer();
  }

  async transcribe(request: STTRequest): Promise<STTResponse> {
    const startTime = Date.now();
    const timings = {
      preprocessing: 0,
      transcription: 0,
      postprocessing: 0,
      total: 0,
    };
    
    try {
      // Step 1: Preprocess audio (noise reduction, normalization)
      const preprocessStart = Date.now();
      
      // Apply latency optimizations
      const { optimizedBuffer, optimizations } = await this.latencyOptimizer.optimizeAudioProcessing(
        request.audio_data
      );
      
      const preprocessedAudio = await this.audioPreprocessor.process(
        optimizedBuffer,
        request.format
      );
      timings.preprocessing = Date.now() - preprocessStart;

      // Step 2: Perform transcription using Whisper
      const transcriptionStart = Date.now();
      const transcriptionResult = await this.whisperProcessor.transcribe(
        preprocessedAudio,
        request.language
      );
      timings.transcription = Date.now() - transcriptionStart;

      // Step 3: Post-processing
      const postprocessStart = Date.now();
      
      // Detect dialect if not provided
      let dialectDetected = request.dialect_hint;
      if (!dialectDetected && transcriptionResult.text.length > 10) {
        dialectDetected = await this.dialectDetector.detect(transcriptionResult.text);
      }

      // Calculate confidence score
      const confidence = this.confidenceScorer.calculate(
        transcriptionResult.text,
        transcriptionResult.logprobs || [],
        dialectDetected
      );

      // Handle low confidence transcriptions
      if (confidence < 0.3) {
        logger.warn('Low confidence transcription', {
          service: 'stt-service',
          confidence,
          text_length: transcriptionResult.text.length,
          dialect: dialectDetected,
        });
        
        // Could trigger retry or request user confirmation
        if (transcriptionResult.text.length < 5) {
          throw new Error('Transcription confidence too low. Please speak more clearly or try again.');
        }
      }

      timings.postprocessing = Date.now() - postprocessStart;
      timings.total = Date.now() - startTime;

      // Record performance metrics
      this.latencyOptimizer.recordMetrics({
        preprocessing: timings.preprocessing,
        transcription: timings.transcription,
        postprocessing: timings.postprocessing,
        total: timings.total,
      });

      logger.info('STT processing completed', {
        service: 'stt-service',
        text_length: transcriptionResult.text.length,
        confidence,
        dialect_detected: dialectDetected,
        processing_time_ms: timings.total,
        optimizations,
        timings,
      });

      return {
        text: transcriptionResult.text,
        confidence,
        processing_time_ms: timings.total,
        dialect_detected: dialectDetected,
      };
    } catch (error) {
      timings.total = Date.now() - startTime;
      
      // Record failed request metrics
      this.latencyOptimizer.recordMetrics({
        preprocessing: timings.preprocessing,
        transcription: timings.transcription,
        postprocessing: timings.postprocessing,
        total: timings.total,
      });
      
      logger.error('STT service error:', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async saveAudioForDebugging(audioData: ArrayBuffer, format: string): Promise<string> {
    return await this.audioFileManager.saveAudioFile(audioData, format);
  }

  async getPerformanceReport(): Promise<any> {
    return this.latencyOptimizer.getPerformanceReport();
  }

  async cleanup(): Promise<void> {
    await this.audioFileManager.shutdown();
  }
}