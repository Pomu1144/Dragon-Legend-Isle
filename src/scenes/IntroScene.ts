import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { STORY } from '../data/story';
import { Controls } from '../ui/input';
import { fireflies } from '../ui/fx';
import { body, label, panel, COLORS } from '../ui/widgets';

const PANS: [number, number][] = [[0, -40], [-60, 0], [50, 20], [0, 30], [-40, -30], [40, 10]];
const PAGES = STORY.intro_pages.map((p, i) => ({
  bg: p.bg,
  text: p.text,
  tint: p.tint ? parseInt(p.tint.replace('#', ''), 16) : undefined,
  pan: PANS[i % PANS.length],
}));

export class IntroScene extends Phaser.Scene {
  private controls!: Controls;
  private page = 0;
  private img!: Phaser.GameObjects.Image;
  private text!: Phaser.GameObjects.Text;
  private full = '';
  private shown = 0;
  private acc = 0;
  private leaving = false;

  constructor() {
    super('Intro');
  }

  create() {
    const W = this.scale.width;
    this.controls = new Controls(this);
    this.page = 0;
    this.leaving = false;
    Sound.playMusic('title');
    const win = { x: 190, y: 54, w: 900, h: 420 };
    this.img = this.add.image(W / 2, win.y + win.h / 2, PAGES[0].bg);
    const maskG = this.make.graphics({}, false).fillRect(win.x, win.y, win.w, win.h);
    this.img.setMask(maskG.createGeometryMask());
    panel(this, win.x - 22, win.y - 20, win.w + 44, win.h + 40, 'blue').setDepth(0);
    this.img.setDepth(1);
    this.add.image(W / 2, win.y + win.h / 2, 'vignette').setDisplaySize(win.w, win.h).setDepth(2).setAlpha(0.8);
    fireflies(this, win.x, win.y, win.w, win.h, 16, 2.5);
    this.text = body(this, 190, 520, '', 30, COLORS.cream, 900).setDepth(3);
    label(this, W - 30, this.scale.height - 26, 'X  skip', 18, '#9bb0d0', 4).setOrigin(1, 0.5);
    this.showPage();
    this.cameras.main.fadeIn(900);
  }

  private showPage() {
    const p = PAGES[this.page];
    this.img.setTexture(p.bg);
    const s = Math.max(940 / this.img.width, 460 / this.img.height) * 1.08;
    this.img.setScale(s).setAlpha(0).clearTint();
    if (p.tint) this.img.setTint(p.tint);
    this.img.setPosition(640, 264);
    this.tweens.add({ targets: this.img, alpha: 1, duration: 700 });
    this.tweens.add({ targets: this.img, x: 640 + p.pan[0], y: 264 + p.pan[1], scale: s * 1.04, duration: 9000, ease: 'Sine.easeInOut' });
    this.full = p.text;
    this.shown = 0;
    this.acc = 0;
    this.text.setText('');
  }

  update(_t: number, dt: number) {
    if (this.leaving) return;
    const c = this.controls;
    if (c.pressed('cancel')) return this.finish();
    if (this.shown < this.full.length) {
      this.acc += dt;
      while (this.acc > 38 && this.shown < this.full.length) {
        this.acc -= 38;
        this.shown++;
        if (this.shown % 3 === 0) Sound.blip(0.8);
      }
      this.text.setText(this.full.slice(0, this.shown));
      if (c.pressed('confirm')) {
        this.shown = this.full.length;
        this.text.setText(this.full);
      }
      return;
    }
    if (c.pressed('confirm')) {
      this.page++;
      if (this.page >= PAGES.length) return this.finish();
      this.showPage();
    }
  }

  private finish() {
    this.leaving = true;
    Sound.stopMusic(1.2);
    this.cameras.main.fadeOut(1200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('World', { room: 'plaza', spawn: 'start', fresh: true }));
  }
}
