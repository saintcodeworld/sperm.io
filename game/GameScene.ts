
import Phaser from 'phaser';
import { ServerSim, DeathEvent, KillEvent } from '../services/ServerSim';
import { GameState, ARENA_SIZE, PlayerData } from '../types';
import { Sperm } from './Sperm';
import { wsClient } from '../services/WebSocketClient'; // Import WebSocket client for network players

export default class GameScene extends Phaser.Scene {
  public declare add: Phaser.GameObjects.GameObjectFactory;
  public declare cameras: Phaser.Cameras.Scene2D.CameraManager;
  public declare physics: Phaser.Physics.Arcade.ArcadePhysics;
  public declare events: Phaser.Events.EventEmitter;
  public declare input: Phaser.Input.InputPlugin;
  public declare tweens: Phaser.Tweens.TweenManager;
  public declare time: Phaser.Time.Clock;

  private players: Map<string, Sperm> = new Map(); // All players (local and network)
  private foods: Map<string, Phaser.GameObjects.Arc> = new Map();
  private myId: string = '';
  private server: ServerSim | null = null;
  private isBoosting: boolean = false;
  private isCashingOut: boolean = false;
  private boundaryLine!: Phaser.GameObjects.Graphics;
  private signalCleanups: (() => void)[] = [];
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private lastSolValue: number = 0;
  private otherPlayers: Map<string, Sperm> = new Map(); // Network players from other rooms
  private networkUpdateTime: Map<string, number> = new Map(); // Last update time for each player
  
  constructor() {
    super('GameScene');
  }

  init(data: { id: string, server: ServerSim }) {
    this.server = data.server;
    this.myId = data.id;
  }

  create() {
    this.cameras.main.setBounds(-100, -100, ARENA_SIZE + 200, ARENA_SIZE + 200);
    if (this.physics && this.physics.world) this.physics.world.setBounds(0, 0, ARENA_SIZE, ARENA_SIZE);

    this.add.grid(ARENA_SIZE/2, ARENA_SIZE/2, ARENA_SIZE, ARENA_SIZE, 100, 100, 0x050505, 1, 0x111111, 1).setDepth(-1);

    this.boundaryLine = this.add.graphics();
    this.boundaryLine.lineStyle(12, 0xff0000, 0.8).strokeRect(0, 0, ARENA_SIZE, ARENA_SIZE);
    this.boundaryLine.setDepth(1);

    // Setup local game state listeners
    if (this.server) {
      this.signalCleanups.push(this.server.onUpdate((state) => this.handleStateUpdate(state)));
      this.signalCleanups.push(this.server.onPlayerDeath((event) => { 
        if (event.id === this.myId) this.triggerDeathSequence(event); 
      }));
      
      // Listen for cashout success events from ServerSim
      this.signalCleanups.push(this.server.onUpdate((state: GameState) => {
        // Check if this player has cashed out (removed from players but was in cashout state)
        if (this.myId && !state.players[this.myId] && this.isCashingOut) {
          // Player has successfully cashed out
          this.events.emit('cashout-success', {
            totalPot: this.lastSolValue || 0,
            signature: 'processed'
          });
          this.isCashingOut = false;
        }
      }));

      this.signalCleanups.push(this.server.onKill((event: KillEvent) => {
        if (event.killerId === this.myId) {
          this.events.emit('kill-alert', event);
          this.showFloatingText(event.pos.x, event.pos.y, `+${event.stolenAmount.toFixed(4)} SOL`);
        }
      }));
    }

    // Setup network player sync listeners
    this.setupNetworkListeners();

    this.events.on('shutdown', this.cleanup, this);
    this.events.on('destroy', this.cleanup, this);

    this.input.on('pointerdown', () => { this.isBoosting = true; });
    this.input.on('pointerup', () => { this.isBoosting = false; });
    
    if (this.input.keyboard) {
        this.input.keyboard.on('keydown-SHIFT', () => { this.isBoosting = true; });
        this.input.keyboard.on('keyup-SHIFT', () => { this.isBoosting = false; });
        this.input.keyboard.on('keydown-SPACE', () => { this.isCashingOut = true; });
        this.input.keyboard.on('keyup-SPACE', () => { this.isCashingOut = false; });
    }
  }

  private cleanup() {
    this.signalCleanups.forEach(cleanup => cleanup());
    this.signalCleanups = [];
    
    // Clean up network player sprites
    this.otherPlayers.forEach((sperm) => {
      sperm.destroy();
    });
    this.otherPlayers.clear();
  }
  
  // Set up all network synchronization listeners
  private setupNetworkListeners() {
    console.log('[NETWORK] Setting up network player sync listeners for player:', this.myId);
    
    // DEBUG LOG: Listen for existing players when joining the game
    const existingPlayersCleanup = wsClient.onExistingPlayers((data) => {
      console.log('[NETWORK] Received existing players:', data.players?.length || 0);
      
      if (data.players && Array.isArray(data.players)) {
        data.players.forEach((player: any) => {
          if (player.id !== this.myId) {
            console.log(`[NETWORK] Creating sprite for existing player: ${player.id} at (${player.x}, ${player.y})`);
            this.createOrUpdateNetworkPlayer(player);
          }
        });
      }
    });
    this.signalCleanups.push(existingPlayersCleanup);
    
    // DEBUG LOG: Listen for player-joined events (new players joining after us)
    const playerJoinedCleanup = wsClient.onPlayerJoined((data) => {
      if (data.playerId !== this.myId) {
        console.log(`[NETWORK] New player joined: ${data.playerId} at (${data.x}, ${data.y})`);
        this.createOrUpdateNetworkPlayer({
          id: data.playerId,
          name: data.playerName || `Player ${data.playerId.substring(0, 4)}`,
          x: data.x,
          y: data.y,
          angle: data.angle || 0,
          timestamp: data.timestamp
        });
      }
    });
    this.signalCleanups.push(playerJoinedCleanup);
    
    // DEBUG LOG: Listen for current-players in room (sent after join-room)
    const currentPlayersCleanup = wsClient.onCurrentPlayers((data) => {
      console.log('[NETWORK] Received current players in room:', data.players?.length || 0);
      
      if (data.players && Array.isArray(data.players)) {
        data.players.forEach((player: any) => {
          if (player.id !== this.myId) {
            console.log(`[NETWORK] Creating sprite for room player: ${player.id}`);
            this.createOrUpdateNetworkPlayer(player);
          }
        });
      }
    });
    this.signalCleanups.push(currentPlayersCleanup);
    
    // DEBUG LOG: Listen for global-game-state (authoritative state from server at 30 FPS)
    const globalGameStateCleanup = wsClient.onGlobalGameState((data) => {
      if (data.players && Array.isArray(data.players)) {
        data.players.forEach((player: any) => {
          if (player.id !== this.myId) {
            this.createOrUpdateNetworkPlayer(player);
          }
        });
      }
    });
    this.signalCleanups.push(globalGameStateCleanup);
    
    // DEBUG LOG: Listen for player movement events
    const playerMovedCleanup = wsClient.onPlayerMoved((data) => {
      if (data.playerId !== this.myId) {
        // Log occasionally for debugging
        if (Math.random() < 0.01) {
          console.log(`[NETWORK] Player moved: ${data.playerId} to (${data.x?.toFixed(1)}, ${data.y?.toFixed(1)})`);
        }
        this.handlePlayerMoved(data);
      }
    });
    this.signalCleanups.push(playerMovedCleanup);
    
    // Listen for direct position updates
    const positionUpdateCleanup = wsClient.onPlayerPositionUpdate((data) => {
      if (data.playerId !== this.myId) {
        this.handlePlayerPosition(data);
      }
    });
    this.signalCleanups.push(positionUpdateCleanup);
    
    // Listen for player disconnection
    const playerDisconnectedCleanup = wsClient.onPlayerDisconnected((data) => {
      this.handlePlayerDisconnected(data);
    });
    this.signalCleanups.push(playerDisconnectedCleanup);
  }
  
  // Create or update a network player based on received data
  private createOrUpdateNetworkPlayer(playerData: any) {
    if (!playerData.id) {
      console.warn('[NETWORK] Received player data without ID:', playerData);
      return;
    }
    
    // DEBUG LOG: Skip self
    if (playerData.id === this.myId) {
      return;
    }
    
    // Get the timestamp for freshness check
    const timestamp = playerData.timestamp || Date.now();
    const lastUpdate = this.networkUpdateTime.get(playerData.id) || 0;
    
    // Skip older updates (but allow if no timestamp provided)
    if (playerData.timestamp && timestamp < lastUpdate) {
      return;
    }
    
    this.networkUpdateTime.set(playerData.id, timestamp);
    
    let sperm = this.otherPlayers.get(playerData.id);
    
    // If this player isn't in our network players map, create new sprite
    if (!sperm) {
      console.log(`[NETWORK] Creating new network player: ${playerData.id} at (${playerData.x || 0}, ${playerData.y || 0})`);
      
      // Generate a consistent color based on the player ID
      const colorSeed = parseInt(playerData.id.replace(/\D/g, '').slice(0, 6) || '0', 10);
      const color = Phaser.Display.Color.GetColor(
        100 + (colorSeed % 155),  // Ensure visible R component
        100 + ((colorSeed >> 8) % 155), // Ensure visible G component
        100 + ((colorSeed >> 16) % 155) // Ensure visible B component
      );
      
      // Initialize with all required PlayerData properties
      const initialData: PlayerData = {
        id: playerData.id,
        name: playerData.name || `Player ${playerData.id.substring(0, 4)}`,
        pos: { x: playerData.x || 0, y: playerData.y || 0 },
        angle: playerData.angle || 0,
        length: 30, // Default length
        color: color,
        isBoosting: false,
        score: playerData.score || 0,
        solValue: playerData.solValue || 0,
        segments: [], // Empty segments initially
        solAddress: ''
      };
      
      // Create new player sprite
      sperm = new Sperm(this, initialData);
      this.otherPlayers.set(playerData.id, sperm);
    }
    
    // Get current properties for values we might need to preserve
    const headPos = sperm.getHead();
    
    // Update the player with whatever data we have, ensuring all required properties
    const updateData: PlayerData = {
      id: playerData.id,
      name: playerData.name || 'Unknown',
      pos: { 
        x: playerData.x !== undefined ? playerData.x : headPos.x,
        y: playerData.y !== undefined ? playerData.y : headPos.y 
      },
      angle: playerData.angle !== undefined ? playerData.angle : 0,
      isBoosting: playerData.boost !== undefined ? playerData.boost : false,
      score: playerData.score || 0,
      solValue: playerData.solValue || 0,
      segments: [], // We'll generate segments on render if needed
      length: 30, // Default length
      // Generate a random color if we can't access the original
      color: 0xFFFFFF,
      solAddress: ''
    };
    
    // Update the sprite
    sperm.update(updateData);
  }
  
  // Handle player moved events
  private handlePlayerMoved(data: any) {
    if (!data || !data.playerId) {
      console.warn('Received invalid player moved data:', data);
      return;
    }
    
    // Debug log
    console.log(`Processing move for player ${data.playerId} at x:${data.x || 'unknown'}, y:${data.y || 'unknown'}`);
    
    this.createOrUpdateNetworkPlayer({
      id: data.playerId,
      angle: data.angle,
      boost: data.boost,
      x: data.x,
      y: data.y,
      timestamp: data.timestamp
    });
  }
  
  // Handle direct position updates
  private handlePlayerPosition(data: any) {
    if (!data || !data.playerId) {
      console.warn('Received invalid player position data:', data);
      return;
    }
    
    this.createOrUpdateNetworkPlayer({
      id: data.playerId,
      x: data.x,
      y: data.y,
      angle: data.angle,
      timestamp: data.timestamp
    });
  }
  
  // Handle player disconnected
  private handlePlayerDisconnected(data: any) {
    const playerId = data.playerId;
    console.log(`Player disconnected: ${playerId}`);
    
    // Remove player from our tracking
    if (this.otherPlayers.has(playerId)) {
      console.log(`Removing network player: ${playerId}`);
      this.otherPlayers.get(playerId)?.destroy();
      this.otherPlayers.delete(playerId);
      this.networkUpdateTime.delete(playerId);
    }
  }

  private showFloatingText(x: number, y: number, text: string) {
    const floating = this.add.text(x, y, text, { fontSize: '24px', color: '#4ade80', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: floating, y: y - 100, alpha: 0, duration: 1500, ease: 'Power2', onComplete: () => floating.destroy() });
  }

  private triggerDeathSequence(event: DeathEvent) {
    this.cameras.main.shake(300, 0.03);
    this.cameras.main.flash(500, 255, 0, 0);
    this.time.delayedCall(800, () => this.events.emit('game-over', event));
  }

  update() {
    const playerSperm = this.players.get(this.myId);
    if (playerSperm) {
      const head = playerSperm.getHead();
      this.cameras.main.centerOn(head.x, head.y);

      const pointer = this.input.activePointer;
      const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const angle = Phaser.Math.Angle.Between(head.x, head.y, worldPoint.x, worldPoint.y);
      
      // Authoritative Input: Tell server intent to move, boost, and cashout
      if (this.server) {
        this.server.input(this.myId, angle, this.isBoosting, this.isCashingOut);

        // Get progress from the server's authoritative timer
        const progress = this.server.getCashoutProgress(this.myId);
        if (progress > 0) {
          this.events.emit('cashout-progress', progress);
        } else {
          this.events.emit('cashout-progress', 0);
        }
      }
      
      // Send direct position update to other players via WebSocket
      wsClient.sendPosition(
        this.myId,
        head.x,
        head.y,
        angle,
        this.isBoosting ? 1.5 : 1.0
      );
    }
  }

  private handleStateUpdate(state: GameState) {
    Object.entries(state.players).forEach(([id, pData]) => {
      let sperm = this.players.get(id);
      if (!sperm) {
        sperm = new Sperm(this, pData);
        this.players.set(id, sperm);
      }
      sperm.update(pData);
      
      // Track the current player's SOL value
      if (id === this.myId) {
        this.lastSolValue = pData.solValue;
      }
    });

    this.players.forEach((_, id) => {
      if (!state.players[id]) {
        this.players.get(id)?.destroy();
        this.players.delete(id);
      }
    });

    Object.entries(state.food).forEach(([id, fData]) => {
      if (!this.foods.has(id)) {
        const radius = fData.value > 1 ? 8 : 6;
        const food = this.add.arc(fData.x, fData.y, radius, 0, 360, false, fData.color);
        
        if (fData.value > 1) {
          food.setStrokeStyle(2, 0xffffff, 0.8); // Brighter stroke for lucky food
        } else {
          food.setStrokeStyle(1, 0xffffff, 0.3);
        }
        
        this.foods.set(id, food);
      } else {
        // Update position for magnet effect
        const food = this.foods.get(id);
        if (food) {
          food.setPosition(fData.x, fData.y);
        }
      }
    });

    this.foods.forEach((obj, id) => {
      if (!state.food[id]) {
        obj.destroy();
        this.foods.delete(id);
      }
    });

    const sorted = Object.values(state.players).sort((a, b) => b.score - a.score).slice(0, 10);
    this.events.emit('leaderboard-update', sorted);

    const myPlayer = state.players[this.myId];
    if (myPlayer) {
      this.events.emit('minimap-update', { x: myPlayer.pos.x, y: myPlayer.pos.y, solValue: myPlayer.solValue });
    }
  }
}
