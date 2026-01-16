
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

  private players: Map<string, Sperm> = new Map(); // Local players only
  private foods: Map<string, Phaser.GameObjects.Arc> = new Map();
  private myId: string = '';
  private server: ServerSim | null = null;
  private isBoosting: boolean = false;
  private isCashingOut: boolean = false;
  private isDead: boolean = false;
  private boundaryLine!: Phaser.GameObjects.Graphics;
  private signalCleanups: (() => void)[] = [];
  private serverPosition: { x: number, y: number } = { x: 0, y: 0 };
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private lastSolValue: number = 0;
  
  // Network player management
  private networkSprites!: Phaser.GameObjects.Group; // Group for network player sprites
  private otherPlayers: Map<string, Sperm> = new Map(); // Network players from other rooms
  private networkUpdateTime: Map<string, number> = new Map(); // Last update time for each player
  private stateBuffer: Map<string, Array<{state: any, timestamp: number}>> = new Map(); // Buffer for interpolation
  private readonly RENDER_DELAY = 100; // ms
  private readonly BUFFER_SIZE = 4; // Keep 4 states for interpolation
  private readonly INTERPOLATION_STEP = 1/144; // For 144hz rendering
  private lastPositionSentTime: number = 0; // For throttling position updates
  private fpsText!: Phaser.GameObjects.Text; // FPS counter display
  
  constructor() {
    super('GameScene');
  }

  init(data: { id: string, server: ServerSim }) {
    this.server = data.server;
    this.myId = data.id;
    this.isDead = false;
    this.serverPosition = { x: 0, y: 0 };
  }

  create() {
    // Set physics step to fixed
    if (this.physics && this.physics.world) {
      this.physics.world.setFPS(60);
      this.physics.world.fixedStep = true;
    }
    
    // Set camera bounds and smooth follow
    this.cameras.main.setBounds(-100, -100, ARENA_SIZE + 200, ARENA_SIZE + 200);
    this.cameras.main.setLerp(0.1); // Smooth camera follow
    if (this.physics && this.physics.world) this.physics.world.setBounds(0, 0, ARENA_SIZE, ARENA_SIZE);

    this.add.grid(ARENA_SIZE/2, ARENA_SIZE/2, ARENA_SIZE, ARENA_SIZE, 100, 100, 0x050505, 1, 0x111111, 1).setDepth(-1);

    this.boundaryLine = this.add.graphics();
    this.boundaryLine.lineStyle(12, 0xff0000, 0.8).strokeRect(0, 0, ARENA_SIZE, ARENA_SIZE);
    this.boundaryLine.setDepth(1);
    
    // Create network sprites group
    this.networkSprites = this.add.group();
    
    // Add FPS counter for performance monitoring
    this.fpsText = this.add.text(10, 10, 'FPS: 0', { 
      fontSize: '16px', 
      color: '#ffffff',
      strokeThickness: 1,
      stroke: '#000000'
    }).setScrollFactor(0).setDepth(1000);

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
    // Listen for existing players when joining the game
    const existingPlayersCleanup = wsClient.onExistingPlayers((data) => {      
      // Create a Set of known player IDs to prevent duplicates
      const processedIds = new Set<string>();
      
      if (data.players && Array.isArray(data.players)) {
        data.players.forEach((player: any) => {
          if (player.id !== this.myId && !processedIds.has(player.id)) {
            processedIds.add(player.id);
            this.createOrUpdateNetworkPlayer(player);
          }
        });
      }
    });
    this.signalCleanups.push(existingPlayersCleanup);
    
    // Listen for player-joined events (new players joining after us)
    const playerJoinedCleanup = wsClient.onPlayerJoined((data) => {
      if (data.playerId !== this.myId) {
        // First check if we already have this player to prevent duplicates
        if (!this.otherPlayers.has(data.playerId)) {
          this.createOrUpdateNetworkPlayer({
            id: data.playerId,
            name: data.playerName || `Player ${data.playerId.substring(0, 4)}`,
            x: data.x,
            y: data.y,
            angle: data.angle || 0,
            timestamp: data.timestamp
          });
        }
      }
    });
    this.signalCleanups.push(playerJoinedCleanup);
    
    // Listen for current-players in room (sent after join-room)
    const currentPlayersCleanup = wsClient.onCurrentPlayers((data) => {      
      if (data.players && Array.isArray(data.players)) {
        data.players.forEach((player: any) => {
          if (player.id !== this.myId) {
            this.createOrUpdateNetworkPlayer(player);
          }
        });
      }
    });
    this.signalCleanups.push(currentPlayersCleanup);
    
    // Listen for global-game-state (authoritative state from server at 20 FPS)
    const globalGameStateCleanup = wsClient.onGlobalGameState((data) => {
      // Only process if we actually have player data
      if (data.players && Array.isArray(data.players) && data.players.length > 0) {
        // First pass: collect all player IDs in this update
        const currentPlayers = new Set<string>();
        
        data.players.forEach((player: any) => {
          if (player.id !== this.myId) {
            currentPlayers.add(player.id);
            this.createOrUpdateNetworkPlayer(player);
          }
        });
      }
    });
    this.signalCleanups.push(globalGameStateCleanup);
    
    // Listen for player movement events
    const playerMovedCleanup = wsClient.onPlayerMoved((data) => {
      if (data.playerId !== this.myId) {
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
      return;
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
    
    // State updates are now handled via the state buffer
    
    let sperm = this.otherPlayers.get(playerData.id);
    
    // If this player isn't in our network players map, create new sprite
    if (!sperm) {
      // Create new network player
      
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
      
      // Create new player sprite with physics disabled
      sperm = new Sperm(this, initialData);
      
      // Add to network sprites group - for organization only, no physics needed
      this.networkSprites.add(sperm.getHead());
      
      // Note: We rely purely on manual position updates via lerp
      // Network players are just visual representations without physics
      
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
    
    // Only update properties like name, color, etc. directly
    // Position updates will be handled through interpolation in the update() method
    sperm.update(updateData); // Direct update only for initial creation
  }
  
  // Handle player moved events
  private handlePlayerMoved(data: any) {
    if (!data || !data.playerId) {
      return;
      return;
    }
    
    // Add to state buffer instead of direct update
    if (!this.stateBuffer.has(data.playerId)) {
      this.stateBuffer.set(data.playerId, []);
    }
    
    const buffer = this.stateBuffer.get(data.playerId)!;
    const timestamp = data.timestamp || Date.now();
    
    // Insert state in correct temporal order
    const insertIndex = buffer.findIndex(state => state.timestamp > timestamp);
    if (insertIndex === -1) {
      buffer.push({
        state: {
          x: data.x,
          y: data.y,
          angle: data.angle,
          boost: data.boost,
          score: data.score,
          solValue: data.solValue
        },
        timestamp
      });
    } else {
      buffer.splice(insertIndex, 0, {
        state: {
          x: data.x,
          y: data.y,
          angle: data.angle,
          boost: data.boost,
          score: data.score,
          solValue: data.solValue
        },
        timestamp
      });
    }
    
    // Ensure player exists for rendering
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
      return;
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
    // Remove player from our tracking
    if (this.otherPlayers.has(playerId)) {
      this.otherPlayers.get(playerId)?.destroy();
      this.otherPlayers.delete(playerId);
      this.networkUpdateTime.delete(playerId);
      this.targetPositions.delete(playerId);
    }
  }

  private showFloatingText(x: number, y: number, text: string) {
    const floating = this.add.text(x, y, text, { fontSize: '24px', color: '#4ade80', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: floating, y: y - 100, alpha: 0, duration: 1500, ease: 'Power2', onComplete: () => floating.destroy() });
  }

  private triggerDeathSequence(event: DeathEvent) {
    if (this.isDead) return; // Prevent multiple death triggers
    
    this.isDead = true;
    
    // Immediately pause physics and disconnect
    if (this.physics) this.physics.pause();
    wsClient.disconnect();
    
    // Visual effects - reduced shake for smoother death
    this.cameras.main.shake(200, 0.02);
    this.cameras.main.flash(300, 255, 0, 0);
    
    // Clean up ALL input listeners
    this.input.keyboard?.off('keydown-SHIFT');
    this.input.keyboard?.off('keyup-SHIFT');
    this.input.keyboard?.off('keydown-SPACE');
    this.input.keyboard?.off('keyup-SPACE');
    this.input.off('pointerdown');
    this.input.off('pointerup');
    
    // Freeze the player at current position
    const playerSperm = this.players.get(this.myId);
    if (playerSperm) {
      const head = playerSperm.getHead();
      // Since we're using position-based movement, just stop updating position
      this.isBoosting = false;
      this.isCashingOut = false;
    }
    
    // Instant game over - no delay
    this.events.emit('game-over', event);
  }

  update() {
    const playerSperm = this.players.get(this.myId);
    if (playerSperm && !this.isDead) {
      const head = playerSperm.getHead();
      
      // Local movement prediction
      const pointer = this.input.activePointer;
      const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const angle = Phaser.Math.Angle.Between(head.x, head.y, worldPoint.x, worldPoint.y);
      
      // Apply movement with smooth rotation
      const speed = this.isBoosting ? 6 : 4;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed;
      
      // Update local position - client authority
      head.x += dx;
      head.y += dy;
      
      // Smooth rotation with increased interpolation
      head.rotation = Phaser.Math.Angle.RotateTo(head.rotation, angle, 0.15);
      
      // Only validate against server position if deviation is extreme
      const serverPos = this.server?.getPlayerData(this.myId)?.pos;
      if (serverPos) {
        const dist = Phaser.Math.Distance.Between(
          head.x,
          head.y,
          serverPos.x,
          serverPos.y
        );
        
        // Only snap if deviation is huge (200px)
        if (dist > 200) {
          head.x = serverPos.x;
          head.y = serverPos.y;
        }
      }
      
      // Clamp position to arena bounds
      head.x = Phaser.Math.Clamp(head.x, 0, ARENA_SIZE);
      head.y = Phaser.Math.Clamp(head.y, 0, ARENA_SIZE);
      
      // Send input to server in background
      if (this.server && !this.isDead) {
        this.server.input(this.myId, angle, this.isBoosting, this.isCashingOut);
        
        const progress = this.server.getCashoutProgress(this.myId);
        this.events.emit('cashout-progress', progress > 0 ? progress : 0);
        
        // Update server position from authoritative source
        const serverState = this.server.getPlayerData(this.myId);
        if (serverState) {
          this.serverPosition.x = serverState.pos.x;
          this.serverPosition.y = serverState.pos.y;
        }
      }
      
      // Throttled position sync to other players (only if alive)
      const currentTimestamp = Date.now();
      if (!this.isDead && currentTimestamp - this.lastPositionSentTime >= 33) { // ~30fps network updates
        this.lastPositionSentTime = currentTimestamp;
        wsClient.sendPosition(
          this.myId,
          head.x,
          head.y,
          angle,
          this.isBoosting ? 1.5 : 1.0
        );
      }
      
      this.fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
      
      // Smooth interpolation for other players
      const renderTime = this.time.now - this.RENDER_DELAY;
      
      this.otherPlayers.forEach((sperm, id) => {
        const buffer = this.stateBuffer.get(id);
        if (!buffer || buffer.length < 2) return;
        
        // Find states to interpolate between
        const states = buffer
          .filter(state => state.timestamp <= renderTime)
          .slice(-3); // Use last 3 states for smoother interpolation
        
        if (states.length < 2) return;
        
        const latest = states[states.length - 1];
        const previous = states[states.length - 2];
        
        // Hermite interpolation for smoother movement
        const t = (renderTime - previous.timestamp) / (latest.timestamp - previous.timestamp);
        const alpha = Phaser.Math.Easing.Cubic.InOut(Math.max(0, Math.min(1, t)));
        
        const newX = Phaser.Math.Linear(previous.state.x, latest.state.x, alpha);
        const newY = Phaser.Math.Linear(previous.state.y, latest.state.y, alpha);
        const newAngle = Phaser.Math.Angle.RotateTo(previous.state.angle, latest.state.angle, 0.1);
        
        sperm.update({
          id,
          name: (sperm as any).nameText?.text || 'Unknown',
          pos: { x: newX, y: newY },
          angle: newAngle,
          isBoosting: latest.state.boost || false,
          score: latest.state.score || 0,
          solValue: latest.state.solValue || 0,
          segments: latest.state.segments || [],
          length: 30,
          color: sperm.getColor(),
          solAddress: ''
        });
        
        // Cleanup old states
        while (buffer.length > this.BUFFER_SIZE) buffer.shift();
      });
    }
  }

  private handleStateUpdate(state: GameState) {
    Object.entries(state.players).forEach(([id, pData]) => {
      // Skip local player position updates from server
      if (id === this.myId) {
        // Only update non-position data for local player
        const localPlayer = this.players.get(id);
        if (localPlayer) {
          this.lastSolValue = pData.solValue;
          // Update score and other non-position properties
          localPlayer.updateNonPosition(pData);
        }
        return;
      }

      let sperm = this.players.get(id);
      if (!sperm) {
        sperm = new Sperm(this, pData);
        this.players.set(id, sperm);
      }
      sperm.update(pData);
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
