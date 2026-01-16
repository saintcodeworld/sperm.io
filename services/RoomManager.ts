import { Room, ROOM_CONFIGS, GameState } from '../types';
import { wsClient } from './WebSocketClient';
import { DeathEvent, KillEvent, ServerSim } from './ServerSim';

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private gameServerUrl: string | undefined;
  private connected: boolean = false;

  constructor() {
    // Always use fallback URL if environment variable is missing
    this.gameServerUrl = import.meta.env.VITE_GAME_SERVER_URL || 'https://compassionate-illumination-production-6200.up.railway.app';
    this.initializeRooms();
  }

  private initializeRooms() {
    ROOM_CONFIGS.forEach((config) => {
      const roomId = `room_${config.entryFee}`;
      const room: Room = {
        id: roomId,
        entryFee: config.entryFee,
        currentPlayers: 0,
        state: { players: {}, food: {} }
      };
      this.rooms.set(roomId, room);
    });
  }

  async connectToGameServer(): Promise<boolean> {
    console.log('[App] Attempting to connect to Multiplayer before starting game...');
    
    try {
      // Always attempt to connect - we've ensured gameServerUrl has fallback value
      await wsClient.connect(this.gameServerUrl);
      this.connected = true;
      console.log('🎮 Successfully connected to multiplayer game server');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to game server:', error);
      this.connected = false;
      console.log('🎮 Connection failed - will run in single-player mode');
      return false;
    }
  }

  public async joinRoom(roomId: string, playerId: string, playerName: string): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.error(`Room ${roomId} not found`);
      return false;
    }

    // If not connected to multiplayer server, fall back to single-player mode
    if (!this.connected) {
      // Try to reconnect one more time in case the initial connection failed
      try {
        await this.connectToGameServer();
      } catch (error) {
        // Silently ignore - we'll fall back to single player
      }
      
      // If still not connected, use single player mode
      if (!this.connected) {
        console.log('🎮 Multiplayer server not available - starting in single-player mode');
        return true; // Allow single-player mode
      }
    }

    try {
      await wsClient.joinRoom(roomId, playerId, playerName, room.entryFee);
      room.currentPlayers++;
      console.log(`✅ ${playerName} joined room ${roomId}`);
      return true;
    } catch (error) {
      console.error('Failed to join multiplayer room, falling back to single-player:', error);
      return true; // Fall back to single-player mode
    }
  }

  public getServer(roomId: string) {
    // Get the room's entry fee for the server
    const room = this.rooms.get(roomId);
    const entryFee = room?.entryFee ?? 0;
    
    // If not connected to multiplayer, return single-player server simulation
    if (!this.connected) {
      console.log(`🎮 Using single-player server simulation for room ${roomId} (entry: ${entryFee} SOL)`);
      const singlePlayerServer = new ServerSim();
      
      // Server will be joined by App.tsx after game starts - don't auto-join here
      return singlePlayerServer;
    }
    
    // Return WebSocket client interface that mimics ServerSim
    // Track local state for multiplayer mode
    let localGameState: GameState = { players: {}, food: {} };
    let cashoutStartTime: number | null = null;
    let playerJoinTime: number = Date.now();
    
    return {
      join: async (id: string, name: string, entryFeeAmount: number): Promise<boolean> => {
        // For WebSocket mode, join is handled via wsClient.joinRoom (already called by roomManager.joinRoom)
        // This method is a no-op for multiplayer since join happens via WebSocket
        console.log(`[RoomManager] Multiplayer join - already connected via WebSocket for player ${id}`);
        playerJoinTime = Date.now();
        return true;
      },
      onUpdate: (callback: (state: GameState) => void) => {
        // Wrap callback to track local state for getCashoutProgress, getPlayerData, etc.
        return wsClient.onGameStateUpdate((state: GameState) => {
          localGameState = state;
          callback(state);
        });
      },
      onPlayerDeath: (callback: (event: DeathEvent) => void) => {
        return wsClient.onPlayerDeath(callback);
      },
      onKill: (callback: (event: KillEvent) => void) => {
        return wsClient.onKill(callback);
      },
      input: (playerId: string, angle: number, boost: boolean, cashout: boolean) => {
        // Track cashout state locally for progress bar
        if (cashout && !cashoutStartTime) {
          cashoutStartTime = Date.now();
        } else if (!cashout) {
          cashoutStartTime = null;
        }
        wsClient.sendInput(playerId, angle, boost, cashout);
      },
      getPlayerData: (playerId: string) => {
        // Return player data from local cached state
        return localGameState.players[playerId];
      },
      getTimeAlive: (playerId: string) => {
        // Calculate time since player joined
        return Math.floor((Date.now() - playerJoinTime) / 1000);
      },
      getCashoutProgress: (playerId: string) => {
        // Calculate cashout progress locally (3 second timer)
        if (!cashoutStartTime) return 0;
        const elapsed = Date.now() - cashoutStartTime;
        return Math.min(1, elapsed / 3000);
      }
    };
  }

  public leaveRoom(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.currentPlayers = Math.max(0, room.currentPlayers - 1);
      console.log(`👋 Player ${playerId} left room ${roomId}`);
    }
  }

  public getAvailableRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getConnectionStatus() {
    return wsClient.getStatus();
  }
}

export const roomManager = new RoomManager();
