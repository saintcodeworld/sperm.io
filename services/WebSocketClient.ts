import { io, Socket } from 'socket.io-client';
import { GameState } from '../types';
import { DeathEvent, KillEvent } from './ServerSim';

export class WebSocketClient {
  private socket: Socket | null = null;
  private gameStateCallbacks: ((state: GameState) => void)[] = [];
  private deathCallbacks: ((event: DeathEvent) => void)[] = [];
  private killCallbacks: ((event: KillEvent) => void)[] = [];
  private connected = false;
  private connectionPromise: Promise<void> | null = null;

  connect(serverUrl: string): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      console.log(`🔌 Connecting to game server at ${serverUrl}...`);
      
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });
      
      this.socket.on('connect', () => {
        console.log('🔌 Connected to game server successfully');
        this.connected = true;
        resolve();
      });
      
      this.socket.on('disconnect', (reason) => {
        console.log(`🔌 Disconnected from game server: ${reason}`);
        this.connected = false;
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('🔌 Connection error:', error);
        this.connected = false;
        reject(error);
      });
      
      this.socket.on('game-state', (state: GameState) => {
        this.gameStateCallbacks.forEach(callback => callback(state));
      });
      
      this.socket.on('join-success', (data) => {
        console.log('✅ Successfully joined room:', data);
      });
      
      this.socket.on('join-error', (error) => {
        console.error('❌ Failed to join room:', error);
      });
    });

    return this.connectionPromise;
  }

  joinRoom(roomId: string, playerId: string, playerName: string, entryFee: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('Not connected to game server'));
        return;
      }
      
      console.log(`🎮 Joining room ${roomId} as ${playerName}...`);
      
      // Set up one-time listeners for join result
      const onJoinSuccess = () => {
        console.log(`✅ Successfully joined room ${roomId}`);
        this.socket?.off('join-success', onJoinSuccess);
        this.socket?.off('join-error', onJoinError);
        resolve();
      };
      
      const onJoinError = (error: any) => {
        console.error(`❌ Failed to join room ${roomId}:`, error);
        this.socket?.off('join-success', onJoinSuccess);
        this.socket?.off('join-error', onJoinError);
        reject(new Error(error.message || 'Failed to join room'));
      };
      
      this.socket.once('join-success', onJoinSuccess);
      this.socket.once('join-error', onJoinError);
      
      // Emit join request
      this.socket.emit('join-room', {
        roomId,
        playerId,
        playerName,
        entryFee
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        this.socket?.off('join-success', onJoinSuccess);
        this.socket?.off('join-error', onJoinError);
        reject(new Error('Join room timeout'));
      }, 10000);
    });
  }

  sendInput(playerId: string, angle: number, boost: boolean, cashout: boolean) {
    if (!this.socket || !this.connected) {
      console.warn('⚠️ Cannot send input: not connected to game server');
      return;
    }
    
    this.socket.emit('player-input', {
      playerId,
      angle,
      boost,
      cashout
    });
  }

  onGameStateUpdate(callback: (state: GameState) => void) {
    this.gameStateCallbacks.push(callback);
    return () => {
      const index = this.gameStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.gameStateCallbacks.splice(index, 1);
      }
    };
  }

  onPlayerDeath(callback: (event: DeathEvent) => void) {
    this.deathCallbacks.push(callback);
    return () => {
      const index = this.deathCallbacks.indexOf(callback);
      if (index > -1) {
        this.deathCallbacks.splice(index, 1);
      }
    };
  }

  onKill(callback: (event: KillEvent) => void) {
    this.killCallbacks.push(callback);
    return () => {
      const index = this.killCallbacks.indexOf(callback);
      if (index > -1) {
        this.killCallbacks.splice(index, 1);
      }
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.connectionPromise = null;
    }
  }

  // Get connection status for debugging
  getStatus() {
    return {
      connected: this.connected,
      socketId: this.socket?.id || null,
      serverUrl: this.socket?.io?.uri || null
    };
  }
}

export const wsClient = new WebSocketClient();
