import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { Controls } from '../ui/input';
import { body, label, panel, title, COLORS } from '../ui/widgets';

export interface ReaderPage {
  heading: string;
  text: string;
  image?: string; // texture key shown above the text (e.g. the world map)
}

/** A book-style overlay for key items: the Tamer's Manual, the Translation Guide and the Map. */
export class ReaderScene extends Phaser.Scene {
  private controls!: Controls;
  private pages: ReaderPage[] = [];
  private bookTitle = '';
  private page = 0;
  private content!: Phaser.GameObjects.Container;
  private resumeKey = 'Menu';
  private closing = false;

  constructor() {
    super('Reader');
  }

  init(data: { title: string; pages: ReaderPage[]; resume?: string }) {
    this.bookTitle = data.title;
    this.pages = data.pages;
    this.resumeKey = data.resume ?? 'Menu';
    this.page = 0;
    this.closing = false;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.controls = new Controls(this);
    this.add.rectangle(0, 0, W, H, 0x02040c, 0.8).setOrigin(0);
    panel(this, 90, 40, W - 180, H - 80, 'page');
    title(this, W / 2, 92, this.bookTitle, 34, '#3a1f08').setOrigin(0.5).setStroke('#f6e3b8', 3).setShadow(0, 2, '#000', 2);
    this.add.rectangle(W / 2, 128, W - 360, 2, 0x5a3a18, 0.5);
    this.content = this.add.container(0, 0);
    label(this, W - 130, H - 72, '←  →  turn page     X  close', 16, COLORS.ink, 0).setOrigin(1, 0.5).setStroke('#f6e3b8', 2);
    this.show();
    this.cameras.main.fadeIn(160);
  }

  private show() {
    const W = this.scale.width;
    this.content.removeAll(true);
    const p = this.pages[this.page];
    const ink = (x: number, y: number, t: string, size: number, wrap: number) =>
      body(this, x, y, t, size, COLORS.ink, wrap).setStroke('#fff4dc', 0).setShadow(0, 0, '#000', 0);
    let y = 150;
    this.content.add(title(this, 150, y, p.heading, 26, '#4a2a0c').setStroke('#f6e3b8', 2).setShadow(0, 1, '#000', 1));
    y += 52;
    if (p.image && this.textures.exists(p.image)) {
      const img = this.add.image(W / 2, y, p.image).setOrigin(0.5, 0);
      img.setScale(Math.min((W - 340) / img.width, (p.image.startsWith('mon_') ? 220 : 300) / img.height));
      img.setTint(0xd8ccb4);
      this.content.add(img);
      y += img.displayHeight + 16;
    }
    this.content.add(ink(150, y, p.text, 22, W - 300));
    this.content.add(label(this, W / 2, this.scale.height - 72, `${this.page + 1} / ${this.pages.length}`, 16, COLORS.ink, 0).setOrigin(0.5).setStroke('#f6e3b8', 2));
  }

  update() {
    if (this.closing) return;
    const c = this.controls;
    const l = c.pressed('left');
    const r = c.pressed('right');
    if ((l || r) && this.pages.length > 1) {
      this.page = (this.page + (l ? this.pages.length - 1 : 1)) % this.pages.length;
      Sound.move();
      this.show();
    }
    const z = c.pressed('confirm');
    const x = c.pressed('cancel') || c.pressed('menu');
    if (z && this.page < this.pages.length - 1) {
      this.page++;
      Sound.move();
      this.show();
      return;
    }
    if (z || x) {
      this.closing = true;
      Sound.cancel();
      this.scene.stop();
      this.scene.resume(this.resumeKey);
    }
  }
}
