import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // API Keys
  apiKeys: (process.env.API_KEYS || '').split(',').filter(k => k.length > 0),
  
  // Internal service URLs
  services: {
    stt: process.env.STT_SERVICE_URL || 'http://stt-service:3005',
    tts: process.env.TTS_SERVICE_URL || 'http://tts-service:3006',
  },
  
  // Service metadata
  serviceName: process.env.SERVICE_NAME || 'audio-gateway',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  
  // Timeouts
  timeouts: {
    stt: parseInt(process.env.STT_TIMEOUT || '30000', 10),
    tts: parseInt(process.env.TTS_TIMEOUT || '30000', 10),
  },
};

// Validate required configuration
export function validateConfig(): void {
  if (config.apiKeys.length === 0) {
    throw new Error('API_KEYS environment variable is required');
  }
  
  console.log('Configuration loaded:', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    apiKeysCount: config.apiKeys.length,
    services: config.services,
  });
}
