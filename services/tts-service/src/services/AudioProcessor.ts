import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '@socialcue-audio-services/shared';
import { Voice } from './VoiceManager';
import axios from 'axios';

export interface SynthesisRequest {
  text: string;
  voice: Voice;
  speed: number;
  emotion: string;
  format: 'mp3' | 'wav';
}

export class AudioProcessor {
  private tempDir: string;
  private ttsEngine: 'espeak' | 'festival' | 'fpt-ai' | 'coqui';

  constructor() {
    this.tempDir = process.env.TTS_TEMP_DIR || '/tmp/audio';
    this.ttsEngine = (process.env.TTS_ENGINE as any) || 'espeak';
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', error instanceof Error ? error : new Error(String(error)), { service: 'tts-service', tempDir: this.tempDir });
    }
  }

  async synthesize(request: SynthesisRequest): Promise<Buffer> {
    logger.info('Starting audio synthesis', {
      service: 'tts-service',
      textLength: request.text.length,
      voiceId: request.voice.id,
      speed: request.speed,
      emotion: request.emotion,
      format: request.format,
      engine: this.ttsEngine
    });

    try {
      switch (this.ttsEngine) {
        case 'fpt-ai':
          return await this.synthesizeWithFPTAI(request);
        case 'coqui':
          return await this.synthesizeWithCoqui(request);
        case 'festival':
          return await this.synthesizeWithFestival(request);
        case 'espeak':
        default:
          return await this.synthesizeWithEspeak(request);
      }
    } catch (error) {
      logger.error('Audio synthesis failed', error instanceof Error ? error : new Error(String(error)), {
        service: 'tts-service',
        engine: this.ttsEngine,
        voiceId: request.voice.id
      });
      throw error;
    }
  }

  private async synthesizeWithEspeak(request: SynthesisRequest): Promise<Buffer> {
    // Fallback TTS using espeak (basic but reliable)
    const tempFile = join(this.tempDir, `espeak_${Date.now()}.${request.format}`);
    
    try {
      const args = [
        '-v', 'vi', // Vietnamese language
        '-s', Math.round(150 * request.speed).toString(), // Speed in words per minute
        '-w', tempFile, // Output to file
        request.text
      ];

      await this.runCommand('espeak', args);
      
      // Convert to requested format if needed
      const finalFile = await this.convertAudioFormat(tempFile, request.format);
      const audioBuffer = await fs.readFile(finalFile);
      
      // Cleanup temp files
      await this.cleanupFile(tempFile);
      if (finalFile !== tempFile) {
        await this.cleanupFile(finalFile);
      }
      
      return audioBuffer;
    } catch (error) {
      await this.cleanupFile(tempFile);
      throw error;
    }
  }

  private async synthesizeWithFestival(request: SynthesisRequest): Promise<Buffer> {
    // Festival TTS (better quality than espeak)
    const tempFile = join(this.tempDir, `festival_${Date.now()}.wav`);
    
    try {
      // Create Festival script
      const script = `
        (voice_select 'voice_cmu_us_slt_arctic_hts)
        (set! utt1 (Utterance Text "${request.text.replace(/"/g, '\\"')}"))
        (utt.synth utt1)
        (utt.save.wave utt1 "${tempFile}")
      `;
      
      const scriptFile = join(this.tempDir, `script_${Date.now()}.scm`);
      await fs.writeFile(scriptFile, script);
      
      await this.runCommand('festival', ['-b', scriptFile]);
      
      // Convert to requested format
      const finalFile = await this.convertAudioFormat(tempFile, request.format);
      const audioBuffer = await fs.readFile(finalFile);
      
      // Cleanup
      await this.cleanupFile(tempFile);
      await this.cleanupFile(scriptFile);
      if (finalFile !== tempFile) {
        await this.cleanupFile(finalFile);
      }
      
      return audioBuffer;
    } catch (error) {
      await this.cleanupFile(tempFile);
      throw error;
    }
  }

  private async synthesizeWithFPTAI(request: SynthesisRequest): Promise<Buffer> {
    // FPT.AI TTS API (Vietnamese-optimized)
    const apiKey = process.env.FPT_AI_API_KEY;
    if (!apiKey) {
      throw new Error('FPT.AI API key not configured');
    }

    try {
      const response = await axios.post('https://api.fpt.ai/hmi/tts/v5', {
        text: request.text,
        voice: this.mapVoiceToFPTAI(request.voice),
        speed: request.speed,
        format: request.format
      }, {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('FPT.AI TTS failed', error instanceof Error ? error : new Error(String(error)));
      // Fallback to espeak
      return await this.synthesizeWithEspeak(request);
    }
  }

  private async synthesizeWithCoqui(request: SynthesisRequest): Promise<Buffer> {
    // Coqui TTS (open-source, high quality)
    const tempFile = join(this.tempDir, `coqui_${Date.now()}.${request.format}`);
    
    try {
      const args = [
        '--text', request.text,
        '--model_name', 'tts_models/vi/vivos/vits', // Vietnamese VITS model
        '--out_path', tempFile,
        '--speaker_idx', this.mapVoiceToCoqui(request.voice)
      ];

      await this.runCommand('tts', args);
      
      const audioBuffer = await fs.readFile(tempFile);
      await this.cleanupFile(tempFile);
      
      return audioBuffer;
    } catch (error) {
      await this.cleanupFile(tempFile);
      // Fallback to espeak
      return await this.synthesizeWithEspeak(request);
    }
  }

  private async convertAudioFormat(inputFile: string, targetFormat: 'mp3' | 'wav'): Promise<string> {
    const inputExt = inputFile.split('.').pop();
    if (inputExt === targetFormat) {
      return inputFile;
    }

    const outputFile = inputFile.replace(/\.[^.]+$/, `.${targetFormat}`);
    
    try {
      const args = ['-i', inputFile, '-y', outputFile];
      await this.runCommand('ffmpeg', args);
      return outputFile;
    } catch (error) {
      logger.warn('Audio format conversion failed', { service: 'tts-service', inputFile, targetFormat });
      return inputFile; // Return original if conversion fails
    }
  }

  private async runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private mapVoiceToFPTAI(voice: Voice): string {
    // Map internal voice IDs to FPT.AI voice names
    const mapping: Record<string, string> = {
      'vi-female-north-young': 'leminh',
      'vi-male-north-adult': 'banmai',
      'vi-female-south-adult': 'thuminh',
      'vi-male-central-adult': 'giahuy',
      'vi-female-north-adult': 'lannhi'
    };
    
    return mapping[voice.id] || 'leminh'; // Default to leminh
  }

  private mapVoiceToCoqui(voice: Voice): string {
    // Map internal voice IDs to Coqui speaker indices
    const mapping: Record<string, string> = {
      'vi-female-north-young': '0',
      'vi-male-north-adult': '1',
      'vi-female-south-adult': '2',
      'vi-male-central-adult': '3',
      'vi-female-north-adult': '4'
    };
    
    return mapping[voice.id] || '0'; // Default to speaker 0
  }
}