import { io, Socket } from 'socket.io-client';
import { GameState } from '../types';
import { DeathEvent, KillEvent } from './ServerSim';

// WebSocket URL for multiplayer server
// Priority:
// 1. VITE_GAME_SERVER_URL env variable (set at build time)
// 2. Auto-detect based on current domain (production fallback)
// 3. localhost:3002 (development fallback)
const getSocketUrl = (): string => {
  // If explicitly configured via build env, use that
  if (import.meta.env.VITE_GAME_SERVER_URL) {
    return import.meta.env.VITE_GAME_SERVER_URL;
  }
  
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // Production detection: if we're on HTTPS or a known production domain
    const isProduction = protocol === 'https:' || 
      hostname === 'spermiobeta.xyz' || 
      hostname === 'www.spermiobeta.xyz' ||
      hostname.endsWith('.spermiobeta.xyz');
    
    if (isProduction) {
      // Use the production game server URL
      // This handles Coolify deployments where VITE_GAME_SERVER_URL wasn't set at build time
      console.log('🌐 Production environment detected, using game.spermiobeta.xyz');
      return 'https://game.spermiobeta.xyz';
    }
  }
  
  // Default to localhost for development
  return 'http://localhost:3002';
};

const SOCKET_URL = getSocketUrl();

console.log('DEBUG: Configured WebSocket URL:', SOCKET_URL);
console.log('DEBUG: VITE_GAME_SERVER_URL from env:', import.meta.env.VITE_GAME_SERVER_URL || '(not set)');

export class WebSocketClient {
  private socket: Socket | null = null;
  private gameStateCallbacks: ((state: GameState) => void)[] = [];
  private deathCallbacks: ((event: DeathEvent) => void)[] = [];
  private killCallbacks: ((event: KillEvent) => void)[] = [];
  private playerMovedCallbacks: ((data: any) => void)[] = [];
  private currentPlayersCallbacks: ((data: any) => void)[] = [];
  private playerPositionUpdateCallbacks: ((data: any) => void)[] = [];
  private existingPlayersCallbacks: ((data: any) => void)[] = [];
  private playerDisconnectedCallbacks: ((data: any) => void)[] = [];
  private playerJoinedCallbacks: ((data: any) => void)[] = []; // DEBUG LOG: New player join events
  private globalGameStateCallbacks: ((data: any) => void)[] = []; // DEBUG LOG: Global game state updates
  private cashoutSuccessCallbacks: ((data: any) => void)[] = []; // DEBUG LOG: Cashout success callbacks
  private cashoutFailedCallbacks: ((data: any) => void)[] = []; // DEBUG LOG: Cashout failed callbacks
  private connected = false;
  private connectionPromise: Promise<void> | null = null;
  private connectionFailed = false; // Track if connection has failed to prevent spam

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
        // Use only websocket transport as requested
        transports: ['websocket'],
        // Secure connection for HTTPS/WSS URLs
        secure: isSecure,
        // Reduced reconnection attempts to avoid console spam
        timeout: 10000,
        reconnection: !this.connectionFailed, // Disable reconnection if already failed
        reconnectionAttempts: 3, // Reduced from 15 to 3
        reconnectionDelay: 2000, // Increased from 500 to 2000
        reconnectionDelayMax: 5000, // Increased from 2000 to 5000
        // Force new connection on each connect call
        forceNew: true,
        // Path for socket.io (default)
        path: '/socket.io/',
        // Additional options for stability
        autoConnect: true
        // Note: maxHttpBufferSize is a server-side option, not client-side
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
        this.connectionFailed = true;
        // Disable further reconnection attempts
        if (this.socket) {
          this.socket.io.opts.reconnection = false;
        }
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
        this.connectionFailed = true;
        // Disable further reconnection attempts
        if (this.socket) {
          this.socket.io.opts.reconnection = false;
        }
      });
      
      this.socket.on('game-state', (state: GameState) => {
        this.gameStateCallbacks.forEach(callback => callback(state));
      });
      
      // Handle direct player movement events for more responsive gameplay
      this.socket.on('player-moved', (data: any) => {
        this.playerMovedCallbacks.forEach(callback => callback(data));
      });
      
      // Handle current players list when joining a room
      this.socket.on('current-players', (data: any) => {
        this.currentPlayersCallbacks.forEach(callback => callback(data));
      });
      
      // Handle existing players in main-game room when joining
      this.socket.on('existing-players', (data: any) => {
        this.existingPlayersCallbacks.forEach(callback => callback(data));
      });
      
      // Handle player disconnection events
      this.socket.on('player-disconnected', (data: any) => {
        this.playerDisconnectedCallbacks.forEach(callback => callback(data));
      });
      
      // Handle player-joined events (when a new player joins the game)
      this.socket.on('player-joined', (data: any) => {
        this.playerJoinedCallbacks.forEach(callback => callback(data));
      });
      
      // Handle global-game-state events (all players in main-game room)
      this.socket.on('global-game-state', (data: any) => {
        this.globalGameStateCallbacks.forEach(callback => callback(data));
      });
      
      // Handle direct position updates from other players
      this.socket.on('player-position-update', (data: any) => {
        this.playerPositionUpdateCallbacks.forEach(callback => callback(data));
      });
      
      // DEBUG LOG: Handle cashout success from multiplayer server
      this.socket.on('cashout-success', (data: any) => {
        console.log('[WebSocket] Received cashout-success event:', data);
        this.cashoutSuccessCallbacks.forEach(callback => callback(data));
      });
      
      // DEBUG LOG: Handle cashout failed from multiplayer server
      this.socket.on('cashout-failed', (data: any) => {
        console.log('[WebSocket] Received cashout-failed event:', data);
        this.cashoutFailedCallbacks.forEach(callback => callback(data));
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

  joinRoom(roomId: string, playerId: string, playerName: string, entryFee: number, solAddress?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('Not connected to game server'));
        return;
      }
      
      console.log(`[WebSocket] Joining room with solAddress: ${solAddress}`);
      
      this.socket.emit('join-room', {
        roomId,
        playerId,
        playerName,
        entryFee,
        solAddress // DEBUG LOG: Pass wallet address to multiplayer backend
      });

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
      
      // Increased timeout to 10 seconds to avoid timeout errors during peak traffic
      setTimeout(() => {
        this.socket?.off('join-success', onJoinSuccess);
        this.socket?.off('join-error', onJoinError);
        reject(new Error('Join room timeout after 10 seconds'));
      }, 10000); // 10 seconds
    });
  }

  sendInput(playerId: string, angle: number, boost: boolean, cashout: boolean) {
    if (!this.socket || !this.connected) {
      console.warn('⚠️ Cannot send input: not connected to game server');
      return;
    }
    
    // DEBUG LOG: Track what we're sending
    if (cashout) {
      console.log(`[WebSocket] EMITTING player-input: playerId=${playerId}, cashout=${cashout}`);
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
  
  // New method to listen for direct player movement events
  onPlayerMoved(callback: (data: any) => void) {
    this.playerMovedCallbacks.push(callback);
    return () => {
      const index = this.playerMovedCallbacks.indexOf(callback);
      if (index > -1) {
        this.playerMovedCallbacks.splice(index, 1);
      }
    };
  }
  
  // New method to listen for current players when joining a room
  onCurrentPlayers(callback: (data: any) => void) {
    this.currentPlayersCallbacks.push(callback);
    return () => {
      const index = this.currentPlayersCallbacks.indexOf(callback);
      if (index > -1) {
        this.currentPlayersCallbacks.splice(index, 1);
      }
    };
  }
  
  // Method to listen for existing players in main-game room
  onExistingPlayers(callback: (data: any) => void) {
    this.existingPlayersCallbacks.push(callback);
    return () => {
      const index = this.existingPlayersCallbacks.indexOf(callback);
      if (index > -1) {
        this.existingPlayersCallbacks.splice(index, 1);
      }
    };
  }
  
  // Method to listen for player disconnection events
  onPlayerDisconnected(callback: (data: any) => void) {
    this.playerDisconnectedCallbacks.push(callback);
    return () => {
      const index = this.playerDisconnectedCallbacks.indexOf(callback);
      if (index > -1) {
        this.playerDisconnectedCallbacks.splice(index, 1);
      }
    };
  }
  
  // DEBUG LOG: Method to listen for player-joined events
  onPlayerJoined(callback: (data: any) => void) {
    this.playerJoinedCallbacks.push(callback);
    return () => {
      const index = this.playerJoinedCallbacks.indexOf(callback);
      if (index > -1) {
        this.playerJoinedCallbacks.splice(index, 1);
      }
    };
  }
  
  // DEBUG LOG: Method to listen for global-game-state events
  onGlobalGameState(callback: (data: any) => void) {
    this.globalGameStateCallbacks.push(callback);
    return () => {
      const index = this.globalGameStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.globalGameStateCallbacks.splice(index, 1);
      }
    };
  }
  
  // New method to listen for player position updates
  onPlayerPositionUpdate(callback: (data: any) => void) {
    this.playerPositionUpdateCallbacks.push(callback);
    return () => {
      const index = this.playerPositionUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.playerPositionUpdateCallbacks.splice(index, 1);
      }
    };
  }
  
  // Send direct position update to server
  sendPosition(playerId: string, x: number, y: number, angle: number, velocity: number) {
    if (!this.socket || !this.connected) {
      console.warn('⚠️ Cannot send position: not connected to game server');
      return;
    }
    
    this.socket.emit('player-position', {
      playerId,
      x,
      y,
      angle,
      velocity,
      timestamp: Date.now()
    });
  }

  // Send player death event to server
  sendDeath(playerId: string) {
    if (!this.socket || !this.connected) {
      console.warn('⚠️ Cannot send death event: not connected to game server');
      return;
    }
    
    console.log(`🎮 Sending death event for player ${playerId}`);
    this.socket.emit('player-death', {
      playerId,
      timestamp: Date.now()
    });
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

  // DEBUG LOG: Register callback for cashout success from multiplayer server
  onCashoutSuccess(callback: (data: any) => void) {
    this.cashoutSuccessCallbacks.push(callback);
    return () => {
      const index = this.cashoutSuccessCallbacks.indexOf(callback);
      if (index > -1) {
        this.cashoutSuccessCallbacks.splice(index, 1);
      }
    };
  }

  // DEBUG LOG: Register callback for cashout failed from multiplayer server
  onCashoutFailed(callback: (data: any) => void) {
    this.cashoutFailedCallbacks.push(callback);
    return () => {
      const index = this.cashoutFailedCallbacks.indexOf(callback);
      if (index > -1) {
        this.cashoutFailedCallbacks.splice(index, 1);
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
      this.connectionFailed = false; // Reset for future connection attempts
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
  
  // Add a helper function to test connection
  (window as any).testConnection = async () => {
    try {
      console.log('Testing WebSocket connection...');
      await wsClient.connect();
      console.log('Connection test result:', wsClient.getStatus());
      return wsClient.getStatus();
    } catch (err) {
      console.error('Connection test failed:', err);
      return { connected: false, error: err.message };
    }
  };
  
  // Add helper to force reconnect
  (window as any).reconnect = async () => {
    try {
      wsClient.disconnect();
      await new Promise(r => setTimeout(r, 1000));
      return await (window as any).testConnection();
    } catch (err) {
      return { connected: false, error: err.message };
    }
  };
}
