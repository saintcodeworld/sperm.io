
import Phaser from 'phaser';
import GameScene from './GameScene';

export const getGameConfig = (containerId: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: containerId,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [GameScene],
  backgroundColor: '#050505'
});
