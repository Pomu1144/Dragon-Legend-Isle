// Pieces of the DIB team-battle screen: the Time Unit queue chips, thin HP bars, the
// narration strip, popup menus, the round disc and sprite fitting.
import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { Controls } from '../ui/input';
import { Touch } from '../ui/touch';
import { body, label, panel, COLORS, FONT_BODY } from '../ui/widgets';

/** The bright teal framed box of the DIB battle panel (painted 9-slice, lightly muted). */
export function tealPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  const ns = scene.add.nineslice(x, y, 'ui_panel_blue', undefined, w, h, 24, 24, 22, 22).setOrigin(0, 0);
  return ns.setTint(0xb2c4ca);
}

/**
 * Scale a creature sprite to roughly `targetH`. Original DIB sprites are small pixel art:
 * they keep crisp integer scales; painted art scales smoothly. Both stay inside maxW x maxH.
 */
export function fitSprite(img: Phaser.GameObjects.Image, targetH: number, maxW: number, maxH: number, painted: boolean) {
  const w = img.width;
  const h = img.height;
  if (painted) return img.setScale(Math.min(targetH / h, maxW / w, maxH / h));
  img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  let sc = Math.max(1, Math.round(targetH / h));
  while (sc > 1 && (w * sc > maxW || h * sc > maxH)) sc--;
  if (w * sc > maxW || h * sc > maxH) return img.setScale(Math.min(maxW / w, maxH / h));
  return img.setScale(sc);
}

/** A slim HP bar: dark trough with a bronze rim and the painted red fill. */
export class ThinBar extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Image;
  private ghost: Phaser.GameObjects.Rectangle;
  private inner: number;
  value = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h = 8) {
    super(scene, x, y);
    this.inner = w - 4;
    const bg = scene.add.rectangle(0, 0, w, h + 4, 0x150a05, 0.92).setOrigin(0, 0.5).setStrokeStyle(1.5, 0x8c6a3c, 1);
    this.ghost = scene.add.rectangle(2, 0, this.inner, h, 0xfff1c8, 0.85).setOrigin(0, 0.5);
    this.fill = scene.add.image(2, 0, 'ui_bar_red', 'fill').setOrigin(0, 0.5).setDisplaySize(this.inner, h);
    const shine = scene.add.rectangle(2, -h * 0.25, this.inner, Math.max(1, h * 0.22), 0xffffff, 0.2).setOrigin(0, 0.5);
    this.add([bg, this.ghost, this.fill, shine]);
    scene.add.existing(this);
  }

  set(frac: number, animate = true) {
    frac = Phaser.Math.Clamp(frac, 0, 1);
    const old = this.value;
    this.value = frac;
    const w = Math.max(0.001, this.inner * frac);
    this.scene.tweens.killTweensOf(this.ghost);
    this.scene.tweens.killTweensOf(this.fill);
    if (!animate) {
      this.fill.displayWidth = w;
      this.ghost.width = w;
      return;
    }
    this.scene.tweens.add({ targets: this.fill, displayWidth: w, duration: 260, ease: 'Cubic.easeOut' });
    if (frac < old) this.scene.tweens.add({ targets: this.ghost, width: w, duration: 650, delay: 280, ease: 'Cubic.easeOut' });
    else this.ghost.width = w;
  }
}

/** One portrait in the left-hand Time Unit queue: face, thin HP bar and the TU count. */
export class QueueChip extends Phaser.GameObjects.Container {
  static readonly SIZE = 50;
  readonly bar: ThinBar;
  private num: Phaser.GameObjects.Text;
  private frame: Phaser.GameObjects.Rectangle;
  private halo: Phaser.GameObjects.Image;
  private side: 'ally' | 'foe';
  shown = 0; // the TU number as drawn (eases toward the real value)
  targetY = 0;
  targetAlpha = 1;

  constructor(scene: Phaser.Scene, art: string, side: 'ally' | 'foe') {
    super(scene, 0, 0);
    this.side = side;
    const S = QueueChip.SIZE;
    this.halo = scene.add.image(S / 2 + 3, S / 2 + 3, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setScale(0.5).setAlpha(0);
    const back = scene.add.rectangle(0, 0, S + 6, S + 6, side === 'ally' ? 0x0c1a26 : 0x1e0c0a, 0.92).setOrigin(0);
    const inner = scene.add.rectangle(3, 3, S, S, side === 'ally' ? 0x24506a : 0x5a2a20, 0.55).setOrigin(0);
    this.add([this.halo, back, inner]);
    if (scene.textures.exists(art)) {
      // A square from the top of the sprite: the head, like DIB's queue faces.
      const img = scene.add.image(0, 0, art).setOrigin(0, 0);
      const w = img.width;
      const h = img.height;
      const s = Math.min(w, h);
      const cx = (w - s) / 2;
      const cy = h > w ? Math.min(h - s, h * 0.04) : 0;
      const sc = S / s;
      img.setCrop(cx, cy, s, s).setScale(sc).setPosition(3 - cx * sc, 3 - cy * sc);
      this.add(img);
    }
    this.frame = scene.add.rectangle(0, 0, S + 6, S + 6).setOrigin(0).setStrokeStyle(2, side === 'ally' ? 0x6fb6e8 : 0xc0654c, 1);
    this.num = label(scene, S + 12, S / 2 + 2, '0', 30, side === 'ally' ? '#8fcaff' : '#ff8f74', 4).setOrigin(0, 0.5);
    this.bar = new ThinBar(scene, 0, S + 13, 112, 7);
    this.add([this.frame, this.num, this.bar]);
    scene.add.existing(this);
  }

  /** Called every frame: ease the TU number and the slot position. */
  tick(tu: number, dt: number) {
    const k = 1 - Math.pow(0.0001, dt / 1000);
    this.shown = Math.abs(this.shown - tu) < 0.6 ? tu : this.shown + (tu - this.shown) * Math.min(1, k * 1.6);
    const n = Math.max(0, Math.round(this.shown));
    const txt = String(n);
    if (this.num.text !== txt) this.num.setText(txt);
    const acting = n === 0;
    this.num.setColor(acting ? COLORS.yellow : this.side === 'ally' ? '#8fcaff' : '#ff8f74');
    this.halo.setAlpha(acting ? 0.55 : 0);
    this.frame.setStrokeStyle(2, acting ? 0xf2dca0 : this.side === 'ally' ? 0x6fb6e8 : 0xc0654c, 1);
    this.y += (this.targetY - this.y) * Math.min(1, k * 1.2);
    this.alpha += (this.targetAlpha - this.alpha) * Math.min(1, k * 1.4);
  }
}

/**
 * The thin narration strip ("* Gold Hatchling used Tail! 6 damage."). Its top edge stays just
 * under the foes' feet: a long line widens the strip and tightens the type, and a second line
 * grows down over the panel rim, never up over the creatures.
 */
export class Caption {
  readonly c: Phaser.GameObjects.Container;
  private t: Phaser.GameObjects.Text;
  private g: Phaser.GameObjects.Graphics;
  private w: number;
  private homeX: number;
  private homeY: number;
  private lineH: number;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, depth: number) {
    this.w = w;
    this.homeX = x;
    this.homeY = y;
    this.g = scene.add.graphics();
    this.t = body(scene, 0, 0, 'Ag', Touch.active ? 25 : 22, COLORS.cream, w - 120).setOrigin(0.5).setAlign('center');
    this.lineH = this.t.height;
    this.t.setText('');
    this.c = scene.add.container(x, y, [this.g, this.t]).setDepth(depth).setAlpha(0);
    this.draw(44, w);
  }

  private draw(h: number, w: number) {
    const g = this.g;
    g.clear();
    g.fillGradientStyle(0x02060c, 0x02060c, 0x02060c, 0x02060c, 0, 0.8, 0, 0.8);
    g.fillRect(-w / 2, -h / 2, w / 2, h);
    g.fillGradientStyle(0x02060c, 0x02060c, 0x02060c, 0x02060c, 0.8, 0, 0.8, 0);
    g.fillRect(0, -h / 2, w / 2, h);
    for (const yy of [-h / 2, h / 2 - 1.5]) {
      g.fillGradientStyle(0xc9a96a, 0xc9a96a, 0xc9a96a, 0xc9a96a, 0, 0.8, 0, 0.8);
      g.fillRect(-w / 2, yy, w / 2, 1.5);
      g.fillGradientStyle(0xc9a96a, 0xc9a96a, 0xc9a96a, 0xc9a96a, 0.8, 0, 0.8, 0);
      g.fillRect(0, yy, w / 2, 1.5);
    }
  }

  /** Show a line; `x` shifts the strip aside, otherwise it sits at home. */
  show(text: string, x?: number) {
    const scene = this.c.scene;
    const big = Touch.active;
    this.c.x = x ?? this.homeX;
    let w = this.w;
    this.t.setFontSize(Math.round((big ? 25 : 22) * 1.12)).setWordWrapWidth(w - 120, true).setText(text);
    if (this.t.height > this.lineH * 1.5) {
      w = Math.min(1120, 2 * Math.min(this.c.x - 150, scene.scale.width - this.c.x));
      this.t.setFontSize(Math.round((big ? 22 : 18) * 1.12)).setWordWrapWidth(w - 100, true).setText(text);
    }
    const h = Math.max(44, this.t.height + 4);
    this.draw(h, w);
    this.c.y = this.homeY - 22 + h / 2;
    scene.tweens.killTweensOf(this.c);
    if (this.c.alpha < 1) scene.tweens.add({ targets: this.c, alpha: 1, duration: 140 });
  }

  hide() {
    const scene = this.c.scene;
    scene.tweens.killTweensOf(this.c);
    scene.tweens.add({ targets: this.c, alpha: 0, duration: 220 });
  }
}

export interface MenuItem {
  text: string;
  right?: string; // e.g. "TU 70"
  sub?: string; // one-line effect
  color?: string;
  icon?: string;
  iconBack?: string; // a medallion drawn behind a bare glyph icon
  iconFlip?: boolean;
  disabled?: boolean;
  run: () => void;
}

/** Where a docked menu sits: one of the bottom panel's framed boxes. */
export interface DockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A command list docked in the bottom panel (abilities, tamer commands, items), laid out in
 * columns so the field above stays clear, as in DIB. Arrows + Z/X, or tap a row.
 */
export class Menu {
  readonly c: Phaser.GameObjects.Container;
  sel = 0;
  private rows: { hl: Phaser.GameObjects.Rectangle; t: Phaser.GameObjects.Text; x: number; y: number; h: number }[] = [];
  private cursor: Phaser.GameObjects.Image;
  private items: MenuItem[];
  private onBack: (() => void) | null;
  private onHover?: (i: number) => void;
  private perCol: number;
  private cols: number;
  private closed = false;

  constructor(scene: Phaser.Scene, r: DockRect, title: string, titleColor: string, items: MenuItem[], onBack: (() => void) | null, depth = 70, onHover?: (i: number) => void) {
    this.items = items;
    this.onBack = onBack;
    this.onHover = onHover;
    // on phones the canvas is shown at about half size: rows and their lettering grow to stay readable
    const big = Touch.active;
    const n = items.length;
    this.cols = n <= 1 ? 1 : n <= 6 ? 2 : 3;
    this.perCol = Math.ceil(n / this.cols);
    const padX = 18;
    const padTop = 12;
    const padBot = 12;
    const minRow = big ? 60 : 50;
    // the title line gives way when the rows need the room
    const showTitle = r.h - padTop - padBot - 34 >= this.perCol * minRow;
    const top = padTop + (showTitle ? 34 : 0);
    const rh = Math.min(big ? 72 : 64, (r.h - top - padBot) / this.perCol);
    const cw = (r.w - padX * 2) / this.cols;
    this.c = scene.add.container(r.x, r.y).setDepth(depth);
    const bg = panel(scene, 0, 0, r.w, r.h, 'blue');
    const shade = scene.add.rectangle(12, 10, r.w - 24, r.h - 20, 0x040a12, 0.55).setOrigin(0);
    // swallow taps that land on the panel between rows
    bg.setInteractive();
    this.c.add([bg, shade]);
    if (showTitle) {
      this.c.add(label(scene, padX + 8, padTop - 2, title, 19, titleColor, 4));
      this.c.add(scene.add.rectangle(padX + 4, top - 5, r.w - padX * 2 - 8, 1.5, 0xc9a96a, 0.5).setOrigin(0));
    }
    items.forEach((it, i) => {
      const x = padX + Math.floor(i / this.perCol) * cw;
      const y = top + (i % this.perCol) * rh;
      const hl = scene.add.rectangle(x + 2, y + 2, cw - 6, rh - 4, 0xf2dca0, 0.13).setOrigin(0).setVisible(false);
      const tx = x + (it.icon ? 70 : 38);
      const col = it.disabled ? '#7f8a92' : it.color ?? COLORS.cream;
      const nameY = it.sub ? y + (big ? 3 : 2) : y + rh / 2 - (big ? 17 : 15);
      const t = label(scene, tx, nameY, it.text, big ? 26 : 22, col, 4);
      this.c.add([hl, t]);
      if (it.icon && scene.textures.exists(it.icon)) {
        const ix = x + 44;
        const iy = y + rh / 2;
        const size = Math.min(40, rh - 10);
        if (it.iconBack && scene.textures.exists(it.iconBack)) {
          const back = scene.add.image(ix, iy, it.iconBack);
          back.setScale(size / Math.max(back.width, back.height));
          if (it.disabled) back.setTint(0x777777);
          this.c.add(back);
        }
        const ic = scene.add.image(ix, iy, it.icon);
        ic.setScale((it.iconBack ? size * 0.46 : size) / Math.max(ic.width, ic.height));
        ic.setFlipX(!!it.iconFlip);
        if (it.disabled) ic.setTint(0x777777);
        this.c.add(ic);
      }
      let rightW = 0;
      if (it.right) {
        const rt = label(scene, x + cw - 16, nameY + 2, it.right, big ? 20 : 17, it.disabled ? '#7f8a92' : COLORS.gold, 4).setOrigin(1, 0);
        rightW = rt.width + 6;
        this.c.add(rt);
      }
      const room = x + cw - 14 - tx;
      if (t.width > room - rightW) t.setScale((room - rightW) / t.width);
      if (it.sub) {
        const sub = body(scene, tx, y + (big ? 33 : 28), it.sub, big ? 17 : 14, it.disabled ? '#6f7880' : '#b9cdd6');
        if (sub.width > room) sub.setScale(room / sub.width); // one line, always
        this.c.add(sub);
      }
      const zone = scene.add.zone(x + 2, y + 2, cw - 6, rh - 4).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(i, false));
      zone.on('pointerdown', () => {
        this.select(i, false);
        this.confirm();
      });
      this.c.add(zone);
      this.rows.push({ hl, t, x, y, h: rh });
    });
    this.cursor = scene.add.image(0, 0, 'ui_cursor_diamond').setScale(0.4).setAngle(90);
    this.c.add(this.cursor);
    scene.tweens.add({ targets: this.cursor, scaleX: 0.34, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
    this.c.setAlpha(0).setY(r.y + 8);
    scene.tweens.add({ targets: this.c, alpha: 1, y: r.y, duration: 150, ease: 'Cubic.easeOut' });
    this.select(0, false);
  }

  select(i: number, sound = true) {
    if (this.closed || !this.rows.length) return;
    if (i !== this.sel && sound) Sound.move();
    this.sel = i;
    this.rows.forEach((r, k) => {
      r.hl.setVisible(k === i);
      const it = this.items[k];
      r.t.setColor(it.disabled ? '#7f8a92' : k === i ? COLORS.yellow : it.color ?? COLORS.cream);
    });
    const r = this.rows[i];
    this.cursor.setPosition(r.x + 16, r.y + r.h / 2);
    this.onHover?.(i);
  }

  confirm() {
    if (this.closed) return;
    const it = this.items[this.sel];
    if (it.disabled) Sound.cancel();
    else Sound.confirm();
    it.run();
  }

  update(c: Controls) {
    if (this.closed || !this.rows.length) return;
    const n = this.rows.length;
    const per = this.perCol;
    const left = c.pressed('left');
    const right = c.pressed('right');
    if (c.pressed('up')) this.select((this.sel + n - 1) % n);
    else if (c.pressed('down')) this.select((this.sel + 1) % n);
    else if ((left || right) && this.cols > 1) {
      // across the columns, keeping the row (or the last row of a shorter column)
      const to = (Math.floor(this.sel / per) + (left ? this.cols - 1 : 1)) % this.cols;
      this.select(Math.min(n - 1, to * per + (this.sel % per)));
    } else if (c.pressed('confirm')) this.confirm();
    else if (c.pressed('cancel') && this.onBack) {
      Sound.cancel();
      this.onBack();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const c = this.c;
    c.each((o: Phaser.GameObjects.GameObject) => o.disableInteractive());
    c.scene.tweens.add({ targets: c, alpha: 0, duration: 110, onComplete: () => c.destroy() });
  }
}

/** The small dark round counter disc (top right). */
export class RoundDisc {
  readonly c: Phaser.GameObjects.Container;
  private t: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, depth: number) {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.45).fillCircle(1, 3, 27);
    g.fillStyle(0x15181d, 1).fillCircle(0, 0, 25);
    g.fillStyle(0x2c3139, 1).fillCircle(0, -3, 20);
    g.fillStyle(0x0b0d10, 1).fillCircle(0, 2, 18);
    g.lineStyle(2.5, 0xa9b2bb, 1).strokeCircle(0, 0, 25);
    g.lineStyle(1, 0xe8eef2, 0.5).beginPath().arc(0, 0, 22, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(320)).strokePath();
    this.t = label(scene, 0, 1, '0', 30, '#f4f6f8', 4).setOrigin(0.5);
    this.c = scene.add.container(x, y, [g, this.t]).setDepth(depth);
  }

  set(n: number) {
    this.t.setText(String(n));
    this.c.scene.tweens.add({ targets: this.t, scale: { from: 1.35, to: 1 }, duration: 240, ease: 'Back.easeOut' });
  }
}

/** A brief parchment speech caption over a creature. */
export function speech(scene: Phaser.Scene, x: number, y: number, text: string, depth: number, ms = 1900) {
  const t = scene.add.text(0, 0, text, { fontFamily: FONT_BODY, fontStyle: '700', fontSize: '22px', color: COLORS.ink, align: 'center', lineSpacing: 2, wordWrap: { width: 300, useAdvancedWrap: true } }).setOrigin(0.5);
  const w = t.width + 40;
  const h = t.height + 26;
  const p = panel(scene, -w / 2, -h / 2, w, h, 'parchment');
  const tail = scene.add.triangle(0, h / 2 + 6, -10, -8, 10, -8, 0, 8, 0xd8c4a0).setOrigin(0.5);
  const c = scene.add.container(Phaser.Math.Clamp(x, 200 + w / 2, scene.scale.width - 20 - w / 2), Math.max(h / 2 + 8, y), [tail, p, t]).setDepth(depth);
  c.setScale(0.7).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 260, onComplete: () => c.destroy() });
  Sound.blip(0.7);
  return c;
}
