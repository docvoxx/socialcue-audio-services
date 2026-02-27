#!/bin/bash

echo "========================================"
echo "  Audio Services - Quick Deploy Script"
echo "========================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Please edit .env and set your API_KEYS"
    echo "Run: nano .env"
    echo ""
    read -p "Press Enter after editing .env..."
fi

echo ""
echo "Building Docker images..."
docker compose build

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Docker build failed!"
    exit 1
fi

echo ""
echo "Starting services..."
docker compose up -d

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Failed to start services!"
    exit 1
fi

echo ""
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo "Checking health..."
curl -s http://localhost:3002/health | jq . || curl -s http://localhost:3002/health

echo ""
echo ""
echo "========================================"
echo "  Deployment Complete!"
echo "========================================"
echo ""
echo "Services are running at:"
echo "  - Gateway (host): http://localhost:3002"
echo "  - Gateway (docker): http://audio-gateway:3000"
echo ""
echo "API Endpoints (đúng spec):"
echo "  - POST /v1/stt/transcribe"
echo "  - POST /v1/tts/synthesize"
echo "  - GET /v1/tts/voices"
echo ""
echo "Network: socialcue-external (shared with AI & Main App)"
echo ""
echo "To view logs:"
echo "  docker compose logs -f"
echo ""
echo "To stop services:"
echo "  docker compose down"
echo ""
echo "API Documentation: DEPLOYMENT_GUIDE.md"
echo ""
