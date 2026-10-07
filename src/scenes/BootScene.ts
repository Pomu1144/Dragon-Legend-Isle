import Phaser from 'phaser';
import { queueAll, makeRuntimeTextures, MONSTER_ART } from '../assets';
import { FONT_LABEL } from '../ui/widgets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Stage 1: just the loading-bar art.
    this.load.image('ui_bar_empty', 'assets/ui/bar_empty.png');
    this.load.image('ui_bar_orange', 'assets/ui/bar_orange.png');
    this.load.image('ui_soul', 'assets/ui/soul.png');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const frame = this.add.nineslice(W / 2, H / 2 + 40, 'ui_bar_empty', undefined, 520, 49, 28, 28);
    const fillMax = 520 - 50;
    const fill = this.add.rectangle(W / 2 - fillMax / 2, H / 2 + 40, 2, 20, 0xff8a1e).setOrigin(0, 0.5);
    const soul = this.add.image(W / 2, H / 2 - 50, 'ui_soul').setScale(0.5);
    this.tweens.add({ targets: soul, scale: 0.56, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
    const txt = this.add
      .text(W / 2, H / 2 + 100, 'Gathering the isle…', { fontFamily: FONT_LABEL, fontSize: '24px', color: '#fff4dc', stroke: '#1a0b02', strokeThickness: 6 })
      .setOrigin(0.5);
    frame.setDepth(1);
    fill.setDepth(2);

    queueAll(this.load);
    this.load.on('progress', (p: number) => {
      fill.width = Math.max(2, fillMax * p);
    });
    this.load.once('complete', () => {
      makeRuntimeTextures(this);
      // Keep the small original DIB sprites crisp when scaled up.
      for (const k of MONSTER_ART) this.textures.get('mon_' + k).setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.makeAnims();
      txt.setText('Ready');
      const params = new URLSearchParams(location.search);
      if (params.get('battle')) {
        this.scene.start('Battle', { monster: params.get('battle'), room: params.get('room') ?? 'forest', debug: true });
      } else if (params.get('room')) {
        this.scene.start('World', { room: params.get('room'), spawn: params.get('spawn') ?? undefined, debug: true });
      } else if (params.get('scene')) {
        this.scene.start(params.get('scene')!, { debug: true });
      } else {
        this.scene.start('Title');
      }
    });
    this.load.start();
  }

  private makeAnims() {
    const rows: [string, number][] = [['down', 0], ['left', 1], ['right', 2], ['up', 3]];
    for (const [dir, r] of rows) {
      this.anims.create({ key: `hero_walk_${dir}`, frames: this.anims.generateFrameNumbers('hero_walk', { frames: [r * 4, r * 4 + 1, r * 4 + 2, r * 4 + 3] }), frameRate: 8, repeat: -1 });
    }
    this.anims.create({ key: 'guildmaster_idle', frames: this.anims.generateFrameNumbers('guildmaster_idle', { frames: [0, 1] }), frameRate: 1.3, repeat: -1 });
    this.anims.create({ key: 'wren_idle', frames: this.anims.generateFrameNumbers('wren_idle', { frames: [0, 1] }), frameRate: 1.6, repeat: -1 });
  }
}
