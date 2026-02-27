# Multi-stage build for Audio Gateway

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY gateway/package.json gateway/tsconfig.json ./gateway/
COPY gateway/src ./gateway/src

# Install dependencies
RUN cd gateway && npm install

# Build TypeScript
RUN cd gateway && npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY gateway/package.json ./

# Install production dependencies only
RUN npm install --production

# Copy built files from builder stage
COPY --from=builder /app/gateway/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/index.js"]
