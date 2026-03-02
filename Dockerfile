# Hugging Face Spaces Dockerfile for Audio Services Gateway
FROM node:20-slim

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy gateway package files
COPY gateway/package*.json ./gateway/

# Install dependencies
RUN npm install --workspace=gateway

# Copy gateway source code
COPY gateway/ ./gateway/

# Copy tsconfig if needed
COPY tsconfig.json ./tsconfig.json

# Build gateway
WORKDIR /app/gateway
RUN npm run build

# Set environment variables for Hugging Face
ENV PORT=7860
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Expose port 7860 (required by HF Spaces)
EXPOSE 7860

# Start the gateway
CMD ["npm", "start"]
