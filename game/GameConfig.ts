
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
    batchSize: 4096, // Increased batch size
    clearBeforeRender: false, // Skip clear for performance
    desynchronized: true, // Reduce latency
    premultipliedAlpha: false // Better performance
  },
  // Optimize physics
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
      fps: 144,
      tileBias: 0 // Reduce physics overhead
    }
  },
  // Uncapped FPS with vsync disabled for maximum performance
  fps: {
    target: 144,
    forceSetTimeOut: false,
    deltaHistory: 120
  },
  scene: [GameScene],
  backgroundColor: '#050505'
});
