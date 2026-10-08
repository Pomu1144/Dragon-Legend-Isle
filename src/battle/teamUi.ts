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

/** A square from the top of a creature sprite (the head, like DIB's queue faces), S wide, centred on (x, y). */
export function faceImage(scene: Phaser.Scene, art: string, S: number, x = 0, y = 0) {
  const img = scene.add.image(0, 0, art).setOrigin(0, 0);
  const w = img.width;
  const h = img.height;
  const s = Math.min(w, h);
  const cx = (w - s) / 2;
  const cy = h > w ? Math.min(h - s, h * 0.04) : 0;
  const sc = S / s;
  return img.setCrop(cx, cy, s, s).setScale(sc).setPosition(x - S / 2 - cx * sc, y - S / 2 - cy * sc);
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
    if (scene.textures.exists(art)) this.add(faceImage(scene, art, S, 3 + S / 2, 3 + S / 2));
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
 * grows down over the panel rim, never up over the creatures (while the cards are docked under
 * it, the strip's bottom edge holds instead and the second line grows up).
 */
export class Caption {
  readonly c: Phaser.GameObjects.Container;
  private t: Phaser.GameObjects.Text;
  private g: Phaser.GameObjects.Graphics;
  private w: number;
  private homeX: number;
  private homeY: number;
  private lineH: number;
  private up = false;

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

  /**
   * Move the strip's resting place (and width): it steps left while the tamer medallions are up.
   * `up`: a second line grows upward instead, as when the cards fill the box under the strip.
   */
  setHome(x: number, w: number, up = false) {
    this.homeX = x;
    this.w = w;
    this.up = up;
  }

  /** Show a line; `x` shifts the strip aside, otherwise it sits at home. */
  show(text: string, x?: number) {
    const scene = this.c.scene;
    const big = Touch.active;
    this.c.x = x ?? this.homeX;
    let w = this.w;
    this.t.setFontSize(Math.round((big ? 25 : 22) * 1.12)).setWordWrapWidth(w - 120, true).setText(text);
    if (this.t.height > this.lineH * 1.5) {
      // widen to fit, keeping clear of the TU queue at the left; never narrower than the strip's own home width
      w = Math.max(this.w, Math.min(1120, 2 * Math.min(this.c.x - 150, scene.scale.width - this.c.x)));
      this.t.setFontSize(Math.round((big ? 22 : 18) * 1.12)).setWordWrapWidth(w - 100, true).setText(text);
    }
    const h = Math.max(44, this.t.height + 4);
    this.draw(h, w);
    this.c.y = this.up ? this.homeY + 22 - h / 2 : this.homeY - 22 + h / 2;
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

// ---- status badges ------------------------------------------------------------------

/** The ring colour and glyph of each status badge. */
const BADGE: Record<string, { ring: number; glyph: string; color?: string }> = {
  sleep: { ring: 0x7fb2ff, glyph: 'Z', color: '#d6eaff' },
  confuse: { ring: 0xc58aff, glyph: '?', color: '#f0d2ff' },
  stun: { ring: 0xffcf4a, glyph: 'star' },
  poison: { ring: 0x7ad04a, glyph: 'drop' },
  slow: { ring: 0x6fa8d8, glyph: 'down' },
  haste: { ring: 0xffcf6a, glyph: 'up' },
  taunt: { ring: 0xff7a5e, glyph: '!', color: '#ffc4b4' },
  stealth: { ring: 0x9fd8ff, glyph: 'moon' },
};

/** A small round enamel badge for one status (sleep, poison...), `s` across, centred on 0,0. */
export function statusBadge(scene: Phaser.Scene, kind: string, s: number) {
  const b = BADGE[kind] ?? { ring: 0xc9a96a, glyph: '•', color: COLORS.cream };
  const r = s / 2;
  const k = s / 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.5).fillCircle(0, 1.5 * k, r + 1);
  g.fillStyle(0x0b1117, 0.96).fillCircle(0, 0, r);
  g.fillStyle(b.ring, 0.22).fillCircle(0, 0, r - 2 * k);
  g.lineStyle(2 * k, b.ring, 1).strokeCircle(0, 0, r - 1 * k);
  g.lineStyle(1, 0xffffff, 0.35).beginPath().arc(0, 0, r - 3.5 * k, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(320)).strokePath();
  const c = scene.add.container(0, 0, [g]);
  switch (b.glyph) {
    case 'star': {
      const st = scene.add.image(0, 0, 'ui_star');
      st.setScale((s * 0.66) / st.width);
      c.add(st);
      break;
    }
    case 'drop':
      g.fillStyle(0x9cff6a, 1).fillCircle(0, 2.6 * k, 5 * k).fillTriangle(-4.4 * k, 0.8 * k, 4.4 * k, 0.8 * k, 0, -8 * k);
      g.fillStyle(0xffffff, 0.7).fillCircle(-1.7 * k, 2.2 * k, 1.4 * k);
      break;
    case 'down':
    case 'up': {
      const d = b.glyph === 'up' ? -1 : 1;
      g.fillStyle(b.glyph === 'up' ? 0xffe08a : 0xa8d4ff, 1);
      for (const o of [-3.2, 2.8]) g.fillTriangle(-6 * k, (o - 2.6 * d) * k, 6 * k, (o - 2.6 * d) * k, 0, (o + 3 * d) * k);
      break;
    }
    case 'moon':
      g.fillStyle(0xe4f4ff, 1).fillCircle(0, 0, 6.5 * k);
      g.fillStyle(0x182630, 1).fillCircle(3 * k, -2.4 * k, 5.6 * k);
      break;
    default: {
      const t = scene.add.text(0, 0, b.glyph, { fontFamily: 'Cinzel, Georgia, serif', fontStyle: '900', fontSize: `${Math.round(s * 0.62)}px`, color: b.color ?? COLORS.cream, stroke: '#05080c', strokeThickness: 2 }).setOrigin(0.5, 0.52);
      c.add(t);
    }
  }
  return c;
}

/** A row of status badges (with their names when `textSize` is set), centred on its position. */
export class StatusRow extends Phaser.GameObjects.Container {
  private key = '';
  private size: number;
  private textSize: number;

  constructor(scene: Phaser.Scene, x: number, y: number, size: number, textSize = 0) {
    super(scene, x, y);
    this.size = size;
    this.textSize = textSize;
    scene.add.existing(this);
  }

  /** Show these statuses (`names` gives the words); an unchanged list costs nothing. */
  set(kinds: string[], names: Record<string, string>) {
    const key = kinds.join(',');
    if (key === this.key) return;
    this.key = key;
    this.removeAll(true);
    if (!kinds.length) return;
    const s = this.size;
    const gap = Math.round(s * 0.18);
    const badges = kinds.map((k) => statusBadge(this.scene, k, s));
    const txt = this.textSize ? label(this.scene, 0, 0, kinds.map((k) => names[k] ?? k).join(' · '), this.textSize, '#e3eed2', 3).setOrigin(0, 0.5) : undefined;
    // (a label carries 6px of padding at each end)
    const total = kinds.length * s + (kinds.length - 1) * gap + (txt ? txt.width - 6 : 0);
    let x = -total / 2;
    for (const b of badges) {
      b.setPosition(x + s / 2, 0);
      x += s + gap;
    }
    this.add(badges);
    if (txt) this.add(txt.setPosition(x - gap, 1));
  }

  clear() {
    this.set([], {});
  }
}

// ---- the ability cards --------------------------------------------------------------------

/** One painted ability card in the bottom box. */
export interface CardItem {
  name: string;
  tu: string; // "TU:100"
  art: string; // ui_card_flame / tail / outrage / unknown
  tint?: number; // a faint element wash over the card
  locked?: boolean; // not learned yet: "???"
  tipTitle: string;
  tipSub: string;
  tip: string; // the full effect, shown by the (i) button
  run: () => void;
}

interface CardSlot {
  root: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Image;
  frame: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  x: number;
  cy: number;
  ch: number;
}

// The info panel's leftmost edge: clear of the TU queue column (its chips and bars run x 18-130).
const TIP_LEFT = 140;

/**
 * The DIB ability row: up to four painted cards in the centre box (more turn the page), each with
 * its name, Time Units and a round (i) button that opens the full effect. Arrows move, up opens
 * the info, Z or a tap plays the card; stepping right past the last card hands over to `edge`.
 */
export class CardDeck {
  readonly c: Phaser.GameObjects.Container;
  sel = 0;
  private scene: Phaser.Scene;
  private r: DockRect;
  private items: CardItem[];
  private slots: CardSlot[] = [];
  private per = 4;
  private page = -1;
  private pages: number;
  private focused = true;
  private closed = false;
  private tip?: Phaser.GameObjects.Container;
  private tipFor = -1;
  private arrows: Phaser.GameObjects.Image[] = [];
  private hooks: { hover?: (i: number) => void; edge?: () => void; grab?: () => void; tip?: (open: boolean) => void };

  constructor(scene: Phaser.Scene, r: DockRect, items: CardItem[], depth: number, hooks: CardDeck['hooks'] = {}) {
    this.scene = scene;
    this.r = r;
    this.items = items;
    this.hooks = hooks;
    const big = Touch.active;
    this.pages = Math.max(1, Math.ceil(items.length / this.per));
    this.c = scene.add.container(r.x, r.y).setDepth(depth);
    const bg = panel(scene, 0, 0, r.w, r.h, 'blue').setInteractive();
    bg.setTint(0x7d8e98);
    const shade = scene.add.rectangle(12, 10, r.w - 24, r.h - 20, 0x061520, 0.42).setOrigin(0);
    this.c.add([bg, shade]);
    const side = this.pages > 1 ? 44 : 18;
    const slotW = (r.w - side * 2) / this.per;
    const cw = Math.min(slotW - 34, big ? 150 : 158);
    const ch = cw * (128 / 190); // the painted cards are 190 x 128
    const cy = (big ? 12 : 16) + ch / 2;
    const nameSize = big ? 25 : 20;
    const tuSize = big ? 22 : 17;
    const infoS = big ? 38 : 27;
    const slotX = (k: number) => side + slotW * (k + 0.5);
    // Four card sockets, as in DIB: an empty one stays a dim recess in the box.
    for (let k = this.pages > 1 ? this.per : items.length; k < this.per; k++) {
      const g = scene.add.graphics();
      g.fillStyle(0x02080e, 0.38).fillRoundedRect(slotX(k) - cw / 2, cy - ch / 2, cw, ch, 8);
      g.lineStyle(1.5, 0x8fb2c0, 0.16).strokeRoundedRect(slotX(k) - cw / 2, cy - ch / 2, cw, ch, 8);
      this.c.add(g);
    }
    items.forEach((it, i) => {
      const x = slotX(i % this.per);
      const tex = scene.textures.exists(it.art) ? it.art : 'ui_card_unknown';
      const img = scene.add.image(0, 0, tex).setDisplaySize(cw, ch);
      if (it.tint !== undefined) img.setTint(it.tint);
      if (it.locked) img.setTint(0xb4b0a6);
      const glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setDisplaySize(cw * 1.9, ch * 2.1).setAlpha(0);
      const drop = scene.add.rectangle(3, 5, cw - 4, ch - 4, 0x000000, 0.5);
      const frame = scene.add.graphics();
      frame.lineStyle(7, 0xffd77a, 0.28).strokeRoundedRect(-cw / 2 - 6, -ch / 2 - 6, cw + 12, ch + 12, 10);
      frame.lineStyle(2.5, 0xfff1c8, 1).strokeRoundedRect(-cw / 2 - 4, -ch / 2 - 4, cw + 8, ch + 8, 8);
      frame.setVisible(false);
      const art = scene.add.container(0, cy, [glow, drop, img, frame]);
      const name = label(scene, 0, cy + ch / 2 + (big ? 2 : 4), it.name, nameSize, it.locked ? '#9aa6ad' : COLORS.cream, 4).setOrigin(0.5, 0);
      if (name.width > slotW - 8) name.setScale((slotW - 8) / name.width);
      const rowY = name.y + name.height * name.scaleY - (big ? 4 : 3) + infoS / 2;
      const tu = label(scene, -cw / 2 + 2, rowY, it.tu, tuSize, it.locked ? '#8f9aa1' : '#f4ead2', 3).setOrigin(0, 0.5);
      const info = scene.add.image(cw / 2 - infoS / 2 + 2, rowY, 'ui_btn_info');
      info.setScale(infoS / Math.max(info.width, info.height));
      // the card itself: everything above the TU line
      const zone = scene.add.zone(0, 0, slotW - 6, rowY - infoS / 2 + 2).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
      // the (i) answers a generous patch around it (fingers are wide)
      const iz = Math.max(infoS * 1.5, big ? 64 : 34);
      const infoZone = scene.add.zone(info.x, rowY, iz, iz).setInteractive({ useHandCursor: true });
      const root = scene.add.container(x, 0, [zone, art, name, tu, info, infoZone]);
      // a tap fires 'pointerover' just after 'pointerdown': hover is for the mouse only, so the
      // tap's own answer (a refusal like "not learned yet") is not overwritten by the hover line
      zone.on('pointerover', (p: Phaser.Input.Pointer) => {
        if (this.closed || p.wasTouch) return;
        this.hooks.grab?.();
        this.select(i, false);
      });
      zone.on('pointerdown', () => {
        if (this.closed) return;
        this.hooks.grab?.();
        this.select(i, false);
        this.confirm();
      });
      infoZone.on('pointerdown', () => {
        if (this.closed) return;
        const was = this.tipFor;
        this.hooks.grab?.();
        this.select(i, false);
        Sound.blip(1.2);
        if (was === i) this.hideTip();
        else if (this.tipFor !== i) this.showTip(i);
      });
      this.c.add(root);
      this.slots.push({ root, art, glow, frame, name, x, cy, ch });
    });
    if (this.pages > 1) {
      for (const d of [-1, 1]) {
        const a = scene.add.image(d < 0 ? 22 : r.w - 22, r.h / 2 - 8, 'ui_cursor_arrow').setScale(big ? 0.5 : 0.4).setFlipX(d < 0);
        a.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          const to = Phaser.Math.Clamp(this.page + d, 0, this.pages - 1);
          if (to !== this.page) this.select(to * this.per);
        });
        this.arrows.push(a);
        this.c.add(a);
      }
    }
    this.c.setAlpha(0).setY(r.y + 8);
    scene.tweens.add({ targets: this.c, alpha: 1, y: r.y, duration: 150, ease: 'Cubic.easeOut' });
  }

  select(i: number, sound = true) {
    if (this.closed || !this.slots.length) return;
    i = Phaser.Math.Clamp(i, 0, this.slots.length - 1);
    if (i !== this.sel && sound) Sound.move();
    this.sel = i;
    const page = Math.floor(i / this.per);
    if (page !== this.page) {
      this.page = page;
      this.slots.forEach((s, k) => s.root.setVisible(Math.floor(k / this.per) === page));
      this.arrows.forEach((a, k) => a.setAlpha((k === 0 ? page > 0 : page < this.pages - 1) ? 1 : 0.25));
    }
    this.paint();
    if (this.tip) this.showTip(i);
    this.hooks.hover?.(i);
  }

  get tipOpen() {
    return !!this.tip;
  }

  /** Whether the cards hold the keyboard (the medallions may have it instead). */
  focus(on: boolean) {
    if (this.closed) return;
    this.focused = on;
    if (!on) this.hideTip();
    this.paint();
    if (on) this.hooks.hover?.(this.sel);
  }

  private paint() {
    this.slots.forEach((s, k) => {
      const on = k === this.sel && this.focused;
      s.frame.setVisible(on);
      s.glow.setAlpha(on ? 0.42 : 0);
      this.scene.tweens.killTweensOf(s.art);
      this.scene.tweens.add({ targets: s.art, scale: on ? 1.07 : 1, duration: 120, ease: 'Cubic.easeOut' });
      const it = this.items[k];
      s.name.setColor(it.locked ? '#9aa6ad' : on ? COLORS.yellow : COLORS.cream);
    });
  }

  toggleTip(i = this.sel) {
    Sound.blip(1.2);
    if (this.tip && this.tipFor === i) this.hideTip();
    else this.showTip(i);
  }

  hideTip() {
    const t = this.tip;
    if (!t) return;
    this.tip = undefined;
    this.tipFor = -1;
    this.scene.tweens.add({ targets: t, alpha: 0, duration: 100, onComplete: () => t.destroy() });
    if (!this.closed) this.hooks.tip?.(false);
  }

  /** The info panel: the card's whole effect, standing on the box above the card. */
  private showTip(i: number) {
    const scene = this.scene;
    if (this.tip) {
      this.tip.destroy();
      this.tip = undefined;
    }
    const it = this.items[i];
    const s = this.slots[i];
    const big = Touch.active;
    const w = big ? 600 : 470;
    const pad = 22;
    const head = label(scene, pad, 14, it.tipTitle, big ? 27 : 22, it.locked ? '#c4ccd2' : COLORS.yellow, 4);
    const sub = label(scene, pad, head.y + head.height - 6, it.tipSub, big ? 18 : 15, COLORS.gold, 3);
    const text = body(scene, pad, sub.y + sub.height + 2, it.tip, big ? 21 : 17, COLORS.cream, w - pad * 2);
    const h = text.y + text.height + 14;
    const W = scene.scale.width;
    const cx = this.r.x + s.x;
    const x = Phaser.Math.Clamp(cx - w / 2, TIP_LEFT, W - 10 - w);
    const y = this.r.y - 12 - h;
    const bg = panel(scene, 0, 0, w, h, 'blue');
    const shade = scene.add.rectangle(10, 9, w - 20, h - 18, 0x030910, 0.6).setOrigin(0);
    const nub = scene.add.triangle(cx - x, h + 4, -10, -8, 10, -8, 0, 8, 0xa98654).setOrigin(0.5);
    const t = scene.add.container(x, y, [nub, bg, shade, head, sub, text]).setDepth(this.c.depth + 5);
    bg.setInteractive().on('pointerdown', () => this.hideTip());
    t.setAlpha(0);
    scene.tweens.add({ targets: t, alpha: 1, duration: 120 });
    this.tip = t;
    this.tipFor = i;
    this.hooks.tip?.(true);
  }

  confirm() {
    if (this.closed) return;
    const it = this.items[this.sel];
    this.hideTip();
    if (it.locked) Sound.cancel();
    else Sound.confirm();
    it.run();
  }

  update(c: Controls) {
    if (this.closed || !this.slots.length) return;
    const n = this.slots.length;
    if (c.pressed('left')) this.select((this.sel + n - 1) % n);
    else if (c.pressed('right')) {
      if (this.sel < n - 1) this.select(this.sel + 1);
      else if (this.hooks.edge) {
        Sound.move();
        this.hooks.edge();
      } else this.select(0);
    } else if (c.pressed('up')) this.toggleTip();
    else if (c.pressed('down')) {
      if (this.tip) {
        Sound.blip(0.9);
        this.hideTip();
      }
    } else if (c.pressed('confirm')) this.confirm();
    else if (c.pressed('cancel') && this.tip) {
      Sound.cancel();
      this.hideTip();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.hideTip();
    const c = this.c;
    c.each((o: Phaser.GameObjects.GameObject) => o.disableInteractive());
    for (const s of this.slots) s.root.each((o: Phaser.GameObjects.GameObject) => o.disableInteractive());
    c.scene.tweens.add({ targets: c, alpha: 0, duration: 110, onComplete: () => c.destroy() });
  }
}

// ---- the tamer medallions -------------------------------------------------------------

/** One of Kael's round command medallions (Item, Capture...). */
export interface MedalItem {
  icon: string;
  framed?: boolean; // a bare glyph set on the round parchment slot
  iconScale?: number;
  angle?: number;
  flip?: boolean;
  label: string;
  disabled?: boolean;
  hot?: boolean; // pulses (a foe is ready to yield)
  run: () => void;
}

/**
 * The round command medallions standing on the panel rim at the right, as in DIB. Arrows move,
 * Z or a tap uses one; stepping off either end (or X) hands the keys back to the cards.
 */
export class MedalRow {
  readonly c: Phaser.GameObjects.Container;
  sel = 0;
  private scene: Phaser.Scene;
  private items: MedalItem[];
  private medals: { c: Phaser.GameObjects.Container; glow: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Graphics; tag?: Phaser.GameObjects.Container }[] = [];
  private tag: Phaser.GameObjects.Container;
  private tagText: Phaser.GameObjects.Text;
  private tagBg: Phaser.GameObjects.Graphics;
  private focused = false;
  private closed = false;
  private size: number;
  private hooks: { hover?: (i: number) => void; leave?: (to: 'first' | 'last' | 'keep') => void; grab?: () => void };

  constructor(scene: Phaser.Scene, right: number, y: number, size: number, items: MedalItem[], depth: number, hooks: MedalRow['hooks'] = {}) {
    this.scene = scene;
    this.items = items;
    this.size = size;
    this.hooks = hooks;
    const big = Touch.active;
    const step = size + (big ? 18 : 8);
    this.c = scene.add.container(0, y).setDepth(depth);
    items.forEach((it, i) => {
      const x = right - size / 2 - (items.length - 1 - i) * step;
      const sh = scene.add.graphics();
      sh.fillStyle(0x000000, 0.5).fillCircle(2, 4, size / 2);
      // the glow is wide enough to show past the opaque rim
      const glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(it.hot ? 0xfff07a : 0xffd77a).setDisplaySize(size * 2.6, size * 2.6).setAlpha(0);
      const parts: Phaser.GameObjects.GameObject[] = [glow, sh];
      const imgs: Phaser.GameObjects.Image[] = [];
      if (it.framed) {
        const back = scene.add.image(0, 0, 'ui_slot_round');
        back.setScale(size / Math.max(back.width, back.height));
        imgs.push(back);
        const ic = scene.add.image(0, 0, it.icon).setFlipX(!!it.flip).setAngle(it.angle ?? 0);
        ic.setScale((size * (it.iconScale ?? 0.5)) / Math.max(ic.width, ic.height));
        imgs.push(ic);
      } else {
        const ic = scene.add.image(0, 0, it.icon);
        ic.setScale(size / Math.max(ic.width, ic.height));
        imgs.push(ic);
      }
      if (it.disabled) imgs.forEach((m) => m.setTint(0x6c6c6c));
      parts.push(...imgs);
      // the chosen one wears the same gold frame as the chosen card
      const ring = scene.add.graphics();
      ring.lineStyle(7, 0xffd77a, 0.32).strokeCircle(0, 0, size / 2 + 5);
      ring.lineStyle(2.5, 0xfff1c8, 1).strokeCircle(0, 0, size / 2 + 3);
      ring.setVisible(false);
      parts.push(ring);
      const m = scene.add.container(x, 0, parts);
      const zone = scene.add.zone(0, 0, size + 8, size + 8).setInteractive({ useHandCursor: true });
      m.add(zone);
      // a tap fires 'pointerover' just after 'pointerdown': hover is for the mouse only, so the
      // tap's own answer (a refusal like "not learned yet") is not overwritten by the hover line
      zone.on('pointerover', (p: Phaser.Input.Pointer) => {
        if (this.closed || p.wasTouch) return;
        this.hooks.grab?.();
        this.select(i, false);
      });
      zone.on('pointerdown', () => {
        if (this.closed) return;
        this.hooks.grab?.();
        this.select(i, false);
        this.confirm();
      });
      if (it.hot) scene.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.5 }, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
      // phones have no hover: every medallion keeps a small name over it
      let tag: Phaser.GameObjects.Container | undefined;
      if (big) {
        const t = label(scene, 0, 0, it.label, 20, it.disabled ? '#8c949a' : COLORS.cream, 3).setOrigin(0.5);
        if (t.width > step + 8) t.setScale((step + 8) / t.width);
        tag = scene.add.container(x, -size / 2 - 15, [t]);
        this.c.add(tag);
      }
      this.c.add(m);
      this.medals.push({ c: m, glow, ring, tag });
    });
    this.tagBg = scene.add.graphics();
    this.tagText = label(scene, 0, 0, '', big ? 22 : 18, COLORS.yellow, 3).setOrigin(0.5);
    this.tag = scene.add.container(0, -size / 2 - (big ? 20 : 22), [this.tagBg, this.tagText]).setVisible(false);
    this.c.add(this.tag);
    this.c.setAlpha(0);
    scene.tweens.add({ targets: this.c, alpha: 1, duration: 180 });
    this.paint();
  }

  select(i: number, sound = true) {
    if (this.closed) return;
    if (i !== this.sel && sound) Sound.move();
    this.sel = i;
    this.paint();
    if (this.focused) this.hooks.hover?.(i);
  }

  focus(on: boolean) {
    if (this.closed) return;
    this.focused = on;
    this.paint();
    if (on) this.hooks.hover?.(this.sel);
  }

  private paint() {
    const big = Touch.active;
    this.medals.forEach((m, k) => {
      const on = this.focused && k === this.sel;
      // set outright: a short tween can stall half-way at a low frame rate and blur the cue
      m.c.setScale(on ? 1.12 : 1);
      // while the keys are on the medallions the others step back a little
      m.c.setAlpha(this.focused && !on ? 0.72 : 1);
      m.ring.setVisible(on);
      if (!this.items[k].hot) m.glow.setAlpha(on ? 0.4 : 0);
      m.tag?.setVisible(!on);
    });
    const on = this.focused && this.medals[this.sel];
    this.tag.setVisible(!!on);
    if (!on) return;
    const it = this.items[this.sel];
    this.tagText.setText(it.label).setColor(it.disabled ? '#9aa2a8' : COLORS.yellow);
    const w = this.tagText.width + 10;
    const h = this.tagText.height - 2;
    this.tagBg.clear();
    this.tagBg.fillStyle(0x02060c, 0.82).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    this.tagBg.lineStyle(1.5, 0xc9a96a, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const W = this.scene.scale.width;
    this.tag.x = Math.min(this.medals[this.sel].c.x, W - 6 - w / 2);
    this.tag.y = -this.size / 2 - (big ? 24 : 22);
  }

  confirm() {
    if (this.closed) return;
    const it = this.items[this.sel];
    if (it.disabled) Sound.cancel();
    else Sound.confirm();
    it.run();
  }

  update(c: Controls) {
    if (this.closed) return;
    const n = this.medals.length;
    if (c.pressed('left')) {
      if (this.sel > 0) this.select(this.sel - 1);
      else {
        Sound.move();
        this.hooks.leave?.('last');
      }
    } else if (c.pressed('right')) {
      if (this.sel < n - 1) this.select(this.sel + 1);
      else {
        Sound.move();
        this.hooks.leave?.('first');
      }
    } else if (c.pressed('confirm')) this.confirm();
    else if (c.pressed('cancel') || c.pressed('down')) {
      Sound.cancel();
      this.hooks.leave?.('keep');
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const c = this.c;
    c.each((o: Phaser.GameObjects.GameObject) => {
      if (o instanceof Phaser.GameObjects.Container) o.each((x: Phaser.GameObjects.GameObject) => x.disableInteractive());
    });
    c.scene.tweens.add({ targets: c, alpha: 0, duration: 110, onComplete: () => c.destroy() });
  }
}
