# SocialCue Audio Services

> **Note**: This project was developed with AI assistance to accelerate development and ensure best practices.

Independent deployment of Audio services (STT, TTS) for SocialCue application.

## Overview

This project provides Audio microservices separated from the main application, enabling:
- Independent deployment on CPU-optimized infrastructure
- Isolated scaling based on audio workload
- Clear API boundaries with authentication
- Idempotency support for reliable audio processing

## Architecture

```
socialcue-audio-services/
├── gateway/              # API Gateway (Port 3002 - External)
│   ├── src/
│   │   ├── middleware/  # Auth, logging, error handling
│   │   ├── routes/      # STT, TTS, Health routes
│   │   └── services/    # Health aggregation
│   └── Dockerfile
├── services/
│   ├── stt-service/     # Speech-to-Text (Port 3005 - Internal)
│   └── tts-service/     # Text-to-Speech (Port 3006 - Internal)
├── shared/              # Shared types and utilities
├── docker-compose.yml   # Base configuration
├── docker-compose.dev.yml # Development overrides
└── docker-compose.production.yml # Production configuration
```

## Services

### Audio Gateway (Port 3002 - External)
**Responsibilities:**
- API key authentication (`Authorization: Bearer <API_KEY>`)
- Request routing to internal services
- Health check aggregation
- Request/response logging with trace IDs
- Multipart form data handling for audio uploads
- Error normalization

**Endpoints:**
- `POST /v1/stt/transcribe` - Speech-to-text transcription
- `POST /v1/tts/synthesize` - Text-to-speech synthesis
- `GET /v1/tts/voices` - List available voices
- `GET /health` - Detailed health status
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

### STT Service (Port 3005 - Internal Only)
**Capabilities:**
- Speech-to-text using Whisper model
- Multiple audio format support (wav, mp3, m4a, ogg, flac)
- Language detection and dialect hints
- Speaker diarization (optional)
- Confidence scoring
- Idempotency support for duplicate request handling

**Limits:**
- Max file size: 25 MB
- Max duration: 300 seconds (5 minutes)
- Supported sample rates: 8000-48000 Hz

### TTS Service (Port 3006 - Internal Only)
**Capabilities:**
- Text-to-speech synthesis
- Multiple voice support
- Adjustable speech speed (0.5x - 2.0x)
- Multiple output formats (wav, mp3)
- Idempotency support for duplicate request handling

**Limits:**
- Max text length: 5000 characters
- Max concurrency: 5 requests

## Prerequisites

### Required
- **Docker**: Version 24.0 or higher
- **Docker Compose**: Version 2.0 or higher
- **Network**: External Docker network `socialcue-external` for service communication

### System Requirements
- **CPU**: Multi-core processor (4+ cores recommended)
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 10GB free space for models and temporary audio files

## Installation

### 1. Clone and Setup
```bash
cd socialcue-audio-services
cp .env.example .env
```

### 2. Create External Network
```bash
docker network create socialcue-external
```

### 3. Configure Environment Variables

Edit `.env` file:

```bash
# Gateway Configuration
PORT=3000
NODE_ENV=production
API_KEYS=dev-key-1,dev-key-2,dev-key-3

# Redis Configuration
REDIS_URL=redis://redis:6379

# STT Configuration
STT_MAX_CONCURRENCY=3
MAX_AUDIO_MB=25
MAX_AUDIO_SECONDS=300

# TTS Configuration
TTS_MAX_CONCURRENCY=5
MAX_TEXT_CHARS=5000

# Service URLs (Internal)
STT_SERVICE_URL=http://stt-service:3005
TTS_SERVICE_URL=http://tts-service:3006

# Logging
LOG_LEVEL=info
```

### 4. Start Services

```bash
# Development mode
docker compose up -d

# Production mode
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

### 5. Verify Deployment

```bash
# Check all services are healthy
curl -H "Authorization: Bearer dev-key-1" http://localhost:3002/health
```

## API Usage

### Authentication

All requests require API key authentication:

```bash
curl -X POST http://localhost:3002/v1/stt/transcribe \
  -H "Authorization: Bearer dev-key-1" \
  -F "file=@audio.wav" \
  -F "language=vi"
```

### Speech-to-Text (STT)

**Basic transcription:**
```bash
curl -X POST http://localhost:3002/v1/stt/transcribe \
  -H "Authorization: Bearer dev-key-1" \
  -F "file=@audio.wav" \
  -F "language=vi"
```

**With idempotency key (for retries):**
```bash
curl -X POST http://localhost:3002/v1/stt/transcribe \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Idempotency-Key: unique-request-id-123" \
  -F "file=@audio.wav" \
  -F "language=vi"
```

### Text-to-Speech (TTS)

**Basic synthesis:**
```bash
curl -X POST http://localhost:3002/v1/tts/synthesize \
  -H "Authorization: Bearer dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test",
    "voice": "default",
    "speed": 1.0,
    "format": "wav"
  }' \
  --output audio.wav
```

**List available voices:**
```bash
curl -X GET http://localhost:3002/v1/tts/voices \
  -H "Authorization: Bearer dev-key-1"
```

## Development

### Local Development Setup

```bash
# Install dependencies
npm install

# Build shared package
cd shared && npm run build && cd ..

# Start development mode
npm run dev

# Run tests
npm run test

# Build all services
npm run build
```

## Network Configuration

This project uses an external Docker network (`socialcue-external`) to enable communication with other services (e.g., AI Services, Main App).

**Services are accessible via DNS names:**
- `audio-gateway:3000` - Audio Gateway (from other containers)
- `localhost:3002` - Audio Gateway (from host machine)

## Security

### Network Isolation
- Internal services (STT, TTS) are NOT exposed to the host
- Only the gateway (port 3002) is accessible externally
- Services communicate via internal Docker network

### Authentication
- All requests require `Authorization: Bearer <API_KEY>` header
- Multiple API keys supported for key rotation
- Invalid keys return HTTP 403
- Missing auth returns HTTP 401

### Idempotency
- STT and TTS support `X-Idempotency-Key` header
- Duplicate requests within 60 seconds return cached responses
- Prevents duplicate processing on network retries
- Idempotency keys stored in Redis with 60-second TTL

## Monitoring and Health Checks

### Health Endpoints

**Liveness Probe** (`GET /health/live`):
```bash
curl http://localhost:3002/health/live
```

**Readiness Probe** (`GET /health/ready`):
```bash
curl http://localhost:3002/health/ready
```

**Detailed Health** (`GET /health`):
```bash
curl -H "Authorization: Bearer dev-key-1" http://localhost:3002/health
```

## Troubleshooting

### Services Won't Start

```bash
# Check Docker logs
docker compose logs -f

# Check specific service
docker compose logs stt-service
```

### Authentication Failures

```bash
# Verify API key in .env
cat .env | grep API_KEYS

# Test with correct key
curl -H "Authorization: Bearer dev-key-1" http://localhost:3002/health
```

### Network Issues

```bash
# Verify external network exists
docker network ls | grep socialcue-external

# Create if missing
docker network create socialcue-external
```

## Deployment

### Production Deployment

1. Configure production environment
2. Build and start services
3. Verify health endpoints
4. Monitor logs for errors

### Scaling

```bash
# Scale individual services
docker compose up -d --scale stt-service=3
docker compose up -d --scale tts-service=2
```

## Integration with Main Application

**Main application configuration:**
```bash
# In main app .env
AUDIO_SERVICES_URL=http://audio-gateway:3000  # Use DNS name in Docker network
AUDIO_API_KEY=your-secret-key-1
```

## License

MIT

## Development Notes

This project was developed with AI assistance to:
- Accelerate microservices architecture implementation
- Ensure TypeScript best practices
- Implement comprehensive error handling
- Create production-ready Docker configurations
- Generate API documentation
- Implement idempotency patterns for reliable audio processing

