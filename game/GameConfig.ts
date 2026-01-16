
import Phaser from 'phaser';
import GameScene from './GameScene';

export const getGameConfig = (containerId: string): Phaser.Types.Core.GameConfig => ({
  // Force WebGL rendering with optimized settings
  type: Phaser.WEBGL,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: containerId,
  // Optimize rendering settings
  render: {
    pixelArt: false,
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
    batchSize: 2048 // Increase batch size for better performance
  },
  // Optimize physics
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
      fps: 60
    }
  },
  // Set fps limit
  fps: {
    target: 60,
    forceSetTimeOut: true
  },
  scene: [GameScene],
  backgroundColor: '#050505'
});
