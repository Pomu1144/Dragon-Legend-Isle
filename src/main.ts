import Phaser from 'phaser';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { IntroScene } from './scenes/IntroScene';
import { WorldScene } from './scenes/WorldScene';
import { BattleScene } from './scenes/BattleScene';
import { MenuScene } from './scenes/MenuScene';
import { EndingScene } from './scenes/EndingScene';
import { GameOverScene } from './scenes/GameOverScene';
import { HatchlingScene } from './scenes/HatchlingScene';
import { ReaderScene } from './scenes/ReaderScene';

async function start() {
  // Text objects rasterize immediately, so the webfonts must be ready first.
  const faces = ['700 32px Cinzel', '900 32px Cinzel', '600 32px "Cormorant Garamond"', '700 32px "Cormorant Garamond"', 'italic 600 32px "Cormorant Garamond"'];
  try {
    await Promise.all(faces.map((f) => document.fonts.load(f)));
  } catch {
    /* fall back to system fonts */
  }

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: 1280,
    height: 720,
    backgroundColor: '#05070d',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false, roundPixels: false },
    fps: { target: 60, smoothStep: false },
    scene: [BootScene, TitleScene, IntroScene, WorldScene, BattleScene, MenuScene, EndingScene, GameOverScene, HatchlingScene, ReaderScene],
  });
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

start();
