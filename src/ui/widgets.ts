import Phaser from 'phaser';

export const FONT_TITLE = 'Cinzel, Georgia, serif';
export const FONT_LABEL = 'Cinzel, Georgia, serif';
export const FONT_BODY = '"Cormorant Garamond", Georgia, serif';

export const COLORS = {
  gold: '#c9a96a',
  cream: '#e9e1cf',
  ink: '#2a1606',
  outline: '#1a0b02',
  blue: '#9fd8ff',
  purple: '#9a93c8',
  green: '#8fb88a',
  red: '#c46a62',
  yellow: '#f2dca0',
};

/** Chunky outlined label in the style of the UI sheet ("Tail", "Bones", "TU:70"). */
export function label(scene: Phaser.Scene, x: number, y: number, text: string, size = 28, color = '#ffffff', stroke = 7) {
  size = Math.round(size * 0.86);
  stroke = Math.min(stroke, 4);
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT_LABEL,
    fontStyle: '700',
    fontSize: `${size}px`,
    color,
    stroke: COLORS.outline,
    strokeThickness: stroke,
    shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 6, fill: true, stroke: false },
  });
  t.setPadding(6, 4, 6, 6);
  return t;
}

export function body(scene: Phaser.Scene, x: number, y: number, text: string, size = 26, color = COLORS.cream, wrap = 0) {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT_BODY,
    fontStyle: '600',
    fontSize: `${Math.round(size * 1.12)}px`,
    color,
    lineSpacing: 4,
    stroke: '#06121e',
    strokeThickness: 2,
    shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 3, fill: true },
    wordWrap: wrap ? { width: wrap, useAdvancedWrap: true } : undefined,
  });
  t.setPadding(2, 2, 2, 4);
  return t;
}

export function title(scene: Phaser.Scene, x: number, y: number, text: string, size = 40, color = COLORS.gold) {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT_TITLE,
    fontStyle: '900',
    fontSize: `${size}px`,
    color,
    stroke: '#120800',
    strokeThickness: 3,
    shadow: { offsetX: 0, offsetY: 3, color: '#000', blur: 10, fill: true, stroke: false },
  });
  t.setPadding(4, 4, 4, 8);
  return t;
}

type PanelKind = 'blue' | 'parchment' | 'green' | 'page';
const PANEL: Record<PanelKind, { key: string; l: number; r: number; t: number; b: number }> = {
  blue: { key: 'ui_panel_blue', l: 24, r: 24, t: 22, b: 22 },
  parchment: { key: 'ui_panel_parchment', l: 24, r: 24, t: 22, b: 22 },
  green: { key: 'ui_panel_green', l: 22, r: 22, t: 20, b: 20 },
  page: { key: 'ui_panel_page', l: 34, r: 34, t: 32, b: 32 },
};

/** 9-slice panel built from the painted frames. Origin is the top-left corner. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, kind: PanelKind = 'blue') {
  const p = PANEL[kind];
  const ns = scene.add.nineslice(x, y, p.key, undefined, w, h, p.l, p.r, p.t, p.b);
  ns.setOrigin(0, 0);
  // Mute the painted frames toward a darker, desaturated palette.
  ns.setTint({ blue: 0x5e6874, parchment: 0xb8ac98, green: 0x8a9484, page: 0xc2b6a2 }[kind]);
  return ns;
}

/** Horizontal 3-slice of a painted element (bars, hex buttons). */
export function strip(scene: Phaser.Scene, x: number, y: number, key: string, w: number, cap: number, h?: number) {
  const ns = scene.add.nineslice(x, y, key, undefined, w, h ?? 0, cap, cap);
  ns.setOrigin(0, 0.5);
  return ns;
}

/** HP/progress bar: painted empty frame + fill sampled from the painted red/orange bars. */
export class Bar extends Phaser.GameObjects.Container {
  frameObj: Phaser.GameObjects.NineSlice;
  fill: Phaser.GameObjects.Image;
  shine: Phaser.GameObjects.Rectangle;
  ghost: Phaser.GameObjects.Rectangle;
  w: number;
  h: number;
  innerX: number;
  innerW: number;
  value = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, color: 'red' | 'orange' = 'red', h = 34) {
    super(scene, x, y);
    this.w = w;
    this.h = h;
    this.frameObj = scene.add.nineslice(0, 0, 'ui_bar_empty', undefined, w, 49, 28, 28).setOrigin(0, 0.5);
    this.frameObj.setScale(1, h / 49);
    const capPx = 22 * (h / 49);
    this.innerX = capPx * 0.9;
    this.innerW = w - this.innerX * 2;
    const innerH = h * 0.46;
    this.ghost = scene.add.rectangle(this.innerX, 0, this.innerW, innerH, 0xfff1c8, 0.9).setOrigin(0, 0.5);
    this.fill = scene.add.image(this.innerX, 0, color === 'red' ? 'ui_bar_red' : 'ui_bar_orange', 'fill').setOrigin(0, 0.5);
    this.fill.setDisplaySize(this.innerW, innerH);
    this.shine = scene.add.rectangle(this.innerX + 2, -innerH * 0.22, this.innerW - 4, innerH * 0.18, 0xffffff, 0.22).setOrigin(0, 0.5);
    this.add([this.frameObj, this.ghost, this.fill, this.shine]);
    scene.add.existing(this);
  }

  set(frac: number, animate = true) {
    frac = Phaser.Math.Clamp(frac, 0, 1);
    const old = this.value;
    this.value = frac;
    const target = Math.max(0.0001, this.innerW * frac);
    const innerH = this.h * 0.46;
    this.scene.tweens.killTweensOf(this.fill);
    this.scene.tweens.killTweensOf(this.ghost);
    if (!animate) {
      this.fill.setDisplaySize(target, innerH);
      this.ghost.width = target;
      this.shine.width = Math.max(0, target - 4);
      return;
    }
    this.fill.setDisplaySize(target, innerH);
    this.shine.width = Math.max(0, target - 4);
    if (frac < old) {
      this.scene.tweens.add({ targets: this.ghost, width: target, duration: 650, delay: 250, ease: 'Cubic.easeOut' });
    } else {
      this.ghost.width = target;
    }
  }
}

/** A cursor sprite that bobs horizontally; position the returned container freely. */
export function cursor(scene: Phaser.Scene, key: string, scale: number, dx = 6, ms = 400) {
  const img = scene.add.image(0, 0, key).setScale(scale);
  const c = scene.add.container(0, 0, [img]);
  scene.tweens.add({ targets: img, x: dx, yoyo: true, repeat: -1, duration: ms, ease: 'Sine.easeInOut' });
  return c;
}
