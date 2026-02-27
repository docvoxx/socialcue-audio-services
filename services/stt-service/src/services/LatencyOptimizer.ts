import { createServiceLogger } from '@socialcue-audio-services/shared';

const logger = createServiceLogger('stt-service');

interface LatencyMetrics {
  preprocessing: number;
  transcription: number;
  postprocessing: number;
  total: number;
}

interface OptimizationConfig {
  targetLatencyMs: number;
  maxLatencyMs: number;
  adaptiveQuality: boolean;
  enableCaching: boolean;
  enableParallelProcessing: boolean;
}

export class LatencyOptimizer {
  private config: OptimizationConfig;
  private recentMetrics: LatencyMetrics[] = [];
  private readonly metricsWindowSize = 100;
  private readonly targetLatency = 2000; // 2 seconds target

  constructor(config?: Partial<OptimizationConfig>) {
    this.config = {
      targetLatencyMs: 2000,
      maxLatencyMs: 5000,
      adaptiveQuality: true,
      enableCaching: true,
      enableParallelProcessing: true,
      ...config,
    };
    
    // Suppress unused variable warning - will be used in future implementation
    void this.targetLatency;
  }

  recordMetrics(metrics: LatencyMetrics): void {
    this.recentMetrics.push(metrics);
    
    // Keep only recent metrics
    if (this.recentMetrics.length > this.metricsWindowSize) {
      this.recentMetrics.shift();
    }
    
    // Log performance issues
    if (metrics.total > this.config.maxLatencyMs) {
      logger.warn('High latency detected', {
        total: metrics.total,
        target: this.config.targetLatencyMs,
        max: this.config.maxLatencyMs,
        breakdown: metrics,
      });
    }
  }

  getOptimizationRecommendations(): {
    shouldReduceQuality: boolean;
    shouldEnableCache: boolean;
    shouldUseParallelProcessing: boolean;
    recommendedChunkSize: number;
    recommendedModelSize: 'small' | 'base' | 'large';
  } {
    const avgLatency = this.getAverageLatency();
    const p95Latency = this.getP95Latency();
    
    return {
      shouldReduceQuality: p95Latency > this.config.targetLatencyMs,
      shouldEnableCache: avgLatency > this.config.targetLatencyMs * 0.8,
      shouldUseParallelProcessing: avgLatency > this.config.targetLatencyMs * 0.6,
      recommendedChunkSize: this.getRecommendedChunkSize(avgLatency),
      recommendedModelSize: this.getRecommendedModelSize(p95Latency),
    };
  }

  private getAverageLatency(): number {
    if (this.recentMetrics.length === 0) return 0;
    
    const sum = this.recentMetrics.reduce((acc, metrics) => acc + metrics.total, 0);
    return sum / this.recentMetrics.length;
  }

  private getP95Latency(): number {
    if (this.recentMetrics.length === 0) return 0;
    
    const sorted = this.recentMetrics
      .map(m => m.total)
      .sort((a, b) => a - b);
    
    const p95Index = Math.floor(sorted.length * 0.95);
    return sorted[p95Index] || 0;
  }

  private getRecommendedChunkSize(avgLatency: number): number {
    // Smaller chunks for better latency, larger chunks for better accuracy
    if (avgLatency > this.config.targetLatencyMs) {
      return 1000; // 1 second chunks
    } else if (avgLatency > this.config.targetLatencyMs * 0.7) {
      return 2000; // 2 second chunks
    } else {
      return 3000; // 3 second chunks
    }
  }

  private getRecommendedModelSize(p95Latency: number): 'small' | 'base' | 'large' {
    if (p95Latency > this.config.maxLatencyMs) {
      return 'small'; // Fastest model
    } else if (p95Latency > this.config.targetLatencyMs) {
      return 'base'; // Balanced model
    } else {
      return 'large'; // Best quality model
    }
  }

  async optimizeAudioProcessing(audioBuffer: ArrayBuffer): Promise<{
    optimizedBuffer: ArrayBuffer;
    optimizations: string[];
  }> {
    const optimizations: string[] = [];
    let optimizedBuffer = audioBuffer;
    
    const recommendations = this.getOptimizationRecommendations();
    
    // Apply optimizations based on current performance
    if (recommendations.shouldReduceQuality) {
      optimizedBuffer = await this.reduceAudioQuality(optimizedBuffer);
      optimizations.push('reduced_quality');
    }
    
    if (recommendations.recommendedChunkSize < 2000) {
      optimizedBuffer = await this.splitIntoChunks(optimizedBuffer, recommendations.recommendedChunkSize);
      optimizations.push('chunked_processing');
    }
    
    return {
      optimizedBuffer,
      optimizations,
    };
  }

  private async reduceAudioQuality(audioBuffer: ArrayBuffer): Promise<ArrayBuffer> {
    // Simple quality reduction by downsampling
    const samples = new Float32Array(audioBuffer);
    const downsampleFactor = 2; // Reduce by half
    
    const downsampled = new Float32Array(Math.floor(samples.length / downsampleFactor));
    for (let i = 0; i < downsampled.length; i++) {
      downsampled[i] = samples[i * downsampleFactor];
    }
    
    return downsampled.buffer;
  }

  private async splitIntoChunks(audioBuffer: ArrayBuffer, _chunkSizeMs: number): Promise<ArrayBuffer> {
    // For now, return the original buffer
    // In a full implementation, this would split the audio into smaller chunks
    return audioBuffer;
  }

  getPerformanceReport(): {
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
    totalRequests: number;
    slowRequests: number;
    breakdown: {
      preprocessing: number;
      transcription: number;
      postprocessing: number;
    };
  } {
    if (this.recentMetrics.length === 0) {
      return {
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        totalRequests: 0,
        slowRequests: 0,
        breakdown: { preprocessing: 0, transcription: 0, postprocessing: 0 },
      };
    }

    const sorted = this.recentMetrics
      .map(m => m.total)
      .sort((a, b) => a - b);

    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    const slowRequests = this.recentMetrics.filter(
      m => m.total > this.config.targetLatencyMs
    ).length;

    const avgBreakdown = this.recentMetrics.reduce(
      (acc, metrics) => ({
        preprocessing: acc.preprocessing + metrics.preprocessing,
        transcription: acc.transcription + metrics.transcription,
        postprocessing: acc.postprocessing + metrics.postprocessing,
      }),
      { preprocessing: 0, transcription: 0, postprocessing: 0 }
    );

    const count = this.recentMetrics.length;

    return {
      averageLatency: this.getAverageLatency(),
      p95Latency: sorted[p95Index] || 0,
      p99Latency: sorted[p99Index] || 0,
      totalRequests: count,
      slowRequests,
      breakdown: {
        preprocessing: avgBreakdown.preprocessing / count,
        transcription: avgBreakdown.transcription / count,
        postprocessing: avgBreakdown.postprocessing / count,
      },
    };
  }

  shouldTriggerDegradation(): boolean {
    const p95Latency = this.getP95Latency();
    return p95Latency > this.config.maxLatencyMs;
  }

  reset(): void {
    this.recentMetrics = [];
  }
}