import { Room, ROOM_CONFIGS, GameState } from '../types';
import { wsClient } from './WebSocketClient';
import { DeathEvent, KillEvent, ServerSim } from './ServerSim';

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private gameServerUrl: string | undefined;
  private connected: boolean = false;

  constructor() {
    // In production, use your VPS domain
    this.gameServerUrl = import.meta.env.VITE_GAME_SERVER_URL;
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

  async connectToGameServer(): Promise<void> {
    if (!this.gameServerUrl) {
      console.log('🎮 No game server URL configured - running in single-player mode');
      this.connected = false;
      return;
    }
    
    try {
      await wsClient.connect(this.gameServerUrl);
      this.connected = true;
      console.log('🎮 Connected to multiplayer game server');
    } catch (error) {
      console.error('❌ Failed to connect to game server:', error);
      this.connected = false;
      throw error;
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
      console.log('🎮 Multiplayer server not available - starting in single-player mode');
      return true; // Allow single-player mode
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
    return {
      join: async (id: string, name: string, entryFeeAmount: number): Promise<boolean> => {
        // For WebSocket mode, join is handled via wsClient.joinRoom
        try {
          await wsClient.joinRoom(roomId, id, name, entryFeeAmount);
          return true;
        } catch (error) {
          console.error('Failed to join via WebSocket:', error);
          return false;
        }
      },
      onUpdate: (callback: (state: GameState) => void) => {
        return wsClient.onGameStateUpdate(callback);
      },
      onPlayerDeath: (callback: (event: DeathEvent) => void) => {
        return wsClient.onPlayerDeath(callback);
      },
      onKill: (callback: (event: KillEvent) => void) => {
        return wsClient.onKill(callback);
      },
      input: (playerId: string, angle: number, boost: boolean, cashout: boolean) => {
        wsClient.sendInput(playerId, angle, boost, cashout);
      },
      getPlayerData: (playerId: string) => {
        // This would need to be implemented via WebSocket or tracked locally
        return undefined;
      },
      getTimeAlive: (playerId: string) => {
        // This would need to be implemented via WebSocket or tracked locally
        return 0;
      },
      getCashoutProgress: (playerId: string) => {
        // This would need to be implemented via WebSocket or tracked locally
        return 0;
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
