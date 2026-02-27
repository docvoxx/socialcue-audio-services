import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

export class AudioPreprocessor {
  private readonly targetSampleRate = 16000; // Whisper expects 16kHz
  private readonly maxDurationSeconds = 30; // Maximum audio duration

  async process(audioBuffer: ArrayBuffer, format: 'wav' | 'mp3' | 'webm'): Promise<ArrayBuffer> {
    try {
      const startTime = Date.now();
      
      // Convert audio to the format expected by Whisper
      let processedBuffer = audioBuffer;
      
      // Basic audio validation
      this.validateAudio(audioBuffer);
      
      // For now, we'll assume the audio is already in a compatible format
      // In a production environment, you would use libraries like ffmpeg-wasm
      // to convert between formats and resample audio
      
      processedBuffer = await this.normalizeAudio(processedBuffer);
      processedBuffer = await this.applyNoiseReduction(processedBuffer);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Audio preprocessing completed', {
        original_size: audioBuffer.byteLength,
        processed_size: processedBuffer.byteLength,
        processing_time_ms: processingTime,
        format,
      });
      
      return processedBuffer;
    } catch (error) {
      logger.error('Audio preprocessing error:', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Audio preprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateAudio(audioBuffer: ArrayBuffer): void {
    if (audioBuffer.byteLength === 0) {
      throw new Error('Empty audio buffer');
    }
    
    if (audioBuffer.byteLength > 50 * 1024 * 1024) { // 50MB limit
      throw new Error('Audio file too large');
    }
    
    // Estimate duration (rough calculation)
    const estimatedDuration = audioBuffer.byteLength / (this.targetSampleRate * 2); // 16-bit audio
    if (estimatedDuration > this.maxDurationSeconds) {
      throw new Error(`Audio too long: ${estimatedDuration.toFixed(1)}s (max: ${this.maxDurationSeconds}s)`);
    }
  }

  private async normalizeAudio(audioBuffer: ArrayBuffer): Promise<ArrayBuffer> {
    // Convert to Float32Array for processing
    const samples = new Float32Array(audioBuffer);
    
    // Find peak amplitude
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    
    // Normalize if needed (avoid clipping)
    if (peak > 0.95) {
      const scale = 0.95 / peak;
      for (let i = 0; i < samples.length; i++) {
        samples[i] *= scale;
      }
      logger.debug('Audio normalized', { peak, scale });
    }
    
    return samples.buffer;
  }

  private async applyNoiseReduction(audioBuffer: ArrayBuffer): Promise<ArrayBuffer> {
    // Simple noise gate implementation
    const samples = new Float32Array(audioBuffer);
    const threshold = 0.01; // Noise gate threshold
    
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) < threshold) {
        samples[i] *= 0.1; // Reduce low-level noise
      }
    }
    
    return samples.buffer;
  }

  async convertToWav(audioBuffer: ArrayBuffer, originalFormat: string): Promise<ArrayBuffer> {
    // In a production environment, this would use ffmpeg-wasm or similar
    // For now, we'll assume the audio is already compatible
    logger.debug('Audio format conversion', { originalFormat, targetFormat: 'wav' });
    return audioBuffer;
  }

  async resample(audioBuffer: ArrayBuffer, originalSampleRate: number): Promise<ArrayBuffer> {
    if (originalSampleRate === this.targetSampleRate) {
      return audioBuffer;
    }
    
    // Simple resampling (in production, use proper resampling algorithms)
    const samples = new Float32Array(audioBuffer);
    const ratio = originalSampleRate / this.targetSampleRate;
    const newLength = Math.floor(samples.length / ratio);
    const resampled = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const sourceIndex = Math.floor(i * ratio);
      resampled[i] = samples[sourceIndex] || 0;
    }
    
    logger.debug('Audio resampled', {
      originalSampleRate,
      targetSampleRate: this.targetSampleRate,
      originalLength: samples.length,
      newLength: resampled.length,
    });
    
    return resampled.buffer;
  }
}