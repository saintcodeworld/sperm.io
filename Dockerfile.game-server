# Game Server Dockerfile
# Sperm.io Game Server Dockerfile
# WebSocket/Socket.io Multiplayer Server

FROM node:20-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy backend source code
COPY backend/ .

# Create .env file for production
ENV NODE_ENV=production
ENV GAME_SERVER_PORT=3002

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the game server
CMD ["npm", "run", "game-server"]
