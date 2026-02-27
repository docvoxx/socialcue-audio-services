import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

interface TranscriptionResult {
  text: string;
  logprobs?: number[];
}

// Dynamic import for ESM-only module using Function constructor to prevent TS compilation
let transformersModule: any = null;

async function getTransformers() {
  if (!transformersModule) {
    // Use Function constructor to prevent TypeScript from converting to require()
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    transformersModule = await dynamicImport('@xenova/transformers');
  }
  return transformersModule;
}

export class WhisperProcessor {
  private model: any = null;
  private modelName = 'Xenova/whisper-small';
  private isInitializing = false;

  constructor() {
    // Initialize model in background, don't block constructor
    this.initializeModel().catch(err => {
      logger.error('Failed to initialize Whisper model:', err instanceof Error ? err : new Error(String(err)));
      // Don't throw - allow service to start even if model fails to load
    });
  }

  private async initializeModel(): Promise<void> {
    if (this.model || this.isInitializing) return;
    
    this.isInitializing = true;
    try {
      logger.info('Initializing Whisper model...');
      const { pipeline } = await getTransformers();
      this.model = await pipeline('automatic-speech-recognition', this.modelName, {
        quantized: true, // Use quantized model for better performance
      });
      logger.info('Whisper model initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Whisper model:', error instanceof Error ? error : new Error(String(error)));
      // Don't throw - allow retry on next request
    } finally {
      this.isInitializing = false;
    }
  }

  async transcribe(audioBuffer: ArrayBuffer, language: string = 'vi'): Promise<TranscriptionResult> {
    await this.ensureModelReady();
    
    if (!this.model) {
      throw new Error('Whisper model not available');
    }

    try {
      const startTime = Date.now();
      
      // Convert ArrayBuffer to Float32Array for Whisper
      const audioArray = new Float32Array(audioBuffer);
      
      // Perform transcription
      const result = await this.model(audioArray, {
        language: language,
        task: 'transcribe',
        return_timestamps: false,
        chunk_length_s: 30, // Process in 30-second chunks
        stride_length_s: 5,  // 5-second stride for overlap
      });

      const processingTime = Date.now() - startTime;
      
      // Handle both single object and array outputs from Whisper API
      const isArray = Array.isArray(result);
      const text = isArray ? result.map((r: any) => r.text).join(' ') : (result as any).text || '';
      const chunks = isArray ? [] : (result as any).chunks || [];
      
      logger.info('Whisper transcription completed', {
        processing_time_ms: processingTime,
        text_length: text.length,
      });

      return {
        text,
        logprobs: chunks.map((chunk: any) => chunk.score),
      };
    } catch (error) {
      logger.error('Whisper transcription error:', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Whisper transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async ensureModelReady(): Promise<void> {
    if (this.model) return;
    
    if (this.isInitializing) {
      // Wait for initialization to complete
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }
    
    await this.initializeModel();
  }

  async warmup(): Promise<void> {
    await this.ensureModelReady();
    
    if (!this.model) return;
    
    try {
      // Create a small dummy audio buffer for warmup
      const dummyAudio = new Float32Array(16000); // 1 second of silence at 16kHz
      await this.model(dummyAudio, {
        language: 'vi',
        task: 'transcribe',
        return_timestamps: false,
      });
      logger.info('Whisper model warmed up successfully');
    } catch (error) {
      logger.warn('Whisper warmup failed:', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}