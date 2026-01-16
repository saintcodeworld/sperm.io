
import Phaser from 'phaser';
import { PlayerData } from '../types';

export class Sperm {
  private scene: Phaser.Scene;
  private head: Phaser.GameObjects.Ellipse;
  private tailGraphics: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private id: string;
  private color: number;

  constructor(scene: Phaser.Scene, data: PlayerData) {
    this.scene = scene;
    this.id = data.id;
    this.color = data.color;

    // Head - Realistic sperm head (Thicker and larger)
    this.head = scene.add.ellipse(data.pos.x, data.pos.y, 30, 22, this.color);
    this.head.setStrokeStyle(2, 0x000000, 1);
    
    // Tail
    this.tailGraphics = scene.add.graphics();
    
    // Name
    this.nameText = scene.add.text(data.pos.x, data.pos.y - 25, data.name, {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    // Depth sorting
    this.head.setDepth(10);
    this.tailGraphics.setDepth(5);
    this.nameText.setDepth(15);
  }

  public update(data: PlayerData) {
    this.head.setPosition(data.pos.x, data.pos.y);
    this.head.setRotation(data.angle);
    this.nameText.setPosition(data.pos.x, data.pos.y - 30);
    
    // Growth logic: Head stays same size for player. Bots scale with SOL value.
    const scaleFactor = data.id.startsWith('bot_') 
      ? Math.max(1, 0.8 + data.solValue * 2) 
      : 1;
    this.head.setScale(scaleFactor);

    // Visual feedback for high-value targets
    if (data.id.startsWith('bot_') && data.solValue > 0.1) {
      this.head.setStrokeStyle(4, 0xffffff, 0.8);
    } else {
      this.head.setStrokeStyle(2, 0xffffff, 0.5);
    }

    // Draw Biological Tail with optimized rendering
    this.tailGraphics.clear();
    
    if (data.segments.length > 0) {
      const baseWidth = 14 * scaleFactor; // Thicker tail
      const maxSegments = 10; // Limit number of tail segments for performance
      
      // Calculate how many segments to skip based on total length
      const skipFactor = data.segments.length > maxSegments ? Math.floor(data.segments.length / maxSegments) : 1;
      
      this.tailGraphics.beginPath();
      this.tailGraphics.moveTo(data.pos.x, data.pos.y);
      
      // Only render a subset of segments - using distance-based level of detail
      for (let i = 0; i < data.segments.length; i += skipFactor) {
        const seg = data.segments[i];
        // Tapering: Get thinner towards the end
        const progress = i / data.segments.length;
        const thickness = Math.max(2, baseWidth * (1 - progress * 0.8));
        const alpha = 0.8 * (1 - progress * 0.6);
        
        // For better performance, make fewer style changes
        if (i % (skipFactor * 2) === 0 || i === 0) {
          this.tailGraphics.lineStyle(thickness, this.color, alpha);
        }
        
        this.tailGraphics.lineTo(seg.x, seg.y);
      }
      
      // More efficient: stroke only once at the end
      this.tailGraphics.strokePath();
    }
  }

  public destroy() {
    this.head.destroy();
    this.tailGraphics.destroy();
    this.nameText.destroy();
  }

  public getHead() {
    return this.head;
  }
}
