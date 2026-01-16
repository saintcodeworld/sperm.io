# Sperm.io API Server Dockerfile
# PostgreSQL Backend API

FROM node:20-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies including new ones for PostgreSQL
RUN npm install && \
    npm install pg bcryptjs jsonwebtoken

# Copy backend source code
COPY backend/ ./

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start API server
CMD ["node", "apiServer.js"]
