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

  async join(id, name, entryFee = 0.1) {
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
        solAddress: ''
      };
      
      console.log(`[Server] Player ${id} joined successfully`);
      return true;
    } catch (error) {
      console.error(`[Server] Error during join process:`, error);
      return false;
    }
  }

  input(id, angle, boost, cashout) {
    const player = this.state.players[id];
    if (!player) return;

    // Handle cashout request
    if (cashout && !this.cashoutStates.has(id)) {
      console.log(`[Server] Player ${id} starting cashout sequence`);
      this.cashoutStates.set(id, {
        startTime: Date.now(),
        active: true
      });
      
      // Start 3-second countdown
      setTimeout(() => {
        const state = this.cashoutStates.get(id);
        if (state?.active && this.state.players[id]) {
          // Instant exit: Remove player from game immediately
          const playerData = { ...this.state.players[id] };
          delete this.state.players[id];
          this.cashoutStates.delete(id);
          console.log(`[Server] Player ${id} cashed out successfully`);
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
      p.pos.x += Math.cos(p.angle) * currentSpeed * dt;
      p.pos.y += Math.sin(p.angle) * currentSpeed * dt;

      if (p.pos.x < 0 || p.pos.x > ARENA_SIZE || p.pos.y < 0 || p.pos.y > ARENA_SIZE) {
        this.handleDeath(p, 'BOUNDARY', 'Death Zone');
        return;
      }

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

  handleDeath(player, reason, killedByName, killerId) {
    // Immediately remove player from active players to stop position broadcasts
    const playerId = player.id;
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

    // Handle kill rewards before removal
    if (killerId && this.state.players[killerId]) {
      this.state.players[killerId].solValue += stolenAmount;
      this.killCallbacks.forEach(cb => cb({
        killerId,
        victimName: player.name,
        stolenAmount,
        pos: { x: player.pos.x, y: player.pos.y }
      }));
    }

    // Immediately remove player from state
    delete this.state.players[playerId];
    this.cashoutStates.delete(playerId);
    this.playerJoinTime.delete(playerId);
    
    // Notify all clients of death
    this.deathCallbacks.forEach(cb => cb(event));

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
