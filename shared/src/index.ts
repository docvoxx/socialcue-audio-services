// Logger utilities
export function createServiceLogger(serviceName: string) {
  return {
    info: (message: string, ...args: any[]) => console.log(`[${serviceName}] INFO:`, message, ...args),
    error: (message: string, ...args: any[]) => console.error(`[${serviceName}] ERROR:`, message, ...args),
    warn: (message: string, ...args: any[]) => console.warn(`[${serviceName}] WARN:`, message, ...args),
    debug: (message: string, ...args: any[]) => console.debug(`[${serviceName}] DEBUG:`, message, ...args),
  };
}

export const logger = createServiceLogger('shared');

// STT Types
export interface STTRequest {
  audio_data: ArrayBuffer;
  format: 'wav' | 'mp3' | 'webm';
  language: 'vi';
  dialect_hint?: 'north' | 'central' | 'south';
}

export interface STTSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
  confidence: number;
}

export interface STTResponse {
  text: string;
  confidence: number;
  dialect_detected?: string;
  processing_time_ms?: number;
}

// TTS Types
export interface TTSRequest {
  text: string;
  voice?: string;
  voice_id?: string;
  speed?: number;
  format?: 'wav' | 'mp3';
  emotion?: string;
}

export interface TTSResponse {
  audio?: Buffer;
  audio_url?: string;
  format?: string;
  duration?: number;
  duration_ms?: number;
  generation_time_ms?: number;
  trace_id?: string;
}

// Zod schema for TTS validation
import { z } from 'zod';

export const TTSRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().optional().default('default'),
  speed: z.number().min(0.5).max(2.0).optional().default(1.0),
  format: z.enum(['wav', 'mp3']).optional().default('wav'),
});
