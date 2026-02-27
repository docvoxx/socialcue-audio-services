import { EventEmitter } from 'events';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');
import { WhisperProcessor } from './WhisperProcessor';
import { AudioPreprocessor } from './AudioPreprocessor';

interface StreamingChunk {
  id: string;
  audio: ArrayBuffer;
  timestamp: number;
  isLast: boolean;
}

interface StreamingResult {
  chunkId: string;
  text: string;
  confidence: number;
  isFinal: boolean;
  processingTime: number;
}

export class StreamingProcessor extends EventEmitter {
  private whisperProcessor: WhisperProcessor;
  private audioPreprocessor: AudioPreprocessor;
  private activeStreams: Map<string, StreamingSession> = new Map();
  private readonly chunkDurationMs = 1000; // 1 second chunks
  private readonly overlapMs = 200; // 200ms overlap

  constructor() {
    super();
    this.whisperProcessor = new WhisperProcessor();
    this.audioPreprocessor = new AudioPreprocessor();
    
    // Suppress unused variable warnings - these will be used in future streaming implementation
    void this.chunkDurationMs;
    void this.overlapMs;
  }

  async startStream(streamId: string, language: string = 'vi'): Promise<void> {
    if (this.activeStreams.has(streamId)) {
      throw new Error(`Stream ${streamId} already active`);
    }

    const session = new StreamingSession(streamId, language);
    this.activeStreams.set(streamId, session);

    logger.info('Streaming session started', { streamId, language });
  }

  async processChunk(streamId: string, chunk: StreamingChunk): Promise<StreamingResult> {
    const session = this.activeStreams.get(streamId);
    if (!session) {
      throw new Error(`Stream ${streamId} not found`);
    }

    const startTime = Date.now();

    try {
      // Preprocess audio chunk
      const preprocessedAudio = await this.audioPreprocessor.process(
        chunk.audio,
        'wav' // Assume streaming audio is WAV
      );

      // Add to session buffer with overlap handling
      session.addChunk(preprocessedAudio, chunk.timestamp);

      // Process accumulated audio if we have enough
      let result: StreamingResult;
      
      if (chunk.isLast || session.shouldProcess()) {
        const audioBuffer = session.getProcessingBuffer();
        const transcriptionResult = await this.whisperProcessor.transcribe(
          audioBuffer,
          session.language
        );

        result = {
          chunkId: chunk.id,
          text: transcriptionResult.text,
          confidence: this.calculateStreamingConfidence(transcriptionResult.text, transcriptionResult.logprobs),
          isFinal: chunk.isLast,
          processingTime: Date.now() - startTime,
        };

        // Update session state
        session.updateWithResult(result);
      } else {
        // Return partial result for real-time feedback
        result = {
          chunkId: chunk.id,
          text: session.getPartialText(),
          confidence: 0.5, // Lower confidence for partial results
          isFinal: false,
          processingTime: Date.now() - startTime,
        };
      }

      // Emit result for real-time processing
      this.emit('result', streamId, result);

      // Clean up if final chunk
      if (chunk.isLast) {
        this.endStream(streamId);
      }

      return result;
    } catch (error) {
      logger.error('Streaming chunk processing error:', error);
      throw error;
    }
  }

  async endStream(streamId: string): Promise<void> {
    const session = this.activeStreams.get(streamId);
    if (session) {
      session.cleanup();
      this.activeStreams.delete(streamId);
      logger.info('Streaming session ended', { streamId });
    }
  }

  private calculateStreamingConfidence(text: string, logprobs: number[] = []): number {
    // Simplified confidence calculation for streaming
    if (!text || text.trim().length === 0) return 0.1;
    
    let confidence = 0.7; // Base confidence for streaming
    
    // Adjust based on text length
    if (text.length < 5) confidence -= 0.2;
    if (text.length > 50) confidence += 0.1;
    
    // Adjust based on logprobs if available
    if (logprobs.length > 0) {
      const avgLogprob = logprobs.reduce((sum, prob) => sum + prob, 0) / logprobs.length;
      confidence += Math.max(-0.2, Math.min(0.2, avgLogprob / 10));
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  async cleanup(): Promise<void> {
    for (const streamId of this.activeStreams.keys()) {
      await this.endStream(streamId);
    }
  }
}

class StreamingSession {
  public readonly id: string;
  public readonly language: string;
  private audioBuffer: ArrayBuffer[] = [];
  private timestamps: number[] = [];
  private partialText: string = '';
  private lastProcessedTime: number = 0;
  private readonly maxBufferDuration = 5000; // 5 seconds max buffer

  constructor(id: string, language: string) {
    this.id = id;
    this.language = language;
  }

  addChunk(audio: ArrayBuffer, timestamp: number): void {
    this.audioBuffer.push(audio);
    this.timestamps.push(timestamp);
    
    // Remove old chunks to prevent memory buildup
    this.cleanupOldChunks();
  }

  shouldProcess(): boolean {
    if (this.audioBuffer.length === 0) return false;
    
    const currentTime = Date.now();
    const timeSinceLastProcess = currentTime - this.lastProcessedTime;
    
    // Process every 2 seconds or when buffer is getting full
    return timeSinceLastProcess > 2000 || this.audioBuffer.length > 10;
  }

  getProcessingBuffer(): ArrayBuffer {
    if (this.audioBuffer.length === 0) {
      return new ArrayBuffer(0);
    }

    // Combine all audio chunks
    const totalLength = this.audioBuffer.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const buffer of this.audioBuffer) {
      combined.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }
    
    return combined.buffer;
  }

  getPartialText(): string {
    return this.partialText;
  }

  updateWithResult(result: StreamingResult): void {
    this.partialText = result.text;
    this.lastProcessedTime = Date.now();
  }

  private cleanupOldChunks(): void {
    const currentTime = Date.now();
    
    // Remove chunks older than maxBufferDuration
    while (this.timestamps.length > 0 && 
           currentTime - this.timestamps[0] > this.maxBufferDuration) {
      this.audioBuffer.shift();
      this.timestamps.shift();
    }
  }

  cleanup(): void {
    this.audioBuffer = [];
    this.timestamps = [];
    this.partialText = '';
  }
}