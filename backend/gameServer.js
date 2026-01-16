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
    this.globalPlayers = new Map(); // DEBUG LOG: Global player state for cross-room visibility
    this.io = io; // Store reference to io
    this.initializeRooms();
    
    // DEBUG LOG: Start global game state broadcaster for main-game room
    this.startGlobalBroadcaster();
  }
  
  // Broadcast all player positions to main-game room at 20 FPS to reduce network load
  startGlobalBroadcaster() {
    setInterval(() => {
      const allPlayers = [];
      
      // Collect all players from global state
      this.globalPlayers.forEach((playerData, playerId) => {
        allPlayers.push(playerData);
      });
      
      // ONLY emit if we have players - NEVER send empty arrays
      if (allPlayers.length > 0) {
        // Broadcast to all connected clients in main-game room
        this.io.to('main-game').emit('global-game-state', {
          players: allPlayers,
          timestamp: Date.now()
        });
      }
    }, 75); // 13.3 FPS (75ms interval) - reduced for better network performance
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
          
          // DEBUG LOG: Get spawn position from server state
          const playerState = room.server.state?.players?.[playerId];
          const spawnX = playerState?.pos?.x || 2500; // Center fallback
          const spawnY = playerState?.pos?.y || 2500;
          const spawnAngle = playerState?.angle || 0;
          
          // DEBUG LOG: Store in global player state for cross-room visibility
          this.globalPlayers.set(playerId, {
            id: playerId,
            name: playerName,
            x: spawnX,
            y: spawnY,
            angle: spawnAngle,
            score: 0,
            roomId: roomId
          });
          
          console.log(`[SPAWN] Player ${playerId} spawned at x:${spawnX.toFixed(1)}, y:${spawnY.toFixed(1)}`);
          
          // Join the Socket.IO room
          await socket.join(roomId);
          
          // Log all sockets in this room for debugging
          const socketsInRoom = await this.io.in(roomId).fetchSockets();
          console.log(`👥 Room ${roomId} now has ${socketsInRoom.length} sockets:`, 
            socketsInRoom.map(s => s.id));
          
          socket.emit('join-success', { roomId });
          
          // DEBUG LOG: Broadcast to ALL players in main-game room (not just roomId)
          // This ensures all players can see each other regardless of entry fee room
          socket.to('main-game').emit('player-joined', { 
            playerId, 
            playerName,
            x: spawnX,
            y: spawnY,
            angle: spawnAngle,
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
      
      // Get updated position from server state
      const playerState = room.server.state?.players?.[playerId];
      const posX = playerState?.pos?.x || 0;
      const posY = playerState?.pos?.y || 0;
      
      // DEBUG LOG: Update global player state for cross-room visibility
      if (this.globalPlayers.has(playerId)) {
        const globalPlayer = this.globalPlayers.get(playerId);
        globalPlayer.x = posX;
        globalPlayer.y = posY;
        globalPlayer.angle = angle;
        globalPlayer.boost = boost;
      }
      
      // Immediately broadcast this player's movement to ALL players in main-game room
      // This ensures all players can see each other regardless of game room
      socket.to('main-game').emit('player-moved', {
        playerId,
        angle,
        boost,
        cashout,
        // Include position data for easier sync
        x: posX,
        y: posY,
        timestamp: Date.now()
      });
      
      // Debug log for player movement (throttled to avoid console spam)
      if (Math.random() < 0.05) { // Only log ~5% of movements
        console.log(`[MOVE] Player ${playerId} at (${posX.toFixed(1)}, ${posY.toFixed(1)}) broadcast to main-game`);
      }
    });
    
    // Handle player position updates (for clients that send direct position data)
    socket.on('player-position', (data) => {
      const roomId = this.playerRooms.get(socket.id);
      if (!roomId) return;
      
      const { playerId, x, y, angle, velocity } = data;
      
      // DEBUG LOG: Update global player state for cross-room visibility
      if (this.globalPlayers.has(playerId)) {
        const globalPlayer = this.globalPlayers.get(playerId);
        globalPlayer.x = x;
        globalPlayer.y = y;
        globalPlayer.angle = angle;
      }
      
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
            
            // DEBUG LOG: Remove from global player state
            this.globalPlayers.delete(playerId);
            
            // Notify all clients in main-game room that a player has disconnected
            this.io.to('main-game').emit('player-disconnected', {
              playerId,
              timestamp: Date.now()
            });
            
            console.log(`[DISCONNECT] Removed player ${playerId} from global state and notified main-game`);
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
      
      // Track last state to avoid sending unchanged states
      room.lastStateSnapshot = null;
      
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
            
            // Only send updates if we have players
            if (playerCount > 0) {
                      // Broadcast to all clients in the room
              this.io.to(roomId).emit('game-state', state);
              
              // Minimal logging only every 30 seconds
              const now = Date.now();
              if (!room.lastDebugLog || now - room.lastDebugLog > 30000) {
                console.log(`Room ${roomId}: ${playerCount} players`);
                room.lastDebugLog = now;
              }
            }
          }
        } catch (error) {
          console.error(`Error broadcasting to room ${roomId}:`, error);
        }
      }, 75); // 13.3 FPS updates (75ms interval) for better network performance
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
  
  // DEBUG LOG: Get current active players from global state (simplified and reliable)
  const getMainRoomPlayers = () => {
    try {
      const playerData = [];
      
      // Use global player state for reliable cross-room player data
      gameServer.globalPlayers.forEach((player, playerId) => {
        playerData.push({
          id: player.id,
          name: player.name,
          x: player.x,
          y: player.y,
          angle: player.angle || 0,
          score: player.score || 0
        });
      });
      
      // Only send if there are actually players to send (avoid empty updates)
      if (playerData.length > 0) {
        // Send the list of existing players to the new connection
        socket.emit('existing-players', {
          players: playerData,
          timestamp: Date.now()
        });
      }
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
