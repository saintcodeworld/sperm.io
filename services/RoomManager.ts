import { Room, ROOM_CONFIGS, GameState } from '../types';
import { ServerSim } from './ServerSim';

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private roomServers: Map<string, ServerSim> = new Map();

  constructor() {
    // Initialize one room for each entry fee
    ROOM_CONFIGS.forEach((config) => {
      this.createRoom(config.entryFee);
    });
  }

  private createRoom(entryFee: number): string {
    // Create a permanent room ID based on entry fee for consistency
    const roomId = `room_${entryFee}`;
    
    // Only create if room doesn't exist
    if (!this.rooms.has(roomId)) {
      const room: Room = {
        id: roomId,
        entryFee,
        currentPlayers: 0,
        state: { players: {}, food: {} }
      };
      
      this.rooms.set(roomId, room);
      this.roomServers.set(roomId, new ServerSim());
      
      console.log(`[RoomManager] Created permanent room ${roomId} with entry fee ${entryFee} SOL`);
    }
    
    return roomId;
  }

  public getRoomByFee(entryFee: number): Room | undefined {
    return Array.from(this.rooms.values()).find(room => room.entryFee === entryFee);
  }

  public getServer(roomId: string): ServerSim | undefined {
    return this.roomServers.get(roomId);
  }

  public async joinRoom(roomId: string, playerId: string, playerName: string): Promise<boolean> {
    const room = this.rooms.get(roomId);
    const server = this.roomServers.get(roomId);
    
    if (!room || !server) {
      return false;
    }
    
    const joined = await server.join(playerId, playerName, room.entryFee);
    if (joined) {
      room.currentPlayers++;
    }
    return joined;
  }

  public leaveRoom(roomId: string, playerId: string): void {
    const room = this.rooms.get(roomId);
    const server = this.roomServers.get(roomId);
    
    if (room && server) {
      server.leave(playerId);
      room.currentPlayers = Math.max(0, room.currentPlayers - 1);
    }
  }

  public getAvailableRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}

export const roomManager = new RoomManager();
