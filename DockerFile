# შენ IDE-ში (VS Code ან სხვა)
echo '# Sperm.io Frontend Dockerfile
# React + Vite Application

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for environment variables
ARG VITE_API_URL
ARG VITE_GAME_SERVER_URL
ARG VITE_SOLANA_CLUSTER=devnet

# Set environment variables for build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GAME_SERVER_URL=$VITE_GAME_SERVER_URL
ENV VITE_SOLANA_CLUSTER=$VITE_SOLANA_CLUSTER

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copy built files and server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package*.json ./

# Install only production dependencies for the server
RUN npm install express

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# Set environment variable for port
ENV PORT=3000

# Start server
CMD ["node", "server.js"]' > Dockerfile

git add Dockerfile
git commit -m "Re-create Dockerfile for frontend"
git push origin main
