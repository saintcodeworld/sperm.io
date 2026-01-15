import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ServerSim } from '../services/ServerSim.ts';
import { ROOM_CONFIGS } from '../types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Create HTTP server for Socket.io
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // In production, set to your domain
    methods: ["GET", "POST"]
  }
});

// Game state management
class MultiplayerGameServer {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map(); // Track which room each player is in
    this.playerSockets = new Map(); // Track socket ID to player ID mapping
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
          
          socket.join(roomId);
          socket.emit('join-success', { roomId });
          
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
    const updateInterval = setInterval(() => {
      if (!socket.connected) {
        clearInterval(updateInterval);
        return;
      }
      
      // Get current game state
      const state = room.server.state;
      socket.emit('game-state', state);
    }, 1000 / 60); // 60 FPS updates

    socket.on('disconnect', () => {
      clearInterval(updateInterval);
    });
  }
}

// Initialize game server
const gameServer = new MultiplayerGameServer();

io.on('connection', (socket) => {
  gameServer.handleConnection(socket);
});

const PORT = process.env.GAME_SERVER_PORT || 3002;
httpServer.listen(PORT, () => {
  console.log(`🎮 Multiplayer game server running on port ${PORT}`);
  console.log(`🌐 WebSocket endpoint: ws://localhost:${PORT}`);
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
