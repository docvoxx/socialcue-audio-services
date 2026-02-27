# TTS Service Dockerfile
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    ffmpeg

# Set working directory
WORKDIR /app

# Copy root package.json, tsconfig, and shared package
COPY package*.json ./
COPY tsconfig.json ./
COPY shared/ ./shared/

# Install root dependencies
RUN npm ci

# Copy service package.json
COPY services/tts-service/package*.json ./services/tts-service/

# Install service dependencies
RUN cd services/tts-service && npm ci

# Build shared modules
RUN cd shared && npm run build

# Copy service source code
COPY services/tts-service/src/ ./services/tts-service/src/
COPY services/tts-service/tsconfig.json ./services/tts-service/

# Build the service
RUN cd services/tts-service && npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Create models and audio directories
RUN mkdir -p /models /tmp/audio && chown -R nodejs:nodejs /models /tmp/audio

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3006/health || exit 1

# Start the service
CMD ["node", "services/tts-service/dist/index.js"]