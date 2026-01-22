
import Phaser from 'phaser';
import { ServerSim, DeathEvent, KillEvent, CashoutFailedEvent } from '../services/ServerSim';
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
  private stateBuffer: Map<string, Array<{ state: any, timestamp: number }>> = new Map(); // Buffer for interpolation
  private readonly RENDER_DELAY = 100; // ms
  private readonly BUFFER_SIZE = 4; // Keep 4 states for interpolation
  private readonly INTERPOLATION_STEP = 1 / 144; // For 144hz rendering
  private lastPositionSentTime: number = 0; // For throttling position updates
  private fpsText!: Phaser.GameObjects.Text; // FPS counter display
  private cashoutStartTime?: number; // Track when cashout started for progress calculation

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

    this.add.grid(ARENA_SIZE / 2, ARENA_SIZE / 2, ARENA_SIZE, ARENA_SIZE, 100, 100, 0x050505, 1, 0x111111, 1).setDepth(-1);

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

      // Listen for cashout success events from ServerSim via proper callback
      console.log(`[GameScene] Checking if onCashoutSuccess exists: ${!!this.server.onCashoutSuccess}`);
      if (this.server.onCashoutSuccess) {
        console.log(`[GameScene] Registering onCashoutSuccess callback...`);
        this.signalCleanups.push(this.server.onCashoutSuccess((event) => {
          console.log(`[GameScene] ========== CASHOUT SUCCESS CALLBACK FIRED ==========`);
          console.log(`[GameScene] Event playerId: ${event.playerId}, myId: ${this.myId}`);
          if (event.playerId === this.myId) {
            console.log(`[GameScene] Cashout success received: ${event.totalPot} SOL, player receives: ${event.playerReceives} SOL`);
            // Emit to App.tsx to show success popup
            this.events.emit('cashout-success', {
              totalPot: event.totalPot,
              playerReceives: event.playerReceives,
              signature: event.signature
            });
            // Trigger exit sequence (similar to death but for cashout)
            this.triggerCashoutExit(event);
          }
        }));
      }

      // DEBUG LOG: Listen for cashout failed events to reset player state
      if (this.server.onCashoutFailed) {
        this.signalCleanups.push(this.server.onCashoutFailed((event: CashoutFailedEvent) => {
          if (event.playerId === this.myId) {
            console.log(`[GameScene] Cashout FAILED: ${event.error}`);
            // Reset cashing out state so player can move again
            this.isCashingOut = false;
            // Emit to App.tsx to show error notification
            this.events.emit('cashout-failed', {
              error: event.error,
              shouldResetPlayer: event.shouldResetPlayer
            });
            // Reset cashout progress bar
            this.events.emit('cashout-progress', 0);
            // Show floating error text
            const playerSperm = this.players.get(this.myId);
            if (playerSperm) {
              const head = playerSperm.getHead();
              this.showFloatingText(head.x, head.y, `Cashout Failed!`);
            }
          }
        }));
      }

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
    // Listen for player-death events from the server
    const playerDeathCleanup = wsClient.onPlayerDeath((event) => {
      console.log(`[GameScene] Received player-death event:`, event);
      if (event.id === this.myId) {
        // This is our player dying
        this.triggerDeathSequence(event);
      } else {
        // Another player died - remove them from our view
        this.handlePlayerDisconnected({ playerId: event.id });
      }
    });
    this.signalCleanups.push(playerDeathCleanup);
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

    // DEBUG LOG: Listen for cashout success from multiplayer server
    const cashoutSuccessCleanup = wsClient.onCashoutSuccess((data) => {
      console.log(`[GameScene] Received cashout-success from WebSocket:`, data);
      if (data.playerId === this.myId) {
        console.log(`[GameScene] Cashout success for my player! Triggering exit...`);
        this.events.emit('cashout-success', {
          totalPot: data.totalPot,
          playerReceives: data.playerReceives,
          signature: data.signature
        });
        this.triggerCashoutExit(data);
      }
    });
    this.signalCleanups.push(cashoutSuccessCleanup);

    // DEBUG LOG: Listen for cashout failed from multiplayer server
    const cashoutFailedCleanup = wsClient.onCashoutFailed((data) => {
      console.log(`[GameScene] Received cashout-failed from WebSocket:`, data);
      if (data.playerId === this.myId) {
        console.log(`[GameScene] Cashout FAILED for my player: ${data.error}`);
        this.isCashingOut = false;
        this.events.emit('cashout-failed', {
          error: data.error,
          shouldResetPlayer: data.shouldResetPlayer
        });
        this.events.emit('cashout-progress', 0);
        const playerSperm = this.players.get(this.myId);
        if (playerSperm) {
          const head = playerSperm.getHead();
          this.showFloatingText(head.x, head.y, `Cashout Failed!`);
        }
      }
    });
    this.signalCleanups.push(cashoutFailedCleanup);
  }

  // Create or update a network player based on received data
  private createOrUpdateNetworkPlayer(playerData: any) {
    if (!playerData.id) {
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
      this.stateBuffer.delete(playerId);
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

  private triggerCashoutExit(event: { playerId: string; totalPot: number; playerReceives: number; signature: string }) {
    if (this.isDead) return; // Prevent multiple triggers

    this.isDead = true;
    console.log(`[GameScene] Triggering cashout exit for player ${event.playerId}`);

    // Pause physics and disconnect
    if (this.physics) this.physics.pause();
    wsClient.disconnect();

    // Visual effects - green flash for success (not red like death)
    this.cameras.main.flash(300, 0, 255, 100);

    // Clean up ALL input listeners
    this.input.keyboard?.off('keydown-SHIFT');
    this.input.keyboard?.off('keyup-SHIFT');
    this.input.keyboard?.off('keydown-SPACE');
    this.input.keyboard?.off('keyup-SPACE');
    this.input.off('pointerdown');
    this.input.off('pointerup');

    // Stop player movement
    this.isBoosting = false;
    this.isCashingOut = false;

    // Show floating text for winnings
    const playerSperm = this.players.get(this.myId);
    if (playerSperm) {
      const head = playerSperm.getHead();
      this.showFloatingText(head.x, head.y, `CASHED OUT: ${event.playerReceives.toFixed(4)} SOL`);
    }
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

      // CLIENT-SIDE BOUNDARY DEATH - immediate death when touching red line
      const BOUNDARY_DEATH_MARGIN = 10;
      if (head.x <= BOUNDARY_DEATH_MARGIN || head.x >= ARENA_SIZE - BOUNDARY_DEATH_MARGIN ||
        head.y <= BOUNDARY_DEATH_MARGIN || head.y >= ARENA_SIZE - BOUNDARY_DEATH_MARGIN) {
        // Trigger death immediately on client (triggerDeathSequence sets isDead internally)
        const serverData = this.server?.getPlayerData(this.myId);
        const deathEvent: DeathEvent = {
          id: this.myId,
          score: serverData?.score || 0,
          length: serverData?.length || 30,
          reason: 'BOUNDARY',
          killedBy: 'The Arena',
          solLost: this.lastSolValue || 0,
          timeAlive: this.server?.getTimeAlive(this.myId) || 0
        };
        this.triggerDeathSequence(deathEvent);
        return; // Stop processing
      }

      // Update tail segments to follow the head
      playerSperm.updateLocalSegments();

      // Send input to server in background
      if (this.server && !this.isDead) {
        // DEBUG LOG: Track cashout input
        if (this.isCashingOut) {
          console.log(`[GameScene] Sending cashout input: isCashingOut=${this.isCashingOut}, isBoosting=${this.isBoosting}`);
        }

        // Check if we're in multiplayer mode by checking if WebSocket is connected
        if (wsClient.isConnected()) {
          // Multiplayer: Send via WebSocket
          console.log(`[GameScene] Sending input via WebSocket (multiplayer)`);
          wsClient.sendInput(this.myId, angle, this.isBoosting, this.isCashingOut);

          // For cashout progress in multiplayer, we need to track it differently
          // For now, emit a simple progress based on time held
          if (this.isCashingOut) {
            if (!this.cashoutStartTime) {
              this.cashoutStartTime = Date.now();
              console.log(`[GameScene] Cashout started, tracking progress from ${this.cashoutStartTime}`);
            }
            const progress = Math.min(1, (Date.now() - this.cashoutStartTime) / 3000);
            this.events.emit('cashout-progress', progress);
          } else {
            if (this.cashoutStartTime) {
              console.log(`[GameScene] Cashout cancelled, resetting progress`);
              this.cashoutStartTime = undefined;
            }
            this.events.emit('cashout-progress', 0);
          }
        } else {
          // Single-player: Use local server
          console.log(`[GameScene] Sending input to local server (single-player)`);
          this.server.input(this.myId, angle, this.isBoosting, this.isCashingOut);

          const progress = this.server.getCashoutProgress(this.myId);
          this.events.emit('cashout-progress', progress > 0 ? progress : 0);
        }

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
    // IMPORTANT: Only handle LOCAL player from state updates
    // Other players are handled EXCLUSIVELY via network events (otherPlayers map)
    // This prevents duplicate rendering

    const myPlayerData = state.players[this.myId];
    if (myPlayerData) {
      let localPlayer = this.players.get(this.myId);
      // Create local player sprite if it doesn't exist yet
      if (!localPlayer) {
        localPlayer = new Sperm(this, myPlayerData);
        this.players.set(this.myId, localPlayer);
        // Set camera to follow the local player
        this.cameras.main.startFollow(localPlayer.getHead(), true, 0.1, 0.1);
      }
      this.lastSolValue = myPlayerData.solValue;
      // Update score and other non-position properties (not position - that's client controlled)
      localPlayer.updateNonPosition(myPlayerData);
    }

    Object.entries(state.food).forEach(([id, fData]) => {
      if (!this.foods.has(id)) {
        const radius = fData.value > 1 ? 10 : 7;
        const food = this.add.arc(fData.x, fData.y, radius, 0, 360, false, fData.color);
        food.setAlpha(0.95);

        if (fData.value > 1) {
          food.setStrokeStyle(2, 0xffffff, 0.9);
        } else {
          food.setStrokeStyle(1, 0xffffff, 0.5);
        }

        food.setDepth(2);
        this.foods.set(id, food);
      } else {
        // Smooth position update for magnet eating effect
        const food = this.foods.get(id);
        if (food) {
          // Fast lerp for responsive magnet movement towards sperm head
          food.x = Phaser.Math.Linear(food.x, fData.x, 0.5);
          food.y = Phaser.Math.Linear(food.y, fData.y, 0.5);
        }
      }
    });

    this.foods.forEach((obj, id) => {
      if (!state.food[id]) {
        // Get player position for eating animation target
        const myPlayer = this.players.get(this.myId);
        if (myPlayer) {
          const head = myPlayer.getHead();
          // Animate food flying into the sperm's mouth
          this.tweens.add({
            targets: obj,
            x: head.x,
            y: head.y,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 120,
            ease: 'Quad.easeIn',
            onComplete: () => {
              obj.destroy();
            }
          });
        } else {
          // Fallback - just shrink
          this.tweens.add({
            targets: obj,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 100,
            onComplete: () => {
              obj.destroy();
            }
          });
        }
        this.foods.delete(id);
      }
    });

    const sorted = Object.values(state.players).sort((a, b) => b.score - a.score).slice(0, 10);
    this.events.emit('leaderboard-update', sorted);

    const myPlayer = state.players[this.myId];
    if (myPlayer) {
      // Collect all 'other' players for the minimap
      const allOtherPlayers: Array<{ x: number, y: number, isSelf: boolean }> = [];

      // Add players from local simulation state (that aren't me)
      Object.values(state.players).forEach(p => {
        if (p.id !== this.myId) {
          allOtherPlayers.push({ x: p.pos.x, y: p.pos.y, isSelf: false });
        }
      });

      // Add network players
      this.otherPlayers.forEach((sperm) => {
        const head = sperm.getHead();
        allOtherPlayers.push({ x: head.x, y: head.y, isSelf: false });
      });

      this.events.emit('minimap-update', {
        x: myPlayer.pos.x,
        y: myPlayer.pos.y,
        solValue: myPlayer.solValue,
        otherPlayers: allOtherPlayers
      });
    }
  }
}
