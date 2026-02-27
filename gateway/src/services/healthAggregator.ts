import axios from 'axios';
import { config } from '../config';

interface ServiceHealth {
  status: 'up' | 'down';
  latency?: number;
  version?: string;
  message?: string;
}

interface HealthResponse {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  dependencies: {
    [key: string]: ServiceHealth;
  };
}

export class HealthAggregator {
  private serviceURLs: Map<string, string>;

  constructor() {
    this.serviceURLs = new Map([
      ['stt', config.services.stt],
      ['tts', config.services.tts],
    ]);
  }

  /**
   * Aggregate health status from all internal audio services
   * Returns overall status based on individual service health
   */
  async aggregateHealth(): Promise<HealthResponse> {
    const dependencies: { [key: string]: ServiceHealth } = {};

    // Check each internal service
    for (const [name, url] of this.serviceURLs.entries()) {
      try {
        const serviceStart = Date.now();
        const response = await axios.get(`${url}/health`, {
          timeout: 2000,
          validateStatus: () => true, // Accept any status code
        });
        
        const latency = Date.now() - serviceStart;
        
        dependencies[name] = {
          status: response.status === 200 ? 'up' : 'down',
          latency,
          version: response.data?.version,
        };
      } catch (error) {
        dependencies[name] = {
          status: 'down',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // Determine overall status
    const serviceStatuses = Object.values(dependencies).map(dep => dep.status);
    const allUp = serviceStatuses.every(status => status === 'up');
    const allDown = serviceStatuses.every(status => status === 'down');
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (allUp) {
      overallStatus = 'healthy';
    } else if (allDown) {
      overallStatus = 'unhealthy';
    } else {
      overallStatus = 'degraded';
    }

    return {
      service: config.serviceName,
      status: overallStatus,
      version: config.serviceVersion,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }
}
