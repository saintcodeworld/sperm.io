import { ARENA_SIZE, INITIAL_LENGTH, SEGMENT_DISTANCE, BASE_SPEED, BOOST_SPEED } from './types.js';

export class ServerSim {
  constructor() {
    this.state = {
      players: {},
      food: {}
    };
    this.callbacks = [];
    this.deathCallbacks = [];
    this.killCallbacks = [];
    this.cashoutCallbacks = []; // DEBUG LOG: Cashout success callbacks
    this.cashoutFailedCallbacks = []; // DEBUG LOG: Cashout failed callbacks
    this.lastUpdate = Date.now();
    this.playerJoinTime = new Map();
    this.cashoutStates = new Map();

    this.spawnInitialFood();
    setInterval(() => this.update(), 1000 / 60);
  }

  spawnInitialFood() {
    for (let i = 0; i < 600; i++) this.spawnFood();
  }

  spawnFood() {
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

  getRandomColor() {
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

  async join(id, name, entryFee = 0.1, solAddress) {
    try {
      // For simplified backend deployment, we'll skip blockchain transactions
      console.log(`[Server] Player ${id} joining with ${entryFee} SOL`);

      // Track join time
      this.playerJoinTime.set(id, Date.now());

      const color = this.getRandomColor();

      // DEBUG LOG: Spawn players in a tighter central zone so they can see each other
      // Original: margin=500 meant spawn range [500, 4500] = 4000 unit spread
      // New: spawn in center 1000x1000 area around map center (2500, 2500)
      const centerX = ARENA_SIZE / 2; // 2500
      const centerY = ARENA_SIZE / 2; // 2500
      const spawnRadius = 500; // Players spawn within 500 units of center

      const startPos = {
        x: centerX + (Math.random() - 0.5) * spawnRadius * 2, // Range: [2000, 3000]
        y: centerY + (Math.random() - 0.5) * spawnRadius * 2  // Range: [2000, 3000]
      };

      console.log(`[SPAWN] Player ${id} spawning at (${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}) - center zone`);

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
        solAddress: solAddress || ''
      };

      console.log(`[Server] Player ${id} joined successfully`);
      return true;
    } catch (error) {
      console.error(`[Server] Error during join process:`, error);
      return false;
    }
  }

  input(id, angle, boost, cashout) {
    console.log(`[Server] input() called: id=${id}, angle=${angle.toFixed(2)}, boost=${boost}, cashout=${cashout}`);
    const player = this.state.players[id];
    if (!player) {
      console.log(`[Server] Player ${id} not found in state!`);
      return;
    }

    // Handle cashout request
    if (cashout && !this.cashoutStates.has(id)) {
      console.log(`[Server] ========== CASHOUT INITIATED (MULTIPLAYER) ==========`);
      console.log(`[Server] Player ${id} starting cashout sequence`);
      console.log(`[Server] Player solValue: ${player.solValue}`);
      console.log(`[Server] Player solAddress: '${player.solAddress}'`);
      this.cashoutStates.set(id, {
        startTime: Date.now(),
        active: true
      });

      // Start 3-second countdown
      // DEBUG LOG: Don't remove player until cashout completes to prevent frozen state
      setTimeout(() => {
        const state = this.cashoutStates.get(id);
        if (state?.active && this.state.players[id]) {
          // DEBUG LOG: Process cashout and only remove player after success
          const playerData = { ...this.state.players[id] };
          console.log(`[Server] Player ${id} cashout timer complete, processing...`);
          console.log(`[Server] Player data: solValue=${playerData.solValue}, solAddress='${playerData.solAddress}'`);

          // CHECK: Is solAddress valid?
          if (!playerData.solAddress || playerData.solAddress.length < 30) {
            console.error(`[Server] ERROR: Invalid or missing solAddress for player ${id}!`);
            console.error(`[Server] solAddress: '${playerData.solAddress}', length: ${playerData.solAddress?.length || 0}`);
            // Don't process cashout, just clear the state
            this.cashoutStates.delete(id);
            return;
          }

          // Calculate what player receives (pot minus 1% platform fee)
          const platformFee = playerData.solValue * 0.01;
          const playerReceives = playerData.solValue - platformFee;

          // For backend simulation, cashout is instant (no blockchain)
          // Remove player from state
          delete this.state.players[id];
          this.cashoutStates.delete(id);
          this.playerJoinTime.delete(id);

          // Emit cashout success callback
          const cashoutEvent = {
            playerId: id,
            totalPot: playerData.solValue,
            playerReceives: playerReceives,
            signature: 'backend_sim_confirmed'
          };
          console.log(`[Server] Emitting cashout success event for player ${id}`);
          this.cashoutCallbacks.forEach(cb => cb(cashoutEvent));
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

  update() {
    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    Object.values(this.state.players).forEach(p => {
      const currentSpeed = p.isBoosting ? BOOST_SPEED : BASE_SPEED;
      const newX = p.pos.x + Math.cos(p.angle) * currentSpeed * dt;
      const newY = p.pos.y + Math.sin(p.angle) * currentSpeed * dt;

      // Clamp position to arena bounds instead of killing player
      p.pos.x = Math.max(0, Math.min(ARENA_SIZE, newX));
      p.pos.y = Math.max(0, Math.min(ARENA_SIZE, newY));

      // Update segments
      p.segments[0] = { x: p.pos.x, y: p.pos.y };
      for (let i = 1; i < p.segments.length; i++) {
        const seg = p.segments[i];
        const prev = p.segments[i - 1];
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

      // Collision detection with food
      Object.values(this.state.food).forEach(f => {
        const dist = Math.hypot(p.pos.x - f.x, p.pos.y - f.y);

        // Magnet Effect
        if (dist < 100 && dist >= 30) {
          const angle = Math.atan2(p.pos.y - f.y, p.pos.x - f.x);
          const magnetSpeed = 600;
          f.x += Math.cos(angle) * magnetSpeed * dt;
          f.y += Math.sin(angle) * magnetSpeed * dt;
        }

        if (dist < 30) {
          p.score += f.value;
          p.length += 0.25 * f.value;
          delete this.state.food[f.id];

          setTimeout(() => this.spawnFood(), 4000);

          if (p.segments.length < Math.floor(p.length)) {
            const lastSeg = p.segments[p.segments.length - 1];
            p.segments.push({ ...lastSeg });
          }
        }
      });

      // Collision detection with other players
      Object.values(this.state.players).forEach(other => {
        if (p.id === other.id) return;
        // Skip if player is already dead (removed from state)
        if (!this.state.players[p.id]) return;

        for (let i = 0; i < other.segments.length; i++) {
          if (Math.hypot(p.pos.x - other.segments[i].x, p.pos.y - other.segments[i].y) < 18) {
            this.handleDeath(p, 'PLAYER', other.name, other.id);
            return; // CRITICAL: Stop processing collisions after death
          }
        }
      });
    });

    this.callbacks.forEach(cb => cb({ ...this.state }));
  }

  handleDeath(player, reason, killedByName, killerId) {
    const playerId = player.id;

    // CRITICAL: Check if player is already dead to prevent duplicate processing
    if (!this.state.players[playerId]) {
      console.log(`[ServerSim] Player ${playerId} already dead, skipping duplicate death`);
      return;
    }

    const stolenAmount = player.solValue;
    const timeAlive = this.getTimeAlive(playerId);

    // Create death event before removing player
    const event = {
      id: playerId,
      score: player.score,
      length: player.length,
      reason,
      killedBy: killedByName,
      solLost: stolenAmount,
      timeAlive
    };

    // Handle kill rewards before removal (only once!)
    if (killerId && this.state.players[killerId]) {
      this.state.players[killerId].solValue += stolenAmount;
      console.log(`[ServerSim] Player ${killerId} killed ${player.name}, gained ${stolenAmount} SOL`);
      this.killCallbacks.forEach(cb => cb({
        killerId,
        victimName: player.name,
        stolenAmount,
        pos: { x: player.pos.x, y: player.pos.y }
      }));
    }

    // Convert dead player into food BEFORE removing from state
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

    // Remove player from state (only once!)
    delete this.state.players[playerId];
    this.cashoutStates.delete(playerId);
    this.playerJoinTime.delete(playerId);

    // Notify all clients of death (only once!)
    this.deathCallbacks.forEach(cb => cb(event));
  }

  getTimeAlive(id) {
    const joinTime = this.playerJoinTime.get(id);
    return joinTime ? Math.floor((Date.now() - joinTime) / 1000) : 0;
  }

  getPlayerData(id) {
    return this.state.players[id];
  }

  onUpdate(cb) {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter(c => c !== cb);
    };
  }

  onPlayerDeath(cb) {
    this.deathCallbacks.push(cb);
    return () => {
      this.deathCallbacks = this.deathCallbacks.filter(c => c !== cb);
    };
  }

  onKill(cb) {
    this.killCallbacks.push(cb);
    return () => {
      this.killCallbacks = this.killCallbacks.filter(c => c !== cb);
    };
  }

  leave(id) {
    // Clean up player state
    delete this.state.players[id];
    this.cashoutStates.delete(id);
    this.playerJoinTime.delete(id);
  }

  // DEBUG LOG: Register callback for cashout success events
  onCashoutSuccess(cb) {
    this.cashoutCallbacks.push(cb);
    return () => {
      this.cashoutCallbacks = this.cashoutCallbacks.filter(c => c !== cb);
    };
  }

  // DEBUG LOG: Register callback for cashout failed events
  onCashoutFailed(cb) {
    this.cashoutFailedCallbacks.push(cb);
    return () => {
      this.cashoutFailedCallbacks = this.cashoutFailedCallbacks.filter(c => c !== cb);
    };
  }

  getCashoutProgress(id) {
    const state = this.cashoutStates.get(id);
    if (!state || !state.active) return 0;

    const elapsed = Date.now() - state.startTime;
    return Math.min(1, elapsed / 3000); // 3000ms = 3 seconds
  }

  get state() {
    return this._state;
  }

  set state(value) {
    this._state = value;
  }
}
