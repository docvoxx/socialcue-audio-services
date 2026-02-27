# STT Service Dockerfile - Debian-based for ONNX Runtime compatibility
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy root package.json, tsconfig, and shared package
COPY package*.json ./
COPY tsconfig.json ./
COPY shared/ ./shared/

# Install root dependencies
RUN npm ci

# Copy service package.json
COPY services/stt-service/package*.json ./services/stt-service/

# Install service dependencies
RUN cd services/stt-service && npm ci

# Build shared modules
RUN cd shared && npm run build

# Copy service source code
COPY services/stt-service/src/ ./services/stt-service/src/
COPY services/stt-service/tsconfig.json ./services/stt-service/

# Build the service
RUN cd services/stt-service && npm run build

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

# Create models and temp directories
RUN mkdir -p /models /tmp/audio && chown -R nodejs:nodejs /models /tmp/audio

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3005/health || exit 1

# Start the service
CMD ["node", "services/stt-service/dist/index.js"]