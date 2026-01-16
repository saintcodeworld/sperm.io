import { io, Socket } from 'socket.io-client';
import { GameState } from '../types';
import { DeathEvent, KillEvent } from './ServerSim';

// Fallback URL in case environment variable fails during build
const SOCKET_URL = import.meta.env.VITE_GAME_SERVER_URL || 'https://compassionate-illumination-production-6200.up.railway.app';

export class WebSocketClient {
  private socket: Socket | null = null;
  private gameStateCallbacks: ((state: GameState) => void)[] = [];
  private deathCallbacks: ((event: DeathEvent) => void)[] = [];
  private killCallbacks: ((event: KillEvent) => void)[] = [];
  private connected = false;
  private connectionPromise: Promise<void> | null = null;

  connect(serverUrl: string = SOCKET_URL): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      // Debug: Log connection attempt with protocol detection
      const isSecure = serverUrl.startsWith('https://') || serverUrl.startsWith('wss://');
      console.log(`🔌 Connecting to game server at ${serverUrl}...`);
      console.log(`🔒 Using ${isSecure ? 'secure (WSS)' : 'insecure (WS)'} connection`);
      
      // Additional debug log to show exact URL being used
      console.log("DEBUG: Attempting socket connection to:", serverUrl);
      
      // Log whether we're using the fallback URL
      if (serverUrl === SOCKET_URL && !import.meta.env.VITE_GAME_SERVER_URL) {
        console.log("DEBUG: Using fallback URL since VITE_GAME_SERVER_URL is not available");
      }
      
      this.socket = io(serverUrl, {
        // Try websocket first, fall back to polling
        transports: ['websocket', 'polling'],
        // Secure connection for HTTPS/WSS URLs
        secure: isSecure,
        // Reconnection settings
        timeout: 15000,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        // Force new connection on each connect call
        forceNew: false,
        // Path for socket.io (default)
        path: '/socket.io/'
      });
      
      this.socket.on('connect', () => {
        console.log('🔌 Connected to game server successfully');
        console.log('DEBUG: Connected to Game Server! ID:', this.socket?.id);
        this.connected = true;
        resolve();
      });
      
      this.socket.on('disconnect', (reason) => {
        console.log(`🔌 Disconnected from game server: ${reason}`);
        this.connected = false;
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('🔌 Connection error:', error);
        console.error('DEBUG: Connection Error:', error.message);
        this.connected = false;
        reject(error);
      });
      
      // Additional connection state listeners for debugging
      this.socket.on('reconnect', (attemptNumber) => {
        console.log(`DEBUG: Reconnected to game server after ${attemptNumber} attempts`);
        this.connected = true;
      });
      
      this.socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`DEBUG: Attempting to reconnect (attempt ${attemptNumber})...`);
      });
      
      this.socket.on('reconnect_error', (error) => {
        console.error('DEBUG: Reconnection error:', error.message);
      });
      
      this.socket.on('reconnect_failed', () => {
        console.error('DEBUG: Failed to reconnect after all attempts');
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
      serverUrl: this.socket?.io?.opts?.hostname || null,
      readyState: this.socket?.connected ? 'connected' : 'disconnected',
      transports: this.socket?.io?.opts?.transports || null,
      activeTransport: this.socket?.io?.engine?.transport?.name || null,
      // Add detailed connection info for debugging
      connectionDetails: {
        url: SOCKET_URL,
        usingFallback: !import.meta.env.VITE_GAME_SERVER_URL,
        reconnection: this.socket?.io?.opts?.reconnection || null,
        reconnectionAttempts: this.socket?.io?.opts?.reconnectionAttempts || null
      }
    };
  }
}

// Export a singleton instance of the WebSocketClient
export const wsClient = new WebSocketClient();

// Add a global reference for debugging purposes
// This helps identify if the socket object is available globally
if (typeof window !== 'undefined') {
  (window as any).wsClient = wsClient;
  console.log('DEBUG: WebSocketClient attached to window object for debugging');
}
