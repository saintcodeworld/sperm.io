# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for frontend
COPY package.json package-lock.json ./

# Copy backend package files
COPY backend/package.json backend/package-lock.json ./backend/

# Install frontend dependencies
RUN npm ci

# Install backend dependencies
RUN cd backend && npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install serve for frontend static files
RUN npm install -g serve

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy backend source and dependencies
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# Create startup script
RUN echo '#!/bin/sh' > start.sh && \
    echo 'cd backend && npm start &' >> start.sh && \
    echo 'serve -s dist -l 80' >> start.sh && \
    chmod +x start.sh

# Expose port 80
EXPOSE 80

# Start both backend and frontend
CMD ["./start.sh"]
