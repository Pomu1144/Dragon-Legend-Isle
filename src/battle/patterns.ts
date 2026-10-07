import Phaser from 'phaser';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bullet {
  obj: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
  spin: number;
  harmless: boolean;
  dead: boolean;
  bounce?: boolean;
  data: Record<string, number>;
  tick?: (b: Bullet, dt: number) => void;
}

export interface SpawnOpts {
  size?: number;
  r?: number;
  vx?: number;
  vy?: number;
  life?: number;
  spin?: number;
  harmless?: boolean;
  tint?: number;
  alpha?: number;
  bounce?: boolean;
  blend?: Phaser.BlendModes;
  tick?: (b: Bullet, dt: number) => void;
  data?: Record<string, number>;
  angle?: number;
}

/** All projectiles of one enemy turn. Coordinates are screen pixels. */
export class BulletField {
  scene: Phaser.Scene;
  layer: Phaser.GameObjects.Container;
  bullets: Bullet[] = [];
  box: Box;
  tint?: number;

  constructor(scene: Phaser.Scene, box: Box, depth: number) {
    this.scene = scene;
    this.box = box;
    this.layer = scene.add.container(0, 0).setDepth(depth);
  }

  spawn(key: string, x: number, y: number, o: SpawnOpts = {}): Bullet {
    const img = this.scene.add.image(x, y, key);
    const size = o.size ?? 28;
    const src = img.frame;
    const s = size / Math.max(src.width, src.height);
    img.setScale(s);
    if (o.tint !== undefined) img.setTint(o.tint);
    else if (this.tint !== undefined) img.setTint(this.tint);
    if (o.blend !== undefined) img.setBlendMode(o.blend);
    if (o.angle !== undefined) img.setAngle(o.angle);
    img.setAlpha(o.alpha ?? 1);
    this.layer.add(img);
    const b: Bullet = {
      obj: img,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      r: o.r ?? size * 0.36,
      age: 0,
      life: o.life ?? 8,
      spin: o.spin ?? 0,
      harmless: !!o.harmless,
      dead: false,
      bounce: o.bounce,
      data: o.data ?? {},
      tick: o.tick,
    };
    if (!o.harmless) {
      img.setAlpha(0);
      this.scene.tweens.add({ targets: img, alpha: o.alpha ?? 1, duration: 120 });
    }
    this.bullets.push(b);
    return b;
  }

  /** Advance bullets; returns true if the soul was hit this frame. */
  update(dt: number, soul: { x: number; y: number; r: number }): boolean {
    let hit = false;
    const s = dt / 1000;
    const bx = this.box;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.age += s;
      b.tick?.(b, s);
      b.obj.x += b.vx * s;
      b.obj.y += b.vy * s;
      if (b.spin) b.obj.rotation += b.spin * s;
      if (b.bounce) {
        if (b.obj.x < bx.x + b.r) { b.obj.x = bx.x + b.r; b.vx = Math.abs(b.vx); }
        if (b.obj.x > bx.x + bx.w - b.r) { b.obj.x = bx.x + bx.w - b.r; b.vx = -Math.abs(b.vx); }
        if (b.obj.y < bx.y + b.r) { b.obj.y = bx.y + b.r; b.vy = Math.abs(b.vy); }
        if (b.obj.y > bx.y + bx.h - b.r) { b.obj.y = bx.y + bx.h - b.r; b.vy = -Math.abs(b.vy); }
      }
      if (b.age > b.life || b.obj.x < bx.x - 400 || b.obj.x > bx.x + bx.w + 400 || b.obj.y < bx.y - 400 || b.obj.y > bx.y + bx.h + 400) {
        this.kill(b);
        continue;
      }
      if (!b.harmless) {
        const dx = b.obj.x - soul.x;
        const dy = b.obj.y - soul.y;
        const rr = b.r + soul.r;
        if (dx * dx + dy * dy < rr * rr) hit = true;
      }
    }
    if (this.bullets.length > 400) this.bullets = this.bullets.filter((b) => !b.dead);
    return hit;
  }

  kill(b: Bullet) {
    if (b.dead) return;
    b.dead = true;
    this.scene.tweens.add({ targets: b.obj, alpha: 0, duration: 140, onComplete: () => b.obj.destroy() });
  }

  clear() {
    for (const b of this.bullets) this.kill(b);
    this.bullets = [];
  }

  destroy() {
    this.layer.destroy();
  }
}

export interface PatternCtx {
  scene: Phaser.Scene;
  field: BulletField;
  box: Box;
  soul: { x: number; y: number };
  power: number; // 1 = normal, grows for bosses / later turns
  rng: Phaser.Math.RandomDataGenerator;
  proj?: string; // projectile texture override (from the creature's ability)
}

export interface Pattern {
  box: [number, number];
  run: (ctx: PatternCtx) => (t: number, dt: number) => void;
}

/** Fire fn every `ms` milliseconds of pattern time. */
function every(ms: number, fn: (n: number) => void) {
  let acc = ms;
  let n = 0;
  return (dt: number) => {
    acc += dt;
    while (acc >= ms) {
      acc -= ms;
      fn(n++);
    }
  };
}

function telegraph(ctx: PatternCtx, x: number, y: number, w: number, h: number, angle = 0, ms = 600, color = 0xff4a5a) {
  const r = ctx.scene.add.rectangle(x, y, w, h, color, 0.18).setAngle(angle).setStrokeStyle(2, color, 0.9);
  ctx.field.layer.add(r);
  ctx.scene.tweens.add({ targets: r, alpha: { from: 0.2, to: 1 }, duration: 120, yoyo: true, repeat: Math.floor(ms / 240) });
  ctx.scene.time.delayedCall(ms, () => r.destroy());
}

export const PATTERNS: Record<string, Pattern> = {
  // ---- Bat Fiend ----------------------------------------------------------
  bat_rings: {
    box: [420, 260],
    run: (c) => {
      const b = c.box;
      return (() => {
        const fire = every(620 / c.power, (n) => {
          const fromLeft = n % 2 === 0;
          const gap = c.rng.between(0, 2);
          for (let i = 0; i < 4; i++) {
            if (i === gap) continue;
            const y = b.y + 32 + i * ((b.h - 64) / 3);
            c.field.spawn(c.proj ?? 'ui_fx_silverring', fromLeft ? b.x - 30 : b.x + b.w + 30, y, {
              size: 64, r: 16, vx: (fromLeft ? 1 : -1) * 190 * c.power, blend: Phaser.BlendModes.ADD,
              tick: (bb) => bb.obj.setScale(bb.obj.scaleX * (1 + 0.0 * bb.age)),
            });
          }
        });
        return (_t: number, dt: number) => fire(dt);
      })();
    },
  },
  bat_swoop: {
    box: [380, 300],
    run: (c) => {
      const b = c.box;
      const fire = every(900 / c.power, (n) => {
        const left = n % 2 === 0;
        const x0 = left ? b.x - 40 : b.x + b.w + 40;
        const ty = c.soul.y;
        c.field.spawn(c.proj ?? 'ui_fx_tornado', x0, b.y - 40, {
          size: 70, r: 20, life: 4, spin: 0,
          data: { x0, y0: b.y - 40, ty, dir: left ? 1 : -1 },
          tick: (bb) => {
            const k = bb.age / 1.6;
            bb.obj.x = bb.data.x0 + bb.data.dir * k * (b.w + 80);
            bb.obj.y = bb.data.y0 + Math.sin(Math.min(k, 1) * Math.PI) * (bb.data.ty - bb.data.y0 + 40);
            bb.obj.setScale(bb.obj.scaleX, bb.obj.scaleX);
          },
        });
      });
      const sp = every(500, () => {
        c.field.spawn(c.proj ?? 'ui_fx_sparkle', c.rng.between(b.x + 10, b.x + b.w - 10), b.y - 10, { size: 22, r: 7, vy: 150 * c.power, spin: 4, blend: Phaser.BlendModes.ADD });
      });
      return (_t, dt) => { fire(dt); sp(dt); };
    },
  },
  bat_sparkle: {
    box: [360, 260],
    run: (c) => {
      const b = c.box;
      const fire = every(170 / c.power, () => {
        const x = c.rng.between(b.x + 8, b.x + b.w - 8);
        c.field.spawn(c.proj ?? 'ui_fx_sparkle', x, b.y - 10, {
          size: 26, r: 7, vy: c.rng.between(120, 200) * c.power, spin: 5, blend: Phaser.BlendModes.ADD,
          data: { x, f: c.rng.realInRange(2, 4) },
          tick: (bb) => { bb.obj.x = bb.data.x + Math.sin(bb.age * bb.data.f) * 26; },
        });
      });
      return (_t, dt) => fire(dt);
    },
  },

  // ---- Bones --------------------------------------------------------------
  bones_bounce: {
    box: [360, 300],
    run: (c) => {
      const b = c.box;
      let spawned = 0;
      const fire = every(700, () => {
        if (spawned >= 3 + Math.round(c.power * 2)) return;
        spawned++;
        const a = c.rng.realInRange(0, Math.PI * 2);
        const sp = 170 * c.power;
        c.field.spawn(c.proj ?? 'ui_orb_moss', b.x + b.w / 2 + c.rng.between(-100, 100), b.y + 30, { size: 40, r: 15, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + 40, spin: 3, bounce: true, life: 99 });
      });
      return (_t, dt) => fire(dt);
    },
  },
  bones_webs: {
    box: [420, 280],
    run: (c) => {
      const b = c.box;
      const cols = 7;
      const cw = b.w / cols;
      const fire = every(1300 / c.power, () => {
        const safe = c.rng.between(0, cols - 2);
        for (let i = 0; i < cols; i++) {
          if (i === safe || i === safe + 1) continue;
          const x = b.x + cw * (i + 0.5);
          telegraph(c, x, b.y + b.h / 2, cw - 6, b.h, 0, 520, 0x9cff9c);
          c.scene.time.delayedCall(560, () => c.field.spawn(c.proj ?? 'ui_orb_web', x, b.y - 20, { size: cw - 4, r: (cw - 4) * 0.4, vy: 330 * c.power, spin: 2 }));
        }
      });
      return (_t, dt) => fire(dt);
    },
  },
  bones_spiral: {
    box: [340, 300],
    run: (c) => {
      const b = c.box;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const fire = every(140 / c.power, (n) => {
        const a = n * 0.55;
        c.field.spawn(c.proj ?? 'ui_orb_moss', cx, cy, { size: 26, r: 9, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, spin: 4 });
      });
      return (t, dt) => { if (t > 0.5) fire(dt); };
    },
  },

  // ---- Blood Priest -------------------------------------------------------
  priest_orbit: {
    box: [340, 340],
    run: (c) => {
      const b = c.box;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const n = 10;
      for (let i = 0; i < n; i++) {
        c.field.spawn(c.proj ?? 'ui_orb_blood', cx, cy, {
          size: 36, r: 13, life: 99, spin: 3,
          data: { a: (i / n) * Math.PI * 2 },
          tick: (bb) => {
            const t = bb.age;
            const rad = 40 + (Math.sin(t * 1.1) * 0.5 + 0.5) * 120;
            const a = bb.data.a + t * 1.3 * c.power;
            bb.obj.x = cx + Math.cos(a) * rad;
            bb.obj.y = cy + Math.sin(a) * rad;
            // leave a gap in the ring
            bb.obj.setVisible(!(i === 0 || i === 1));
            bb.harmless = i === 0 || i === 1;
          },
        });
      }
      return () => {};
    },
  },
  priest_rain: {
    box: [440, 260],
    run: (c) => {
      const b = c.box;
      const fire = every(120 / c.power, () => {
        c.field.spawn(c.proj ?? 'ui_orb_blood', c.rng.between(b.x - 80, b.x + b.w), b.y - 20, { size: 24, r: 8, vx: 90, vy: 230 * c.power, spin: 6 });
      });
      return (_t, dt) => fire(dt);
    },
  },
  priest_homing: {
    box: [380, 300],
    run: (c) => {
      const b = c.box;
      const fire = every(1100 / c.power, () => {
        const corner = c.rng.between(0, 3);
        const x = corner % 2 ? b.x + b.w - 20 : b.x + 20;
        const y = corner > 1 ? b.y + b.h - 20 : b.y + 20;
        c.field.spawn(c.proj ?? 'ui_orb_blood', x, y, {
          size: 40, r: 14, life: 4.2, spin: 4,
          tick: (bb, dt) => {
            const dx = c.soul.x - bb.obj.x;
            const dy = c.soul.y - bb.obj.y;
            const d = Math.hypot(dx, dy) || 1;
            const acc = 260 * c.power;
            bb.vx = Phaser.Math.Clamp(bb.vx + (dx / d) * acc * dt, -170, 170);
            bb.vy = Phaser.Math.Clamp(bb.vy + (dy / d) * acc * dt, -170, 170);
          },
        });
      });
      const drip = every(260, () => c.field.spawn(c.proj ?? 'ui_orb_blood', c.rng.between(b.x, b.x + b.w), b.y - 10, { size: 18, r: 6, vy: 160 }));
      return (_t, dt) => { fire(dt); drip(dt); };
    },
  },

  // ---- Nocturne -----------------------------------------------------------
  noct_lines: {
    box: [400, 300],
    run: (c) => {
      const b = c.box;
      const fire = every(850 / c.power, (n) => {
        const horiz = n % 2 === 0;
        const pos = horiz ? Phaser.Math.Clamp(c.soul.y, b.y + 20, b.y + b.h - 20) : Phaser.Math.Clamp(c.soul.x, b.x + 20, b.x + b.w - 20);
        if (horiz) telegraph(c, b.x + b.w / 2, pos, b.w, 26, 0, 520, 0x9fd8ff);
        else telegraph(c, pos, b.y + b.h / 2, 26, b.h, 0, 520, 0x9fd8ff);
        c.scene.time.delayedCall(540, () => {
          for (let k = 0; k < 6; k++) {
            if (horiz) c.field.spawn(c.proj ?? 'ui_fx_sparkle', b.x - 30 - k * 40, pos, { size: 30, r: 10, vx: 900, spin: 8, blend: Phaser.BlendModes.ADD });
            else c.field.spawn(c.proj ?? 'ui_fx_sparkle', pos, b.y - 30 - k * 40, { size: 30, r: 10, vy: 900, spin: 8, blend: Phaser.BlendModes.ADD });
          }
        });
      });
      return (_t, dt) => fire(dt);
    },
  },
  noct_crescent: {
    box: [400, 300],
    run: (c) => {
      const b = c.box;
      const fire = every(1000 / c.power, () => {
        const a = c.rng.realInRange(0, Math.PI * 2);
        const x = b.x + b.w / 2 + Math.cos(a) * 280;
        const y = b.y + b.h / 2 + Math.sin(a) * 240;
        for (let k = -1; k <= 1; k++) {
          const ang = Math.atan2(c.soul.y - y, c.soul.x - x) + k * 0.22;
          c.field.spawn(c.proj ?? 'ui_fx_silverring', x, y, { size: 56, r: 13, vx: Math.cos(ang) * 260 * c.power, vy: Math.sin(ang) * 260 * c.power, angle: Phaser.Math.RadToDeg(ang) + 90, blend: Phaser.BlendModes.ADD, life: 4 });
        }
      });
      return (_t, dt) => fire(dt);
    },
  },
  noct_stars: {
    box: [360, 300],
    run: (c) => {
      const b = c.box;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const fire = every(650 / c.power, (n) => {
        const k = 12;
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI * 2 + n * 0.3;
          c.field.spawn(c.proj ?? 'ui_fx_sparkle', cx + Math.cos(a) * 260, cy + Math.sin(a) * 260, { size: 24, r: 8, vx: -Math.cos(a) * 150, vy: -Math.sin(a) * 150, spin: 3, blend: Phaser.BlendModes.ADD, life: 3.4 });
        }
      });
      return (_t, dt) => fire(dt);
    },
  },

  // ---- Rift Drake ---------------------------------------------------------
  drake_tornado: {
    box: [480, 280],
    run: (c) => {
      const b = c.box;
      const fire = every(1150 / c.power, (n) => {
        const fromLeft = n % 2 === 0;
        const gapTop = c.rng.between(0, 1) === 0;
        const y = gapTop ? b.y + b.h * 0.68 : b.y + b.h * 0.32;
        telegraph(c, b.x + b.w / 2, y, b.w, b.h * 0.42, 0, 480, 0x5fd0ff);
        c.scene.time.delayedCall(500, () => {
          c.field.spawn(c.proj ?? 'ui_fx_tornado', fromLeft ? b.x - 80 : b.x + b.w + 80, y, { size: b.h * 0.55, r: b.h * 0.18, vx: (fromLeft ? 1 : -1) * 420, life: 3 });
          c.field.spawn(c.proj ?? 'ui_fx_tornado', fromLeft ? b.x - 190 : b.x + b.w + 190, y, { size: b.h * 0.55, r: b.h * 0.18, vx: (fromLeft ? 1 : -1) * 420, life: 3 });
        });
      });
      const sp = every(300, () => c.field.spawn(c.proj ?? 'ui_fx_waterring', c.rng.between(b.x, b.x + b.w), b.y - 20, { size: 34, r: 10, vy: 200, blend: Phaser.BlendModes.ADD }));
      return (_t, dt) => { fire(dt); sp(dt); };
    },
  },
  drake_burst: {
    box: [400, 340],
    run: (c) => {
      const b = c.box;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const core = c.field.spawn(c.proj ?? 'ui_orb_blood', cx, cy, { size: 64, r: 20, spin: 2, tint: 0x8a6bff, life: 99 });
      core.data.t = 0;
      const fire = every(520 / c.power, (n) => {
        const k = 10;
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI * 2 + n * 0.21;
          c.field.spawn(c.proj ?? 'ui_fx_sparkle', cx, cy, { size: 24, r: 8, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, spin: 4, blend: Phaser.BlendModes.ADD, life: 3 });
        }
      });
      return (t, dt) => {
        core.obj.x = cx + Math.sin(t * 0.9) * 120;
        core.obj.y = cy + Math.cos(t * 1.3) * 60;
        if (t > 0.6) fire(dt);
      };
    },
  },
  drake_rift: {
    box: [420, 320],
    run: (c) => {
      const b = c.box;
      const fire = every(700 / c.power, () => {
        const x = c.rng.between(b.x + 40, b.x + b.w - 40);
        const y = c.rng.between(b.y + 40, b.y + b.h - 40);
        const warn = c.field.spawn(c.proj ?? 'ui_orb_blood', x, y, { size: 70, r: 0, harmless: true, tint: 0x6a5bff, alpha: 0.35, spin: -3, life: 0.7 });
        warn.obj.setScale(warn.obj.scaleX * 0.4);
        c.scene.tweens.add({ targets: warn.obj, scale: warn.obj.scaleX * 2.5, duration: 650 });
        c.scene.time.delayedCall(650, () => {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            c.field.spawn(c.proj ?? 'ui_fx_waterring', x, y, { size: 30, r: 9, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, blend: Phaser.BlendModes.ADD, life: 2.5 });
          }
        });
      });
      return (_t, dt) => fire(dt);
    },
  },
  drake_storm: {
    box: [460, 320],
    run: (c) => {
      const inner = [PATTERNS.drake_tornado.run(c), PATTERNS.bat_sparkle.run({ ...c, power: c.power * 0.6 })];
      return (t, dt) => inner.forEach((f) => f(t, dt));
    },
  },
};

/** Ability-driven pattern names (used by the creature kits) mapped onto the implementations above. */
export const BASE_PATTERNS: Record<string, string> = {
  rings_sweep: 'bat_rings',
  swoop: 'bat_swoop',
  sparkle_rain: 'bat_sparkle',
  bounce_orbs: 'bones_bounce',
  column_drop: 'bones_webs',
  spiral: 'bones_spiral',
  orbit_ring: 'priest_orbit',
  diagonal_rain: 'priest_rain',
  homing: 'priest_homing',
  telegraph_lines: 'noct_lines',
  aimed_volley: 'noct_crescent',
  radial_burst: 'noct_stars',
  tornado_sweep: 'drake_tornado',
  rift_bursts: 'drake_rift',
};
