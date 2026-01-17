
import Phaser from 'phaser';
import { PlayerData, SEGMENT_DISTANCE } from '../types';

// Segment distance for local tracking
const LOCAL_SEGMENT_DISTANCE = SEGMENT_DISTANCE || 8;
const INITIAL_SEGMENT_COUNT = 30;

export class Sperm {
  private scene: Phaser.Scene;
  private head: Phaser.GameObjects.Ellipse;
  private tailGraphics: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private id: string;
  private color: number;
  
  // Local segment tracking for client-controlled movement
  private localSegments: { x: number; y: number }[] = [];
  private isLocalPlayer: boolean = false;
  
  public getColor(): number {
    return this.color;
  }

  constructor(scene: Phaser.Scene, data: PlayerData) {
    this.scene = scene;
    this.id = data.id;
    this.color = data.color;

    // Head - Realistic sperm head (oval shape)
    this.head = scene.add.ellipse(data.pos.x, data.pos.y, 28, 20, this.color);
    this.head.setStrokeStyle(2, 0xffffff, 0.6);
    
    // Tail graphics
    this.tailGraphics = scene.add.graphics();
    
    // Name label
    this.nameText = scene.add.text(data.pos.x, data.pos.y - 28, data.name, {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    // Initialize local segments from server data or create fresh
    if (data.segments && data.segments.length > 0) {
      this.localSegments = data.segments.map(s => ({ x: s.x, y: s.y }));
    } else {
      // Create initial segments trailing behind the head
      const angle = data.angle || 0;
      for (let i = 0; i < INITIAL_SEGMENT_COUNT; i++) {
        this.localSegments.push({
          x: data.pos.x - Math.cos(angle) * i * LOCAL_SEGMENT_DISTANCE,
          y: data.pos.y - Math.sin(angle) * i * LOCAL_SEGMENT_DISTANCE
        });
      }
    }

    // Depth sorting - tail behind head
    this.tailGraphics.setDepth(5);
    this.head.setDepth(10);
    this.nameText.setDepth(15);
    
    // Draw initial tail
    this.drawTail();
  }

  // Mark this sperm as the local player (for client-side segment tracking)
  public setAsLocalPlayer(): void {
    this.isLocalPlayer = true;
  }

  // Draw the tail/trail based on segments
  private drawTail(): void {
    this.tailGraphics.clear();
    
    if (this.localSegments.length < 2) return;
    
    const baseWidth = 12;
    const segmentCount = this.localSegments.length;
    
    // Draw tail as connected line segments with tapering
    for (let i = 1; i < segmentCount; i++) {
      const seg = this.localSegments[i];
      const prevSeg = this.localSegments[i - 1];
      
      // Calculate tapering - thinner towards the end
      const progress = i / segmentCount;
      const thickness = Math.max(2, baseWidth * (1 - progress * 0.85));
      const alpha = 0.9 * (1 - progress * 0.7);
      
      this.tailGraphics.lineStyle(thickness, this.color, alpha);
      this.tailGraphics.beginPath();
      this.tailGraphics.moveTo(prevSeg.x, prevSeg.y);
      this.tailGraphics.lineTo(seg.x, seg.y);
      this.tailGraphics.strokePath();
    }
  }

  // Update segments to follow the head position (for local player)
  public updateLocalSegments(): void {
    if (this.localSegments.length === 0) return;
    
    // First segment follows the head
    this.localSegments[0] = { x: this.head.x, y: this.head.y };
    
    // Each subsequent segment follows the one before it
    for (let i = 1; i < this.localSegments.length; i++) {
      const seg = this.localSegments[i];
      const prev = this.localSegments[i - 1];
      const dist = Math.hypot(prev.x - seg.x, prev.y - seg.y);
      
      if (dist > LOCAL_SEGMENT_DISTANCE) {
        const angle = Math.atan2(prev.y - seg.y, prev.x - seg.x);
        seg.x = prev.x - Math.cos(angle) * LOCAL_SEGMENT_DISTANCE;
        seg.y = prev.y - Math.sin(angle) * LOCAL_SEGMENT_DISTANCE;
      }
    }
    
    // Update name position above head
    this.nameText.setPosition(this.head.x, this.head.y - 28);
    
    // Redraw the tail
    this.drawTail();
  }

  // Get segments for hitbox collision detection
  public getSegments(): { x: number; y: number }[] {
    return this.localSegments;
  }

  public update(data: PlayerData) {
    this.head.setPosition(data.pos.x, data.pos.y);
    this.head.setRotation(data.angle);
    this.nameText.setPosition(data.pos.x, data.pos.y - 28);
    
    // Update segments from server data (for other players)
    if (data.segments && data.segments.length > 0) {
      this.localSegments = data.segments.map(s => ({ x: s.x, y: s.y }));
    } else {
      // If no segments provided, update locally
      this.updateLocalSegments();
    }
    
    // Visual feedback for high-value targets
    if (data.solValue > 0.15) {
      this.head.setStrokeStyle(3, 0xffffff, 0.9);
    } else {
      this.head.setStrokeStyle(2, 0xffffff, 0.6);
    }
    
    // Draw the tail
    this.drawTail();
  }

  public destroy() {
    this.head.destroy();
    this.tailGraphics.destroy();
    this.nameText.destroy();
  }

  public getHead() {
    return this.head;
  }

  // Update non-position properties and draw tail (for local player)
  public updateNonPosition(data: PlayerData) {
    // Update name with SOL value
    if (data.solValue !== undefined) {
      this.nameText.setText(`${data.name} (${data.solValue.toFixed(2)} SOL)`);
    }
    
    // Visual feedback for value
    if (data.solValue > 0.15) {
      this.head.setStrokeStyle(3, 0xffffff, 0.9);
    } else {
      this.head.setStrokeStyle(2, 0xffffff, 0.6);
    }
    
    // Sync segments from server if available (for hitbox accuracy)
    if (data.segments && data.segments.length > 0) {
      // Only sync length, not positions (local player controls position)
      while (this.localSegments.length < data.segments.length) {
        const lastSeg = this.localSegments[this.localSegments.length - 1];
        this.localSegments.push({ ...lastSeg });
      }
    }
    
    // Update segments to follow head and redraw tail
    this.updateLocalSegments();
  }
}
