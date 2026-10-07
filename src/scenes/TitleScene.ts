import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { State } from '../state';
import { Controls } from '../ui/input';
import { fireflies, lightPool } from '../ui/fx';
import { body, cursor, label, strip, COLORS } from '../ui/widgets';

export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private options: { text: Phaser.GameObjects.Text; btn: Phaser.GameObjects.NineSlice; enabled: boolean; action: () => void }[] = [];
  private sel = 0;
  private cursor!: Phaser.GameObjects.Container;
  private ready = false;
  private prompt!: Phaser.GameObjects.Text;
  private menu!: Phaser.GameObjects.Container;

  constructor() {
    super('Title');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.controls = new Controls(this);
    this.options = [];
    this.sel = 0;
    this.ready = false;

    const bg = this.add.image(W / 2, H / 2, 'bg_plaza');
    const cover = Math.max(W / bg.width, H / bg.height) * 1.12;
    bg.setScale(cover);
    this.tweens.add({ targets: bg, scale: cover * 1.06, x: W / 2 - 30, duration: 24000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.rectangle(0, 0, W, H, 0x050a1c, 0.34).setOrigin(0);
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setAlpha(0.95);
    lightPool(this, W * 0.5, H * 0.32, 420, 0x6fb8ff, false, 5).setAlpha(0.25);
    fireflies(this, 0, 0, W, H, 40, 6);

    const logo = this.add.image(W / 2, 220, 'logo').setDepth(10);
    logo.setScale(Math.min(760 / logo.width, 330 / logo.height));
    logo.setAlpha(0).setY(200);
    this.tweens.add({ targets: logo, alpha: 1, y: 215, duration: 1600, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: logo, y: 225, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1600 });
    const shine = this.add.image(W / 2, 215, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(11).setScale(1.4, 0.35).setAlpha(0.0).setTint(0x9fd8ff);
    this.tweens.add({ targets: shine, alpha: { from: 0, to: 0.35 }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.prompt = label(this, W / 2, 470, 'Press  Z  or  ENTER', 30, COLORS.cream, 7).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: this.prompt, alpha: 0.35, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });

    this.menu = this.add.container(0, 0).setDepth(20).setVisible(false);
    const items: [string, boolean, () => void][] = [
      ['New Journey', true, () => this.newGame()],
      ['Continue', State.hasSave(), () => this.continueGame()],
    ];
    items.forEach(([name, enabled, action], i) => {
      const y = 450 + i * 82;
      const btn = strip(this, W / 2 - 170, y, 'ui_btn_hex', 340, 40).setAlpha(enabled ? 1 : 0.45);
      const text = label(this, W / 2, y - 2, name, 30, enabled ? COLORS.cream : '#8a8a8a', 7).setOrigin(0.5);
      this.menu.add([btn, text]);
      this.options.push({ text, btn, enabled, action });
    });
    this.cursor = cursor(this, 'ui_soul', 0.24, 6, 380);
    this.menu.add(this.cursor);

    body(this, W / 2, H - 34, 'Arrows / WASD move  ·  Z confirm  ·  X cancel  ·  C menu', 18, '#cfe3ff').setOrigin(0.5).setAlpha(0.8).setDepth(20);
    label(this, 18, H - 30, 'v0.1', 16, '#9bb0d0', 4).setOrigin(0, 0.5).setDepth(20);
    this.cameras.main.fadeIn(900, 0, 0, 0);
    this.input.keyboard!.once('keydown', () => Sound.ensure());
  }

  private openMenu() {
    this.ready = true;
    Sound.ensure();
    Sound.playMusic('title');
    Sound.confirm();
    this.prompt.setVisible(false);
    this.menu.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.menu, alpha: 1, duration: 300 });
    this.sel = this.options[1].enabled ? 1 : 0;
    this.refresh();
  }

  private refresh() {
    this.options.forEach((o, i) => {
      o.text.setColor(!o.enabled ? '#8a8a8a' : i === this.sel ? COLORS.yellow : COLORS.cream);
      o.btn.setTint(i === this.sel ? 0xffffff : 0xb0c0d0);
      o.btn.setScale(i === this.sel ? 1.04 : 1);
    });
    const o = this.options[this.sel];
    this.cursor.setPosition(this.scale.width / 2 - 200, o.text.y + 2);
  }

  update() {
    const c = this.controls;
    if (!this.ready) {
      if (c.pressed('confirm')) this.openMenu();
      return;
    }
    if (c.pressed('up') || c.pressed('down')) {
      this.sel = (this.sel + 1) % this.options.length;
      Sound.move();
      this.refresh();
    }
    if (c.pressed('confirm')) {
      const o = this.options[this.sel];
      if (!o.enabled) {
        Sound.cancel();
        return;
      }
      Sound.confirm();
      this.ready = false;
      o.action();
    }
  }

  private newGame() {
    State.reset();
    Sound.stopMusic(1);
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Intro'));
  }

  private continueGame() {
    State.load();
    Sound.stopMusic(0.8);
    this.cameras.main.fadeOut(700, 0, 0, 0);
    const s = State.get();
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('World', { room: s.room, at: [s.x, s.y] }));
  }
}
