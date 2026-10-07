import Phaser from 'phaser';

/** Drifting fireflies: additive dots that wander and pulse. */
export function fireflies(scene: Phaser.Scene, x: number, y: number, w: number, h: number, count: number, depth = 900, tint = 0xffe08a) {
  const list: Phaser.GameObjects.Image[] = [];
  for (let i = 0; i < count; i++) {
    const f = scene.add.image(Phaser.Math.Between(x, x + w), Phaser.Math.Between(y, y + h), 'dot');
    f.setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setDepth(depth);
    const s = Phaser.Math.FloatBetween(0.18, 0.42);
    f.setScale(s).setAlpha(0);
    const drift = () => {
      scene.tweens.add({
        targets: f,
        x: Phaser.Math.Clamp(f.x + Phaser.Math.Between(-90, 90), x, x + w),
        y: Phaser.Math.Clamp(f.y + Phaser.Math.Between(-70, 70), y, y + h),
        duration: Phaser.Math.Between(2600, 5200),
        ease: 'Sine.easeInOut',
        onComplete: drift,
      });
    };
    drift();
    scene.tweens.add({ targets: f, alpha: { from: 0, to: Phaser.Math.FloatBetween(0.55, 1) }, duration: Phaser.Math.Between(900, 1800), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 2000) });
    list.push(f);
  }
  return list;
}

/** Warm light pools over painted lamps. */
export function lightPool(scene: Phaser.Scene, x: number, y: number, r: number, color: number, flicker = false, depth = 800) {
  const g = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(depth);
  g.setDisplaySize(r * 2, r * 2).setAlpha(0.24);
  if (flicker) {
    scene.tweens.add({ targets: g, alpha: { from: 0.18, to: 0.3 }, duration: Phaser.Math.Between(140, 320), yoyo: true, repeat: -1, ease: 'Stepped', delay: Phaser.Math.Between(0, 300) });
  } else {
    scene.tweens.add({ targets: g, alpha: { from: 0.16, to: 0.28 }, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  return g;
}

/** Undertale-style dust: break an image into rising motes. */
export function dustify(scene: Phaser.Scene, img: Phaser.GameObjects.Image, color: number, depth: number) {
  const b = img.getBounds();
  const n = 140;
  for (let i = 0; i < n; i++) {
    const px = Phaser.Math.Between(b.x + b.width * 0.15, b.x + b.width * 0.85);
    const py = b.y + (i / n) * b.height;
    const d = scene.add.image(px, py, 'dot').setTint(i % 3 ? color : 0xffffff).setScale(Phaser.Math.FloatBetween(0.15, 0.4)).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: d,
      x: px + Phaser.Math.Between(-60, 60),
      y: py - Phaser.Math.Between(60, 220),
      alpha: 0,
      delay: (i / n) * 900,
      duration: Phaser.Math.Between(700, 1400),
      ease: 'Cubic.easeOut',
      onComplete: () => d.destroy(),
    });
  }
  scene.tweens.add({ targets: img, alpha: 0, duration: 1100, ease: 'Quad.easeIn' });
}

/** Sparkle burst used for spares, saves and level ups. */
export function sparkleBurst(scene: Phaser.Scene, x: number, y: number, count = 14, depth = 4000, radius = 120) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const s = scene.add.image(x, y, 'ui_fx_sparkle').setScale(0.25).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: s,
      x: x + Math.cos(a) * radius * Phaser.Math.FloatBetween(0.6, 1.2),
      y: y + Math.sin(a) * radius * Phaser.Math.FloatBetween(0.6, 1.2),
      scale: 0.05,
      angle: 180,
      alpha: 0,
      duration: Phaser.Math.Between(600, 1000),
      ease: 'Cubic.easeOut',
      onComplete: () => s.destroy(),
    });
  }
}

/** Floating damage / heal number. */
export function popNumber(scene: Phaser.Scene, x: number, y: number, text: string, color: string, depth = 4500) {
  const t = scene.add
    .text(x, y, text, { fontFamily: '"Lilita One", sans-serif', fontSize: '46px', color, stroke: '#1a0b02', strokeThickness: 8 })
    .setOrigin(0.5)
    .setDepth(depth);
  t.setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, delay: 600, duration: 700, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
  return t;
}
