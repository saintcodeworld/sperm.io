
import Phaser from 'phaser';
import { ServerSim, DeathEvent, KillEvent } from '../services/ServerSim';
import { GameState, ARENA_SIZE } from '../types';
import { Sperm } from './Sperm';

export default class GameScene extends Phaser.Scene {
  public declare add: Phaser.GameObjects.GameObjectFactory;
  public declare cameras: Phaser.Cameras.Scene2D.CameraManager;
  public declare physics: Phaser.Physics.Arcade.ArcadePhysics;
  public declare events: Phaser.Events.EventEmitter;
  public declare input: Phaser.Input.InputPlugin;
  public declare tweens: Phaser.Tweens.TweenManager;
  public declare time: Phaser.Time.Clock;

  private players: Map<string, Sperm> = new Map();
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

    if (!this.server) return;
    this.signalCleanups.push(this.server.onUpdate((state) => this.handleStateUpdate(state)));
    if (!this.server) return;
    this.signalCleanups.push(this.server.onPlayerDeath((event) => { if (event.id === this.myId) this.triggerDeathSequence(event); }));
    if (!this.server) return;
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
      // Removed the CASHOUT_AUTHORITY check to prevent duplicate cashout events
    }));

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
      if (!this.server) return;
      this.server.input(this.myId, angle, this.isBoosting, this.isCashingOut);

      // Get progress from the server's authoritative timer
      if (!this.server) return;
      const progress = this.server.getCashoutProgress(this.myId);
      if (progress > 0) {
        this.events.emit('cashout-progress', progress);
      } else {
        this.events.emit('cashout-progress', 0);
      }
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
