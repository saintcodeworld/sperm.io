import { GameState, PlayerData, ARENA_SIZE, INITIAL_LENGTH, SEGMENT_DISTANCE, BASE_SPEED, BOOST_SPEED } from '../types';
import { authService } from './AuthService';
import { gameTransactionService } from './GameTransactionService';
import { solanaService } from './SolanaService';

export type DeathReason = 'BOUNDARY' | 'PLAYER';
export interface DeathEvent {
  id: string;
  score: number;
  length: number;
  reason: DeathReason;
  killedBy: string;
  solLost: number;
  timeAlive?: number;
}

export interface KillEvent {
  killerId: string;
  victimName: string;
  stolenAmount: number;
  pos: { x: number, y: number };
}

type DeathCallback = (event: DeathEvent) => void;
type KillCallback = (event: KillEvent) => void;

// Cashout success event type
export interface CashoutSuccessEvent {
  playerId: string;
  totalPot: number;
  playerReceives: number;
  signature: string;
}

// DEBUG LOG: Cashout failed event type for error handling
export interface CashoutFailedEvent {
  playerId: string;
  error: string;
  shouldResetPlayer: boolean;
}

type CashoutCallback = (event: CashoutSuccessEvent) => void;
type CashoutFailedCallback = (event: CashoutFailedEvent) => void;

export class ServerSim {
  private state: GameState = {
    players: {},
    food: {}
  };
  private callbacks: ((state: GameState) => void)[] = [];
  private deathCallbacks: DeathCallback[] = [];
  private killCallbacks: KillCallback[] = [];
  private cashoutCallbacks: CashoutCallback[] = [];
  private cashoutFailedCallbacks: CashoutFailedCallback[] = []; // DEBUG LOG: Track failed cashout callbacks
  private lastUpdate = Date.now();
  private playerJoinTime: Map<string, number> = new Map();
  private cashoutStates: Map<string, { startTime: number, active: boolean }> = new Map();
  private pendingJoins: Map<string, {entryFee: number, name: string, processingBlockchain: boolean}> = new Map();

  constructor() {
    this.spawnInitialFood();
    setInterval(() => this.update(), 1000 / 60);
  }

  private spawnInitialFood() {
    for (let i = 0; i < 600; i++) this.spawnFood();
  }

  private spawnFood() {
    const id = Math.random().toString(36).substr(2, 9);
    const isLucky = Math.random() < 0.35;
    
    this.state.food[id] = {
      id,
      x: Math.random() * ARENA_SIZE,
      y: Math.random() * ARENA_SIZE,
      value: isLucky ? 2 : 1,
      color: this.getRandomColor()
    };
  }

  private getRandomColor() {
    const h = Math.random();
    const s = 0.8;
    const v = 1.0;
    
    let r = 0, g = 0, b = 0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    
    return ((Math.floor(r * 255) << 16) | (Math.floor(g * 255) << 8) | Math.floor(b * 255));
  }

  public async join(id: string, name: string, entryFee: number = 0.1): Promise<boolean> {
    const user = authService.getCurrentUser();
    
    // For free games (0 SOL), skip balance check
    if (entryFee > 0 && (!user || user.balance < entryFee)) {
      console.error("[Server] Access Denied: Insufficient SOL");
      return false;
    }
    
    try {
      // Mark this join as processing to avoid duplicates
      this.pendingJoins.set(id, {name, entryFee, processingBlockchain: entryFee > 0});
      
      // Only process blockchain transaction for paid games
      if (entryFee > 0 && user) {
        // 1. Process blockchain transaction first
        console.log(`[Server] Processing entry fee transaction for player ${id} with ${entryFee} SOL`);
        
        // Process blockchain transaction with internal wallet
        const txResult = await gameTransactionService.processEntryFee(
          user.solAddress,
          entryFee
        );
        
        if (!txResult.success) {
          console.error(`[Server] Entry fee transaction failed: ${txResult.error}`);
          this.pendingJoins.delete(id);
          return false;
        }
        
        console.log(`[Server] Entry fee transaction confirmed: ${txResult.signature}`);
        
        // 2. Update database balance
        await authService.deductBalance(entryFee);
        console.log(`[Server] Balance deducted for entry fee: ${entryFee} SOL`);
      } else {
        console.log(`[Server] Free game mode - skipping blockchain transaction for player ${id}`);
      }

      // 3. Create player in game state
      this.playerJoinTime.set(id, Date.now());

      const color = this.getRandomColor();
      const margin = 500;
      const startPos = {
        x: margin + Math.random() * (ARENA_SIZE - margin * 2),
        y: margin + Math.random() * (ARENA_SIZE - margin * 2)
      };

      const initialAngle = Math.random() * Math.PI * 2;
      const segments = Array(INITIAL_LENGTH).fill(null).map((_, i) => ({
        x: startPos.x - Math.cos(initialAngle) * i * SEGMENT_DISTANCE,
        y: startPos.y - Math.sin(initialAngle) * i * SEGMENT_DISTANCE
      }));

      this.state.players[id] = {
        id,
        name,
        pos: startPos,
        angle: initialAngle,
        length: INITIAL_LENGTH,
        color,
        isBoosting: false,
        score: 0,
        solValue: entryFee,
        segments,
        solAddress: user?.solAddress || ''
      };
      
      console.log(`[Server] Player ${id} joined successfully with ${entryFee} SOL`);
      this.pendingJoins.delete(id);
      return true;
    } catch (error) {
      console.error(`[Server] Error during join process:`, error);
      this.pendingJoins.delete(id);
      return false;
    }
  }

  // No bots in arena

  public async input(id: string, angle: number, boost: boolean, cashout: boolean) {
    const player = this.state.players[id];
    if (!player) return;

    // Handle cashout request
    if (cashout && !this.cashoutStates.has(id)) {
      console.log(`[ServerSim] ========== CASHOUT INITIATED ==========`);
      console.log(`[ServerSim] Player ID: ${id}`);
      console.log(`[ServerSim] Player solValue: ${player.solValue}`);
      console.log(`[ServerSim] Player solAddress: ${player.solAddress}`);
      console.log(`[ServerSim] Starting 3-second countdown...`);
      
      this.cashoutStates.set(id, {
        startTime: Date.now(),
        active: true
      });
      
      // Start 3-second countdown
      setTimeout(async () => {
        console.log(`[ServerSim] ========== 3 SECONDS ELAPSED ==========`);
        const state = this.cashoutStates.get(id);
        console.log(`[ServerSim] Cashout state active: ${state?.active}`);
        console.log(`[ServerSim] Player still exists: ${!!this.state.players[id]}`);
        
        if (state?.active && this.state.players[id]) {
          const playerData = { ...this.state.players[id] };
          console.log(`[ServerSim] Player data captured:`);
          console.log(`[ServerSim]   - solValue: ${playerData.solValue}`);
          console.log(`[ServerSim]   - solAddress: '${playerData.solAddress}'`);
          console.log(`[ServerSim]   - solAddress length: ${playerData.solAddress?.length || 0}`);
          
          // CHECK: Is solAddress valid?
          if (!playerData.solAddress || playerData.solAddress.length < 30) {
            console.error(`[ServerSim] ERROR: Invalid or missing solAddress!`);
            this.handleCashoutFailure(id, 'Invalid wallet address - cannot process cashout');
            return;
          }
          
          console.log(`[ServerSim] Calling processCashoutTransaction...`);
          
          try {
            await this.processCashoutTransaction(id, playerData);
            console.log(`[ServerSim] processCashoutTransaction completed successfully`);
          } catch (error) {
            console.error(`[ServerSim] processCashoutTransaction threw error:`, error);
            this.handleCashoutFailure(id, error.message || 'Transaction failed');
          }
        } else {
          console.log(`[ServerSim] Cashout cancelled or player left - skipping transaction`);
        }
      }, 3000);
    }
    
    // Cancel cashout if button released
    if (!cashout) {
      const state = this.cashoutStates.get(id);
      if (state) {
        state.active = false;
        this.cashoutStates.delete(id);
        console.log(`[Server] Player ${id} cancelled cashout`);
      }
    }

    player.angle = angle;
    player.isBoosting = boost;
  }

  private async processCashoutTransaction(id: string, playerData: PlayerData) {
    console.log(`[ServerSim] ========== processCashoutTransaction START ==========`);
    console.log(`[ServerSim] Player ID: ${id}`);
    console.log(`[ServerSim] solValue: ${playerData.solValue}`);
    console.log(`[ServerSim] solAddress: ${playerData.solAddress}`);
    
    try {
      const platformFee = playerData.solValue * 0.01;
      const playerReceives = playerData.solValue - platformFee;
      console.log(`[ServerSim] Calculated playerReceives: ${playerReceives}`);

      // DEBUG: BYPASS BLOCKCHAIN - Test if cashout flow works without blockchain
      // TODO: Re-enable blockchain transaction after testing
      console.log(`[ServerSim] BYPASSING BLOCKCHAIN FOR TESTING - immediate success`);
      
      // Simulate successful transaction immediately
      const result = { success: true, signature: 'TEST_BYPASS_' + Date.now() };
      
      console.log(`[ServerSim] Simulated result:`, result);

      if (result.success) {
        console.log(`[ServerSim] Transaction SUCCESS! Signature: ${result.signature}`);
        
        // Remove player from state
        console.log(`[ServerSim] Removing player from state...`);
        delete this.state.players[id];
        this.cashoutStates.delete(id);
        this.playerJoinTime.delete(id);
        
        // Emit cashout success callback
        const cashoutEvent: CashoutSuccessEvent = {
          playerId: id,
          totalPot: playerData.solValue,
          playerReceives: playerReceives,
          signature: result.signature || 'confirmed'
        };
        
        console.log(`[ServerSim] Emitting cashout success to ${this.cashoutCallbacks.length} callbacks...`);
        this.cashoutCallbacks.forEach(cb => {
          console.log(`[ServerSim] Calling callback...`);
          cb(cashoutEvent);
        });
        console.log(`[ServerSim] All callbacks called!`);
      } else {
        console.error(`[ServerSim] Transaction FAILED`);
        this.handleCashoutFailure(id, 'Transaction failed');
      }
    } catch (error) {
      console.error(`[ServerSim] processCashoutTransaction EXCEPTION:`, error);
      console.error(`[ServerSim] Error message: ${error.message}`);
      this.handleCashoutFailure(id, error.message || 'Unknown error during cashout');
    }
    
    console.log(`[ServerSim] ========== processCashoutTransaction END ==========`);
  }

  // DEBUG LOG: Handle cashout failure - reset player state and notify frontend
  private handleCashoutFailure(id: string, errorMessage: string) {
    console.log(`[ServerSim] ========== handleCashoutFailure ==========`);
    console.log(`[ServerSim] Player ID: ${id}`);
    console.log(`[ServerSim] Error message: ${errorMessage}`);
    
    // Reset cashout state so player can try again
    this.cashoutStates.delete(id);
    
    // Keep player in game (don't remove from state) so they can continue playing
    console.log(`[ServerSim] Player still exists in state: ${!!this.state.players[id]}`);
    console.log(`[ServerSim] Number of failure callbacks registered: ${this.cashoutFailedCallbacks.length}`);
    
    if (this.state.players[id]) {
      const failedEvent: CashoutFailedEvent = {
        playerId: id,
        error: errorMessage,
        shouldResetPlayer: true
      };
      console.log(`[ServerSim] Emitting cashout FAILED event (shouldResetPlayer=true)...`);
      this.cashoutFailedCallbacks.forEach((cb, i) => {
        console.log(`[ServerSim] Calling failure callback #${i}...`);
        cb(failedEvent);
      });
      console.log(`[ServerSim] All failure callbacks called!`);
    } else {
      const failedEvent: CashoutFailedEvent = {
        playerId: id,
        error: errorMessage,
        shouldResetPlayer: false
      };
      console.log(`[ServerSim] Player already removed, emitting FAILED event (shouldResetPlayer=false)...`);
      this.cashoutFailedCallbacks.forEach((cb, i) => {
        console.log(`[ServerSim] Calling failure callback #${i}...`);
        cb(failedEvent);
      });
    }
    console.log(`[ServerSim] ========== handleCashoutFailure END ==========`);
  }

  // Register callback for cashout success events
  public onCashoutSuccess(cb: CashoutCallback) {
    this.cashoutCallbacks.push(cb);
    return () => {
      this.cashoutCallbacks = this.cashoutCallbacks.filter(c => c !== cb);
    };
  }

  // DEBUG LOG: Register callback for cashout failed events
  public onCashoutFailed(cb: CashoutFailedCallback) {
    this.cashoutFailedCallbacks.push(cb);
    return () => {
      this.cashoutFailedCallbacks = this.cashoutFailedCallbacks.filter(c => c !== cb);
    };
  }

  private update() {
    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    // Use a copy of players to avoid modification during iteration
    const playerIds = Object.keys(this.state.players);
    
    playerIds.forEach(playerId => {
      const p = this.state.players[playerId];
      if (!p) return; // Player may have been removed during iteration
      
      // Check CURRENT position against boundaries FIRST (in case client moved past)
      const BOUNDARY_MARGIN = 5;
      if (p.pos.x <= BOUNDARY_MARGIN || p.pos.x >= ARENA_SIZE - BOUNDARY_MARGIN || 
          p.pos.y <= BOUNDARY_MARGIN || p.pos.y >= ARENA_SIZE - BOUNDARY_MARGIN) {
        this.handleDeath(p, 'BOUNDARY', 'The Arena', undefined);
        return;
      }
      
      const currentSpeed = p.isBoosting ? BOOST_SPEED : BASE_SPEED;
      const newX = p.pos.x + Math.cos(p.angle) * currentSpeed * dt;
      const newY = p.pos.y + Math.sin(p.angle) * currentSpeed * dt;

      // Check NEW position against boundaries
      if (newX <= BOUNDARY_MARGIN || newX >= ARENA_SIZE - BOUNDARY_MARGIN || 
          newY <= BOUNDARY_MARGIN || newY >= ARENA_SIZE - BOUNDARY_MARGIN) {
        this.handleDeath(p, 'BOUNDARY', 'The Arena', undefined);
        return;
      }
      
      // Update position (player is safe)
      p.pos.x = newX;
      p.pos.y = newY;

      // Update segments
      p.segments[0] = { x: p.pos.x, y: p.pos.y };
      for (let i = 1; i < p.segments.length; i++) {
        const seg = p.segments[i];
        const prev = p.segments[i-1];
        const dist = Math.hypot(prev.x - seg.x, prev.y - seg.y);
        if (dist > SEGMENT_DISTANCE) {
          const angle = Math.atan2(prev.y - seg.y, prev.x - seg.x);
          seg.x = prev.x - Math.cos(angle) * SEGMENT_DISTANCE;
          seg.y = prev.y - Math.sin(angle) * SEGMENT_DISTANCE;
        }
      }

      // Handle boost penalty
      if (p.isBoosting && p.length > 5) {
        p.score = Math.max(0, p.score - 0.1 * dt * 60);
      }

      // Collision detection with food - smooth magnet eating effect
      Object.values(this.state.food).forEach(f => {
        const dist = Math.hypot(p.pos.x - f.x, p.pos.y - f.y);
        
        // Strong magnet effect - food gets pulled towards sperm head
        if (dist < 120 && dist >= 15) {
          const angle = Math.atan2(p.pos.y - f.y, p.pos.x - f.x);
          // Stronger pull when closer (inverse distance weighting)
          const pullStrength = Math.max(400, 1200 - dist * 8);
          f.x += Math.cos(angle) * pullStrength * dt;
          f.y += Math.sin(angle) * pullStrength * dt;
        }

        // Eat food when very close to head
        if (dist < 20) {
          p.score += f.value;
          p.length += 0.25 * f.value;
          delete this.state.food[f.id];
          
          setTimeout(() => this.spawnFood(), 4000);

          if (p.segments.length < Math.floor(p.length)) {
            const lastSeg = p.segments[p.segments.length-1];
            p.segments.push({ ...lastSeg });
          }
        }
      });

      // Collision detection with other players
      Object.values(this.state.players).forEach(other => {
        if (p.id === other.id) return;
        for (let i = 3; i < other.segments.length; i++) {
          if (Math.hypot(p.pos.x - other.segments[i].x, p.pos.y - other.segments[i].y) < 18) {
            this.handleDeath(p, 'PLAYER', other.name, other.id);
          }
        }
      });
    });

    this.callbacks.forEach(cb => cb({ ...this.state }));
  }

  private handleDeath(player: PlayerData, reason: DeathReason, killedByName: string, killerId?: string) {
    const stolenAmount = player.solValue;
    const timeAlive = this.getTimeAlive(player.id);

    const event: DeathEvent = {
      id: player.id,
      score: player.score,
      length: player.length,
      reason,
      killedBy: killedByName,
      solLost: stolenAmount,
      timeAlive
    };

    if (killerId && this.state.players[killerId]) {
      this.state.players[killerId].solValue += stolenAmount;
      this.killCallbacks.forEach(cb => cb({
        killerId,
        victimName: player.name,
        stolenAmount,
        pos: { x: player.pos.x, y: player.pos.y }
      }));
    }

    // Convert dead player into food
    player.segments.forEach((seg, idx) => {
      if (idx % 2 === 0) {
        const foodId = `corpse_${Math.random()}`;
        this.state.food[foodId] = {
          id: foodId,
          x: seg.x,
          y: seg.y,
          value: 2,
          color: player.color
        };
      }
    });

    delete this.state.players[player.id];
    this.cashoutStates.delete(player.id);
    this.playerJoinTime.delete(player.id);

    this.deathCallbacks.forEach(cb => cb(event));
  }

  public getTimeAlive(id: string): number {
    const joinTime = this.playerJoinTime.get(id);
    return joinTime ? Math.floor((Date.now() - joinTime) / 1000) : 0;
  }

  public getPlayerData(id: string): PlayerData | undefined {
    return this.state.players[id];
  }

  public onUpdate(cb: (state: GameState) => void) {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter(c => c !== cb);
    };
  }

  public onPlayerDeath(cb: DeathCallback) {
    this.deathCallbacks.push(cb);
    return () => {
      this.deathCallbacks = this.deathCallbacks.filter(c => c !== cb);
    };
  }

  public onKill(cb: KillCallback) {
    this.killCallbacks.push(cb);
    return () => {
      this.killCallbacks = this.killCallbacks.filter(c => c !== cb);
    };
  }

  public leave(id: string): void {
    // Clean up player state
    delete this.state.players[id];
    this.cashoutStates.delete(id);
    this.playerJoinTime.delete(id);
  }

  public getCashoutProgress(id: string): number {
    const state = this.cashoutStates.get(id);
    if (!state || !state.active) return 0;
    
    const elapsed = Date.now() - state.startTime;
    return Math.min(1, elapsed / 3000); // 3000ms = 3 seconds
  }

  public getState(): GameState {
    return { ...this.state };
  }
}

export const server = new ServerSim();
