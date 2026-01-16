import dotenv from 'dotenv';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ServerSim } from './ServerSim.js';
import { ROOM_CONFIGS } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables - Railway sets PORT automatically
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Debug: Log environment for Railway deployment
console.log('[GameServer] Environment:', process.env.NODE_ENV || 'development');
console.log('[GameServer] PORT from env:', process.env.PORT);

// Create Express app
const app = express();

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Game server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Sperm.io Game Server' });
});

// Create HTTP server using Express
const httpServer = createServer(app);

// CORS origins configuration - allow frontend domains
// For production, specify your frontend domain(s)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*']; // Default to all for testing

console.log('[GameServer] CORS allowed origins:', ALLOWED_ORIGINS);

// Set up Socket.io with Railway-compatible configuration
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Railway uses HTTPS, so we need to support WSS
  transports: ['websocket', 'polling'],
  // Allow upgrades from polling to websocket
  allowUpgrades: true,
  // Ping timeout for connection health
  pingTimeout: 60000,
  pingInterval: 25000
});

// Game state management
class MultiplayerGameServer {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map(); // Track which room each player is in
    this.playerSockets = new Map(); // Track socket ID to player ID mapping
    this.io = io; // Store reference to io
    this.initializeRooms();
  }

  initializeRooms() {
    ROOM_CONFIGS.forEach(config => {
      const roomId = `room_${config.entryFee}`;
      this.rooms.set(roomId, {
        id: roomId,
        entryFee: config.entryFee,
        server: new ServerSim(),
        players: new Set()
      });
      console.log(`🎮 Created room ${roomId} with entry fee ${config.entryFee} SOL`);
    });
  }

  handleConnection(socket) {
    console.log(`👤 Player connected: ${socket.id}`);

    socket.on('join-room', async (data) => {
      const { roomId, playerId, playerName, entryFee } = data;
      const room = this.rooms.get(roomId);
      
      if (!room) {
        socket.emit('join-error', { message: 'Room not found' });
        return;
      }

      try {
        const success = await room.server.join(playerId, playerName, entryFee);
        if (success) {
          room.players.add(socket.id);
          this.playerRooms.set(socket.id, roomId);
          this.playerSockets.set(socket.id, playerId);
          
          // Join the Socket.IO room
          await socket.join(roomId);
          
          // Log all sockets in this room for debugging
          const socketsInRoom = await this.io.in(roomId).fetchSockets();
          console.log(`👥 Room ${roomId} now has ${socketsInRoom.length} sockets:`, 
            socketsInRoom.map(s => s.id));
          
          socket.emit('join-success', { roomId });
          
          // Broadcast to room that a new player has joined
          socket.to(roomId).emit('player-joined', { 
            playerId, 
            playerName,
            timestamp: Date.now()
          });
          
          // Start sending game state updates
          this.startGameStateUpdates(socket, room);
          
          console.log(`✅ ${playerName} joined ${roomId}`);
        } else {
          socket.emit('join-error', { message: 'Failed to join room' });
        }
      } catch (error) {
        console.error('Join error:', error);
        socket.emit('join-error', { message: 'Server error' });
      }
    });

    socket.on('player-input', (data) => {
      const roomId = this.playerRooms.get(socket.id);
      if (!roomId) return;
      
      const room = this.rooms.get(roomId);
      if (!room) return;
      
      const { playerId, angle, boost, cashout } = data;
      room.server.input(playerId, angle, boost, cashout);
    });

    socket.on('disconnect', () => {
      const roomId = this.playerRooms.get(socket.id);
      const playerId = this.playerSockets.get(socket.id);
      
      if (roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
          room.players.delete(socket.id);
          // Remove player from game server
          if (playerId) {
            room.server.leave(playerId);
          }
          console.log(`👋 Player disconnected from ${roomId}`);
        }
        this.playerRooms.delete(socket.id);
        this.playerSockets.delete(socket.id);
      }
    });
  }

  startGameStateUpdates(socket, room) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;
    
    // Only create one update interval per room if it doesn't exist already
    if (!room.updateInterval) {
      console.log(`🔄 Starting game state broadcasts for room ${roomId}`);
      
      room.updateInterval = setInterval(async () => {
        try {
          // Get current game state
          const state = room.server.state;
          
          // Get current active sockets in room
          const socketsInRoom = await this.io.in(roomId).fetchSockets();
          
          if (socketsInRoom.length > 0) {
            // Add debug info to track player counts
            const playerCount = Object.keys(state.players).length;
            const socketCount = socketsInRoom.length;
            
            // Broadcast to all clients in the room
            this.io.to(roomId).emit('game-state', state);
            
            // Detailed debugging log every 5 seconds (to avoid spam)
            const now = Date.now();
            if (!room.lastDebugLog || now - room.lastDebugLog > 5000) {
              console.log(`🎮 Room ${roomId}: ${socketCount} sockets, ${playerCount} players, ${room.players.size} tracked players`);
              if (playerCount > 0) {
                console.log(`   Player IDs: ${Object.keys(state.players).join(', ')}`);
              }
              room.lastDebugLog = now;
            }
          }
        } catch (error) {
          console.error(`Error broadcasting to room ${roomId}:`, error);
        }
      }, 1000 / 30); // 30 FPS updates for network efficiency
    }

    socket.on('disconnect', async () => {
      try {
        // Check how many sockets are still in the room
        const socketsInRoom = await this.io.in(roomId).fetchSockets();
        
        // Only clear the interval if there are no more sockets in the room
        if (socketsInRoom.length === 0) {
          console.log(`🛑 Stopping game state broadcasts for room ${roomId} - no more players`);
          clearInterval(room.updateInterval);
          room.updateInterval = null;
        } else {
          console.log(`👤 Player disconnected from room ${roomId}, ${socketsInRoom.length} players remaining`);
        }
      } catch (error) {
        console.error(`Error handling disconnect for room ${roomId}:`, error);
      }
    });
  }
}

// Initialize game server
const gameServer = new MultiplayerGameServer();

io.on('connection', (socket) => {
  gameServer.handleConnection(socket);
});

// Railway provides PORT via environment variable
// Default to 3002 for local development
const PORT = process.env.PORT || 3002;
const HOST = '0.0.0.0'; // Bind to all network interfaces for Railway

httpServer.listen(PORT, HOST, () => {
  console.log(`🎮 Multiplayer game server running on ${HOST}:${PORT}`);
  
  // Railway deployment detection
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.log(`🚂 Railway environment: ${process.env.RAILWAY_ENVIRONMENT}`);
    console.log(`🌐 Railway URL: https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app.up.railway.app'}`);
    console.log(`🔒 WebSocket endpoint: wss://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app.up.railway.app'}`);
  } else {
    console.log(`🌐 Local WebSocket endpoint: ws://localhost:${PORT}`);
  }
  
  console.log(`🌍 Health endpoint: /health`);
  console.log(`🔗 Ready for multiplayer connections!`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down game server...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down game server...');
  httpServer.close();
  process.exit(0);
});
