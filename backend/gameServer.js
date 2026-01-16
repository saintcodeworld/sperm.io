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
  // Prefer WebSocket transport with polling as fallback
  transports: ['websocket', 'polling'],
  // Allow upgrades from polling to websocket
  allowUpgrades: true,
  // Ping timeout for connection health
  pingTimeout: 60000,
  pingInterval: 25000,
  // Additional configurations for stability
  connectTimeout: 45000,
  // Socket.io v4 options for more reliable connections
  maxHttpBufferSize: 1e8, // 100MB max message size
  path: '/socket.io/'
});

// Debug middleware to log all socket.io events
io.use((socket, next) => {
  console.log(`[DEBUG] Socket ${socket.id} attempting connection`);
  const address = socket.handshake.headers['x-forwarded-for'] || 
    socket.handshake.address;
  console.log(`[DEBUG] Connection from address: ${address}`);
  console.log(`[DEBUG] Transport: ${socket.conn.transport.name}`);
  next();
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
          
          // Send current players to the new player
          const currentState = room.server.state;
          const currentPlayers = Object.keys(currentState.players || {}).map(id => ({
            id,
            name: currentState.players[id].name,
            x: currentState.players[id].x,
            y: currentState.players[id].y,
            angle: currentState.players[id].angle
          }));
          
          socket.emit('current-players', {
            players: currentPlayers,
            timestamp: Date.now()
          });
          
          console.log(`[JOIN] Sent ${currentPlayers.length} current players to new player ${playerId}`);
          
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
      
      // Process input in game server
      room.server.input(playerId, angle, boost, cashout);
      
      // Immediately broadcast this player's movement to ALL players in main-game room
      // This ensures all players can see each other regardless of game room
      socket.to('main-game').emit('player-moved', {
        playerId,
        angle,
        boost,
        cashout,
        // Include position data for easier sync
        x: room.server.state?.players?.[playerId]?.pos?.x || 0,
        y: room.server.state?.players?.[playerId]?.pos?.y || 0,
        timestamp: Date.now()
      });
      
      // Debug log for player movement (throttled to avoid console spam)
      if (Math.random() < 0.05) { // Only log ~5% of movements
        console.log(`[MOVE] Player ${playerId} moved: angle=${angle}, boost=${boost} (broadcast to main-game)`);
      }
    });
    
    // Handle player position updates (for clients that send direct position data)
    socket.on('player-position', (data) => {
      const roomId = this.playerRooms.get(socket.id);
      if (!roomId) return;
      
      const { playerId, x, y, angle, velocity } = data;
      
      // Broadcast to ALL clients in main-game room
      socket.to('main-game').emit('player-position-update', {
        playerId,
        x,
        y,
        angle,
        velocity,
        timestamp: Date.now()
      });
      
      // Log position updates occasionally for debugging
      if (Math.random() < 0.01) { // Only log 1% of position updates
        console.log(`[POS] Player ${playerId} at x=${x.toFixed(1)}, y=${y.toFixed(1)} (broadcast to main-game)`);
      }
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
            
            // Notify all clients in main-game room that a player has disconnected
            socket.to('main-game').emit('player-disconnected', {
              playerId,
              timestamp: Date.now()
            });
          }
          console.log(`👋 Player disconnected from ${roomId} and main-game`);
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
  // Force every new connection to join the global 'main-game' room
  socket.join('main-game');
  console.log(`📌 Socket ${socket.id} joined main-game room`);
  
  // Get current active players in the main-game room
  const getMainRoomPlayers = async () => {
    try {
      const socketsInRoom = await io.in('main-game').fetchSockets();
      const playerData = [];
      
      // Collect data from all players in the main room
      for(const roomSocket of socketsInRoom) {
        // Skip the current socket (new player)
        if(roomSocket.id === socket.id) continue;
        
        const playerId = gameServer.playerSockets.get(roomSocket.id);
        if(playerId) {
          // Find which room this player is in to get their data
          const playerRoomId = gameServer.playerRooms.get(roomSocket.id);
          if(playerRoomId) {
            const room = gameServer.rooms.get(playerRoomId);
            if(room && room.server && room.server.state && room.server.state.players && room.server.state.players[playerId]) {
              const player = room.server.state.players[playerId];
              playerData.push({
                id: playerId,
                name: player.name,
                x: player.pos?.x || 0,
                y: player.pos?.y || 0,
                angle: player.angle || 0,
                score: player.score || 0
              });
            }
          }
        }
      }
      
      console.log(`📊 Sending ${playerData.length} existing players to new connection ${socket.id}`);
      // Send the list of existing players to the new connection
      socket.emit('existing-players', {
        players: playerData,
        timestamp: Date.now()
      });
    } catch(error) {
      console.error('Error getting main room players:', error);
    }
  };
  
  // Send existing players to the new connection
  getMainRoomPlayers();
  
  // Handle connection with regular game mechanics
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
