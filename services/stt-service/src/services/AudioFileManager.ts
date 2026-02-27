import { promises as fs } from 'fs';
import { join } from 'path';
import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

interface AudioFile {
  id: string;
  path: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
  format: string;
}

export class AudioFileManager {
  private readonly storageDir: string;
  private readonly maxFileAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private readonly maxStorageSize = 1024 * 1024 * 1024; // 1GB max storage
  private readonly cleanupInterval = 60 * 60 * 1000; // 1 hour cleanup interval
  private audioFiles: Map<string, AudioFile> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(storageDir: string = './temp/audio') {
    this.storageDir = storageDir;
    this.initializeStorage();
    this.startCleanupTimer();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      await this.loadExistingFiles();
      logger.info('Audio file manager initialized', { 
        storageDir: this.storageDir,
        existingFiles: this.audioFiles.size 
      });
    } catch (error) {
      logger.error('Failed to initialize audio storage:', error);
      throw error;
    }
  }

  private async loadExistingFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);
      
      for (const filename of files) {
        const filePath = join(this.storageDir, filename);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile() && this.isAudioFile(filename)) {
          const audioFile: AudioFile = {
            id: this.extractIdFromFilename(filename),
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime,
            expiresAt: new Date(stats.birthtime.getTime() + this.maxFileAge),
            format: this.extractFormatFromFilename(filename),
          };
          
          this.audioFiles.set(audioFile.id, audioFile);
        }
      }
    } catch (error) {
      logger.error('Failed to load existing audio files:', error);
    }
  }

  async saveAudioFile(
    audioData: ArrayBuffer,
    format: string = 'wav',
    id?: string
  ): Promise<string> {
    const fileId = id || this.generateFileId();
    const filename = `${fileId}.${format}`;
    const filePath = join(this.storageDir, filename);
    
    try {
      // Check storage limits
      await this.enforceStorageLimits();
      
      // Save file
      await fs.writeFile(filePath, Buffer.from(audioData));
      
      const stats = await fs.stat(filePath);
      const audioFile: AudioFile = {
        id: fileId,
        path: filePath,
        size: stats.size,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.maxFileAge),
        format,
      };
      
      this.audioFiles.set(fileId, audioFile);
      
      logger.info('Audio file saved', {
        fileId,
        size: stats.size,
        format,
        path: filePath,
      });
      
      return fileId;
    } catch (error) {
      logger.error('Failed to save audio file:', error);
      throw new Error(`Failed to save audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAudioFile(fileId: string): Promise<ArrayBuffer | null> {
    const audioFile = this.audioFiles.get(fileId);
    if (!audioFile) {
      return null;
    }
    
    // Check if file has expired
    if (Date.now() > audioFile.expiresAt.getTime()) {
      await this.deleteAudioFile(fileId);
      return null;
    }
    
    try {
      const buffer = await fs.readFile(audioFile.path);
      return buffer.buffer;
    } catch (error) {
      logger.error('Failed to read audio file:', error);
      // File might have been deleted externally
      this.audioFiles.delete(fileId);
      return null;
    }
  }

  async deleteAudioFile(fileId: string): Promise<boolean> {
    const audioFile = this.audioFiles.get(fileId);
    if (!audioFile) {
      return false;
    }
    
    try {
      await fs.unlink(audioFile.path);
      this.audioFiles.delete(fileId);
      
      logger.info('Audio file deleted', { fileId, path: audioFile.path });
      return true;
    } catch (error) {
      logger.error('Failed to delete audio file:', error);
      // Remove from tracking even if file deletion failed
      this.audioFiles.delete(fileId);
      return false;
    }
  }

  async cleanupExpiredFiles(): Promise<number> {
    const currentTime = Date.now();
    const expiredFiles: string[] = [];
    
    for (const [fileId, audioFile] of this.audioFiles.entries()) {
      if (currentTime > audioFile.expiresAt.getTime()) {
        expiredFiles.push(fileId);
      }
    }
    
    let deletedCount = 0;
    for (const fileId of expiredFiles) {
      if (await this.deleteAudioFile(fileId)) {
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      logger.info('Cleaned up expired audio files', { deletedCount });
    }
    
    return deletedCount;
  }

  private async enforceStorageLimits(): Promise<void> {
    const totalSize = Array.from(this.audioFiles.values())
      .reduce((sum, file) => sum + file.size, 0);
    
    if (totalSize > this.maxStorageSize) {
      // Delete oldest files until under limit
      const sortedFiles = Array.from(this.audioFiles.values())
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      let currentSize = totalSize;
      for (const file of sortedFiles) {
        if (currentSize <= this.maxStorageSize * 0.8) break; // Leave 20% buffer
        
        await this.deleteAudioFile(file.id);
        currentSize -= file.size;
      }
      
      logger.info('Enforced storage limits', {
        originalSize: totalSize,
        newSize: currentSize,
        maxSize: this.maxStorageSize,
      });
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredFiles();
      } catch (error) {
        logger.error('Cleanup timer error:', error);
      }
    }, this.cleanupInterval);
  }

  private generateFileId(): string {
    return `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isAudioFile(filename: string): boolean {
    const audioExtensions = ['.wav', '.mp3', '.webm', '.ogg', '.m4a'];
    return audioExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  private extractIdFromFilename(filename: string): string {
    return filename.split('.')[0];
  }

  private extractFormatFromFilename(filename: string): string {
    const parts = filename.split('.');
    return parts[parts.length - 1].toLowerCase();
  }

  getStorageStats(): {
    totalFiles: number;
    totalSize: number;
    oldestFile?: Date;
    newestFile?: Date;
  } {
    const files = Array.from(this.audioFiles.values());
    
    return {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      oldestFile: files.length > 0 ? 
        new Date(Math.min(...files.map(f => f.createdAt.getTime()))) : undefined,
      newestFile: files.length > 0 ? 
        new Date(Math.max(...files.map(f => f.createdAt.getTime()))) : undefined,
    };
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Final cleanup
    await this.cleanupExpiredFiles();
    
    logger.info('Audio file manager shutdown complete');
  }
}