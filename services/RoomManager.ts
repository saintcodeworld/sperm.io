import { Room, ROOM_CONFIGS, GameState } from '../types';
import { wsClient } from './WebSocketClient';
import { DeathEvent, KillEvent } from './ServerSim';

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private gameServerUrl: string;
  private connected: boolean = false;

  constructor() {
    // In production, use your VPS domain
    this.gameServerUrl = import.meta.env.VITE_GAME_SERVER_URL || 'ws://localhost:3002';
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

    if (!this.connected) {
      console.error('Not connected to game server');
      return false;
    }

    try {
      await wsClient.joinRoom(roomId, playerId, playerName, room.entryFee);
      room.currentPlayers++;
      console.log(`✅ ${playerName} joined room ${roomId}`);
      return true;
    } catch (error) {
      console.error('Failed to join room:', error);
      return false;
    }
  }

  public getServer(roomId: string) {
    // Return WebSocket client interface that mimics ServerSim
    return {
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
