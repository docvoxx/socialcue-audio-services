# Hướng dẫn Deploy và Gọi API - Audio Services

## Bước 1: Chuẩn bị môi trường

### 1.0. Tạo Shared Network (Quan trọng!)

**Chỉ cần làm 1 lần** để AI, Audio và Main App gọi được nhau:
```bash
docker network create socialcue-external
```

**Lưu ý**: Network này cho phép:
- Main App gọi AI Services qua DNS: `http://ai-gateway:3000`
- Main App gọi Audio Services qua DNS: `http://audio-gateway:3000`
- Từ host machine: AI = `http://localhost:3001`, Audio = `http://localhost:3002`

### 1.1. Kiểm tra Docker
```bash
docker --version
docker compose version
```

### 1.2. Tạo file .env
File `.env` đã được tạo từ `.env.example`. Bạn có thể chỉnh sửa nếu cần:
```bash
# Mở file .env để chỉnh sửa
notepad .env
```

**Quan trọng**: Đổi API_KEYS thành key bảo mật của bạn:
```env
API_KEYS=your-secret-key-here
```

## Bước 2: Build và Deploy Services

### 2.1. Build và khởi động services
```bash
cd socialcue-audio-services
docker compose --env-file .env up -d --build
```

Quá trình build sẽ mất 5-10 phút lần đầu.

### 2.2. Kiểm tra services đang chạy
```bash
docker compose ps
```

Bạn sẽ thấy:
- `audio-gateway` - Port 3002:3000 (host:container)
- `stt-service` - Internal only
- `tts-service` - Internal only
- `redis` - Internal only

### 2.3. Xem logs
```bash
# Xem tất cả logs
docker compose logs -f

# Xem logs của một service cụ thể
docker compose logs -f audio-gateway
docker compose logs -f stt-service
docker compose logs -f tts-service
```

## Bước 3: Kiểm tra Health (Đúng Spec)

### 3.1. Kiểm tra Gateway
```bash
# Health check tổng quan
curl http://localhost:3002/health

# Liveness probe
curl http://localhost:3002/health/live

# Readiness probe
curl http://localhost:3002/health/ready
```

Kết quả mong đợi:
```json
{
  "service": "audio-gateway",
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 123.45,
  "timestamp": "2026-02-27T...",
  "dependencies": {
    "stt": {
      "status": "up",
      "latency": 30,
      "version": "1.0.0"
    },
    "tts": {
      "status": "up",
      "latency": 25,
      "version": "1.0.0"
    }
  }
}
```

## Bước 4: Gọi API (Đúng Spec)

### 4.1. Lấy API Key
Từ file `.env`, copy giá trị của `API_KEYS`. Ví dụ: `dev-key-1`

### 4.2. Test API với curl (Đúng Contract)

**LƯU Ý**: Tất cả endpoint phải có prefix `/v1/` theo spec.

#### A. STT Service - Speech to Text
```bash
curl -X POST http://localhost:3002/v1/stt/transcribe \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Request-Id: 44444444-4444-4444-4444-444444444444" \
  -H "X-Idempotency-Key: stt-test-1" \
  -F "file=@audio.wav" \
  -F "language=vi" \
  -F "diarize=false"
```

**Response:**
```json
{
  "text": "Xin chào, tôi muốn học tiếng Anh",
  "confidence": 0.95,
  "language": "vi",
  "duration": 3.5,
  "trace_id": "44444444-4444-4444-4444-444444444444"
}
```

**Với diarization (phân tách người nói):**
```bash
curl -X POST http://localhost:3002/v1/stt/transcribe \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Idempotency-Key: stt-test-2" \
  -F "file=@audio.wav" \
  -F "language=vi" \
  -F "diarize=true"
```

**Response với segments:**
```json
{
  "text": "Xin chào, tôi là trợ lý AI",
  "confidence": 0.95,
  "language": "vi",
  "duration": 3.5,
  "segments": [
    {
      "start": 0.0,
      "end": 1.5,
      "speaker": "spk0",
      "text": "Xin chào",
      "confidence": 0.96
    },
    {
      "start": 1.5,
      "end": 3.5,
      "speaker": "spk0",
      "text": "tôi là trợ lý AI",
      "confidence": 0.94
    }
  ],
  "trace_id": "..."
}
```

#### B. TTS Service - Text to Speech
```bash
curl -X POST http://localhost:3002/v1/tts/synthesize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Request-Id: 55555555-5555-5555-5555-555555555555" \
  -H "X-Idempotency-Key: tts-test-1" \
  -d '{
    "text": "Xin chào, tôi là trợ lý ảo của bạn",
    "voice": "default",
    "speed": 1.0,
    "format": "mp3"
  }' \
  --output output.mp3
```

File `output.mp3` sẽ được tạo ra (binary audio data).

#### C. List Voices
```bash
curl http://localhost:3002/v1/tts/voices \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Request-Id: 66666666-6666-6666-6666-666666666666"
```

**Response:**
```json
{
  "voices": [
    {
      "id": "default",
      "name": "Default Voice",
      "language": "vi",
      "gender": "neutral"
    },
    {
      "id": "female-1",
      "name": "Female Voice 1",
      "language": "vi",
      "gender": "female"
    }
  ],
  "trace_id": "66666666-6666-6666-6666-666666666666"
}
```

### 4.3. Test với JavaScript/Node.js (Đúng Spec)

#### STT Example (field = "file", không phải "audio")
```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const API_BASE_URL = 'http://localhost:3002';
const API_KEY = 'dev-key-1';

async function transcribeAudio(audioFilePath) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('language', 'vi');
    formData.append('diarize', 'false');
    
    const response = await axios.post(
      `${API_BASE_URL}/v1/stt/transcribe`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${API_KEY}`,
          'X-Request-Id': crypto.randomUUID?.() || `${Date.now()}`,
          'X-Idempotency-Key': `stt-${Date.now()}`
        },
        timeout: 120000  // 2 minutes for audio processing
      }
    );
    
    console.log('Transcription:', response.data);
    console.log('Text:', response.data.text);
    console.log('Confidence:', response.data.confidence);
    console.log('Duration:', response.data.duration, 'seconds');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

transcribeAudio('./audio.wav');
```

#### TTS Example (responseType = "arraybuffer")
```javascript
const axios = require('axios');
const fs = require('fs');

const API_BASE_URL = 'http://localhost:3002';
const API_KEY = 'dev-key-1';

async function synthesizeSpeech(text, outputPath) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/v1/tts/synthesize`,
      {
        text: text,
        voice: 'default',
        speed: 1.0,
        format: 'mp3'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'X-Request-Id': crypto.randomUUID?.() || `${Date.now()}`,
          'X-Idempotency-Key': `tts-${Date.now()}`
        },
        responseType: 'arraybuffer',
        timeout: 60000
      }
    );
    
    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log('Audio saved to:', outputPath);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

synthesizeSpeech('Xin chào, tôi là trợ lý ảo', './output.mp3');
```

### 4.4. Idempotency (Quan trọng!)

Audio services hỗ trợ idempotency để tránh xử lý trùng lặp:

```bash
# Request đầu tiên - xử lý audio
curl -X POST http://localhost:3002/v1/stt/transcribe \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Idempotency-Key: unique-key-123" \
  -F "file=@audio.wav"

# Request thứ 2 với cùng idempotency key - trả về kết quả cached (nhanh hơn)
curl -X POST http://localhost:3002/v1/stt/transcribe \
  -H "Authorization: Bearer dev-key-1" \
  -H "X-Idempotency-Key: unique-key-123" \
  -F "file=@audio.wav"
```

## Bước 5: Gọi từ Main App (Integration)

### 5.1. Cấu hình trong Main App

**Trường hợp 1 - Main App chạy trong Docker (khuyên dùng):**

Main App phải join network `socialcue-external` trong docker-compose:
```yaml
networks:
  - socialcue-network
  - external

networks:
  external:
    name: socialcue-external
    external: true
```

Trong `.env` của `socialcue-coach-advanced`:
```env
# Audio Services (dùng DNS name trong Docker network)
AUDIO_SERVICES_URL=http://audio-gateway:3000
AUDIO_API_KEY=your-secret-key-here
```

**Trường hợp 2 - Main App chạy local (không Docker):**

Trong `.env` của `socialcue-coach-advanced`:
```env
# Audio Services (dùng localhost với host port)
AUDIO_SERVICES_URL=http://localhost:3002
AUDIO_API_KEY=your-secret-key-here
```

### 5.2. Test từ Main App Container

Nếu Main App chạy trong Docker, test DNS/network:
```bash
# Vào container api-gateway của main app
docker exec -it socialcue-api-gateway sh

# Test gọi Audio gateway
curl "$AUDIO_SERVICES_URL/health"

# Test TTS voices endpoint
curl "$AUDIO_SERVICES_URL/v1/tts/voices" \
  -H "Authorization: Bearer $AUDIO_API_KEY"
```

## Bước 6: Troubleshooting

### 6.1. Service không khởi động
```bash
# Xem logs chi tiết
docker compose logs stt-service

# Restart service
docker compose restart stt-service
```

### 6.2. Lỗi authentication
- Kiểm tra API key trong header `Authorization: Bearer <your-key>`
- Đảm bảo key có trong `API_KEYS` trong file `.env`

### 6.3. Lỗi "audio file too large"
- Giới hạn: **25MB** (theo spec)
- Giải pháp: Nén audio hoặc chia nhỏ file

### 6.4. Lỗi "audio duration exceeds limit"
- Giới hạn: **300 seconds (5 minutes)** (theo spec)
- Giải pháp: Chia audio thành các đoạn ngắn hơn

### 6.5. Lỗi "unsupported audio format"
- Formats hỗ trợ: wav, mp3, m4a, ogg, flac
- Giải pháp: Convert sang format được hỗ trợ

### 6.6. Lỗi "voice not found"
- Kiểm tra danh sách voices:
  ```bash
  curl http://localhost:3002/v1/tts/voices \
    -H "Authorization: Bearer dev-key-1"
  ```

### 6.7. Lỗi endpoint không tìm thấy (404)
- Đảm bảo dùng prefix `/v1/` cho tất cả endpoint
- Đúng: `/v1/stt/transcribe`
- Sai: `/stt/transcribe`

### 6.8. Lỗi field name sai (STT)
- Đúng: `-F "file=@audio.wav"` (field name là "file")
- Sai: `-F "audio=@audio.wav"` (field name không phải "audio")

## Bước 7: Dừng Services

### 7.1. Dừng tất cả services
```bash
docker compose down
```

### 7.2. Dừng và xóa volumes
```bash
docker compose down -v
```

### 7.3. Dừng và xóa images
```bash
docker compose down --rmi all
```

## Bước 8: Production Deployment

### 8.1. Sử dụng production config
```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

### 8.2. Cấu hình production
Chỉnh sửa `.env`:
```env
NODE_ENV=production
LOG_LEVEL=warn
API_KEYS=<strong-random-keys>
```

### 8.3. Enable HTTPS
Thêm reverse proxy (nginx/traefik) phía trước gateway để handle SSL.

## API Endpoints Summary (Đúng Spec)

### Gateway Health (Host Port 3002 → Container Port 3000)
- `GET /health` - Overall health check với dependencies
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

**Lưu ý**: 
- Từ host machine: `http://localhost:3002`
- Từ Docker network (Main App): `http://audio-gateway:3000`

### STT Service (via Gateway)
- `POST /v1/stt/transcribe` - Transcribe audio to text

### TTS Service (via Gateway)
- `POST /v1/tts/synthesize` - Synthesize text to speech
- `GET /v1/tts/voices` - List available voices

**Lưu ý**: Không có endpoint `/stt/health`, `/tts/health` qua gateway. Chỉ có `/health` tổng hợp.

## Giới Hạn Theo Spec

### STT Limits
- Max file size: **25 MB**
- Max duration: **300 seconds (5 minutes)**
- Supported formats: wav, mp3, m4a, ogg, flac
- Supported sample rates: 8000-48000 Hz

### TTS Limits
- Max text length: **5000 characters**
- Speed range: **0.5 - 2.0**
- Supported formats: wav, mp3

## Tài liệu tham khảo

- API Documentation: `.kiro/specs/ai-services-separation/API_DOCUMENTATION.md`
- Manual Testing Guide: `MANUAL_TESTING.md`
- Test Scripts: `test-audio-services.sh`
- Postman Collection: `.kiro/specs/ai-services-separation/SocialCue_AI_Audio_Services.postman_collection.json`
