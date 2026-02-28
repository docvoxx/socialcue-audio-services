---
title: SocialCue Audio Services
emoji: 🎤
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# SocialCue Audio Services Gateway

Audio Services Gateway for SocialCue - Authentication and routing for Speech-to-Text (STT) and Text-to-Speech (TTS) services.

## 🚀 API Endpoints

### Health Check
```bash
curl https://lannnsleepy-socialcue-audio.hf.space/health/live
```

### Text-to-Speech (requires auth)
```bash
curl -X POST https://lannnsleepy-socialcue-audio.hf.space/v1/tts/synthesize \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "voice": "default",
    "language": "en"
  }'
```

### Speech-to-Text (requires auth)
```bash
curl -X POST https://lannnsleepy-socialcue-audio.hf.space/v1/stt/transcribe \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "audio=@audio.wav"
```

## 🔑 Authentication

All API endpoints (except `/health`) require Bearer token authentication:

```
Authorization: Bearer YOUR_API_KEY
```

Set your API keys in Space Settings → Variables:
```
API_KEYS=key1,key2,key3
```

## 📝 Environment Variables

Required:
- `API_KEYS` - Comma-separated list of valid API keys

Optional:
- `STT_SERVICE_URL` - URL for STT service (default: http://stt-service:3005)
- `TTS_SERVICE_URL` - URL for TTS service (default: http://tts-service:3006)

## 🏗️ Architecture

This is the API Gateway for SocialCue Audio Services. It handles:
- Authentication via API keys
- Request routing to internal services
- File upload handling (for audio files)
- Rate limiting and logging
- Error handling

For full microservices deployment with STT and TTS services, see the main repository.
