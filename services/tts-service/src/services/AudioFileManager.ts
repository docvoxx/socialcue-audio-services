import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { logger } from '@socialcue-audio-services/shared';

export class AudioFileManager {
  private audioDir: string;
  private maxFileSize: number;
  private allowedFormats: Set<string>;

  constructor() {
    this.audioDir = process.env.AUDIO_STORAGE_DIR || '/tmp/audio';
    this.maxFileSize = parseInt(process.env.MAX_AUDIO_FILE_SIZE || '10485760'); // 10MB default
    this.allowedFormats = new Set(['mp3', 'wav']);
    this.ensureAudioDir();
  }

  private async ensureAudioDir(): Promise<void> {
    try {
      await fs.mkdir(this.audioDir, { recursive: true });
      logger.info('Audio directory initialized', { service: 'tts-service', audioDir: this.audioDir });
    } catch (error) {
      logger.error('Failed to create audio directory', error instanceof Error ? error : new Error(String(error)), { service: 'tts-service', audioDir: this.audioDir });
      throw error;
    }
  }

  async saveAudioFile(filename: string, audioBuffer: Buffer): Promise<string> {
    try {
      // Validate filename
      if (!this.isValidFilename(filename)) {
        throw new Error(`Invalid filename: ${filename}`);
      }

      // Check file size
      if (audioBuffer.length > this.maxFileSize) {
        throw new Error(`Audio file too large: ${audioBuffer.length} bytes (max: ${this.maxFileSize})`);
      }

      const filePath = join(this.audioDir, filename);
      
      // Ensure the file doesn't already exist
      try {
        await fs.access(filePath);
        throw new Error(`File already exists: ${filename}`);
      } catch (error) {
        // File doesn't exist, which is what we want
      }

      // Write the audio file
      await fs.writeFile(filePath, audioBuffer);
      
      // Set file metadata
      await this.setFileMetadata(filePath, {
        createdAt: new Date(),
        size: audioBuffer.length,
        format: this.getFileFormat(filename)
      });

      logger.info('Audio file saved', {
        service: 'tts-service',
        filename,
        size: audioBuffer.length,
        path: filePath
      });

      return filePath;
    } catch (error) {
      logger.error('Failed to save audio file', error instanceof Error ? error : new Error(String(error)), {
        service: 'tts-service',
        filename,
        size: audioBuffer.length
      });
      throw error;
    }
  }

  async getAudioFile(filename: string): Promise<string | null> {
    try {
      if (!this.isValidFilename(filename)) {
        return null;
      }

      const filePath = join(this.audioDir, filename);
      
      // Check if file exists and is accessible
      await fs.access(filePath);
      
      // Verify it's actually an audio file
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        return null;
      }

      return resolve(filePath);
    } catch (error) {
      logger.warn('Audio file not found or inaccessible', {
        service: 'tts-service',
        filename,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  async deleteAudioFile(filename: string): Promise<boolean> {
    try {
      if (!this.isValidFilename(filename)) {
        return false;
      }

      const filePath = join(this.audioDir, filename);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (error) {
        // File doesn't exist
        return false;
      }

      // Delete the file
      await fs.unlink(filePath);
      
      // Also delete metadata file if it exists
      const metadataPath = `${filePath}.meta`;
      try {
        await fs.unlink(metadataPath);
      } catch (error) {
        // Metadata file might not exist, ignore error
      }

      logger.info('Audio file deleted', { service: 'tts-service', filename, path: filePath });
      return true;
    } catch (error) {
      logger.error('Failed to delete audio file', error instanceof Error ? error : new Error(String(error)), {
        service: 'tts-service',
        filename
      });
      return false;
    }
  }

  async listAudioFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.audioDir);
      return files.filter(file => 
        this.allowedFormats.has(this.getFileFormat(file)) && 
        !file.endsWith('.meta')
      );
    } catch (error) {
      logger.error('Failed to list audio files', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async getFileInfo(filename: string): Promise<{
    size: number;
    createdAt: Date;
    format: string;
    exists: boolean;
  } | null> {
    try {
      const filePath = join(this.audioDir, filename);
      const stats = await fs.stat(filePath);
      
      const metadata = await this.getFileMetadata(filePath);
      
      return {
        size: stats.size,
        createdAt: metadata?.createdAt || stats.birthtime,
        format: this.getFileFormat(filename),
        exists: true
      };
    } catch (error) {
      return null;
    }
  }

  async cleanupExpiredFiles(maxAgeHours: number = 24): Promise<number> {
    try {
      const files = await this.listAudioFiles();
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const filename of files) {
        try {
          const fileInfo = await this.getFileInfo(filename);
          if (fileInfo && fileInfo.createdAt.getTime() < cutoffTime) {
            const deleted = await this.deleteAudioFile(filename);
            if (deleted) {
              deletedCount++;
            }
          }
        } catch (error) {
          logger.warn('Failed to check file age during cleanup', { service: 'tts-service', filename, error });
        }
      }

      logger.info('Audio file cleanup completed', {
        service: 'tts-service',
        deletedCount,
        maxAgeHours,
        totalFiles: files.length
      });

      return deletedCount;
    } catch (error) {
      logger.error('Audio file cleanup failed', error instanceof Error ? error : new Error(String(error)));
      return 0;
    }
  }

  private isValidFilename(filename: string): boolean {
    // Check for valid filename format
    const validPattern = /^[a-zA-Z0-9_-]+\.(mp3|wav)$/;
    return validPattern.test(filename) && filename.length <= 255;
  }

  private getFileFormat(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext || '';
  }

  private async setFileMetadata(filePath: string, metadata: {
    createdAt: Date;
    size: number;
    format: string;
  }): Promise<void> {
    try {
      const metadataPath = `${filePath}.meta`;
      await fs.writeFile(metadataPath, JSON.stringify(metadata));
    } catch (error) {
      // Metadata is optional, don't fail if we can't write it
      logger.warn('Failed to write file metadata', { service: 'tts-service', error, filePath });
    }
  }

  private async getFileMetadata(filePath: string): Promise<{
    createdAt: Date;
    size: number;
    format: string;
  } | null> {
    try {
      const metadataPath = `${filePath}.meta`;
      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data);
      return {
        ...metadata,
        createdAt: new Date(metadata.createdAt)
      };
    } catch (error) {
      return null;
    }
  }
}