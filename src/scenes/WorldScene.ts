import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { ROOMS, RoomDef, Dir, Pt } from '../data/rooms';
import { State } from '../state';
import { Dialogue, Line } from '../ui/Dialogue';
import { Controls } from '../ui/input';
import { fireflies, lightPool, sparkleBurst } from '../ui/fx';
import { label, title, COLORS } from '../ui/widgets';

interface WorldData {
  room?: string;
  spawn?: string;
  at?: Pt;
  fresh?: boolean;
  debug?: boolean;
}

export interface BattleResult {
  monster: string;
  outcome: 'won' | 'spared' | 'bound' | 'fled' | 'lost';
}

function inPoly(x: number, y: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface Interact {
  x: number;
  y: number;
  r: number;
  run: () => void;
  promptY: number;
}

export class WorldScene extends Phaser.Scene {
  private room!: RoomDef;
  private controls!: Controls;
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Image;
  private halo!: Phaser.GameObjects.Image;
  private dir: Dir = 'down';
  private dialogue!: Dialogue;
  private interacts: Interact[] = [];
  private prompt!: Phaser.GameObjects.Container;
  private busy = false;
  private stepAcc = 0;
  private nextEncounter = 0;
  private debugGfx?: Phaser.GameObjects.Graphics;
  private dataIn: WorldData = {};
  private ySortedObjs: { obj: Phaser.GameObjects.Components.Depth & { y: number }; base: number }[] = [];
  private lastSafe: Pt = [0, 0];
  private timeAcc = 0;

  constructor() {
    super('World');
  }

  init(data: WorldData) {
    this.dataIn = data ?? {};
  }

  create() {
    const data = this.dataIn;
    const s = State.get();
    const roomId = data.room ?? s.room ?? 'plaza';
    this.room = ROOMS[roomId] ?? ROOMS.plaza;
    s.room = this.room.id;
    this.controls = new Controls(this);
    this.interacts = [];
    this.ySortedObjs = [];
    this.busy = false;
    const R = this.room;
    const [RW, RH] = R.size;

    this.add.image(0, 0, R.bg).setOrigin(0).setDepth(0);
    for (const l of R.lights ?? []) lightPool(this, l.at[0], l.at[1], l.r, l.color, l.flicker, 2);
    fireflies(this, 0, 0, RW, RH, R.fireflies ?? 0, 3000);
    this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDisplaySize(this.scale.width, this.scale.height).setDepth(4000).setAlpha(0.7);

    // Spawn point
    let at: Pt = [s.x, s.y];
    let dir: Dir = 'down';
    if (data.at) at = data.at;
    else if (data.spawn && R.spawns[data.spawn]) {
      at = R.spawns[data.spawn].at;
      dir = R.spawns[data.spawn].dir;
    }
    this.dir = dir;
    this.lastSafe = [at[0], at[1]];

    this.shadow = this.add.image(at[0], at[1], 'shadow').setAlpha(0.8);
    this.halo = this.add.image(at[0], at[1] - 30, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc98a).setAlpha(0.16).setDepth(5);
    this.player = this.add.sprite(at[0], at[1], 'hero_walk', this.frameFor(dir)).setOrigin(0.5, 0.98);
    this.applyScale();
    this.ySortedObjs.push({ obj: this.player, base: 0 });

    // NPCs
    for (const n of R.npcs ?? []) {
      const sh = this.add.image(n.at[0], n.at[1], 'shadow').setAlpha(0.8);
      const spr = this.add.sprite(n.at[0], n.at[1], n.sprite, 0).setOrigin(0.5, 0.98);
      spr.play('wren_idle');
      const sc = this.scaleAt(n.at[1]);
      spr.setScale(sc);
      sh.setScale(sc * 0.75, sc * 0.8).setDepth(n.at[1] - 1);
      this.ySortedObjs.push({ obj: spr, base: 0 });
      this.interacts.push({ x: n.at[0], y: n.at[1], r: 70, promptY: n.at[1] - 176 * sc - 16, run: () => this.talkNpc(n.id, spr) });
    }
    // Candles (save points)
    for (const c of R.candles ?? []) {
      const sc = this.scaleAt(c.at[1]) * 1.15;
      const img = this.add.image(c.at[0], c.at[1], 'ui_' + c.kind).setOrigin(0.5, 1).setScale(sc);
      const glow = lightPool(this, c.at[0], c.at[1] - img.displayHeight * 0.85, 90, 0xffc070, true, 3);
      this.add.image(c.at[0], c.at[1], 'shadow').setScale(sc * 0.6, sc * 0.5).setDepth(c.at[1] - 1);
      this.ySortedObjs.push({ obj: img, base: 0 });
      this.interacts.push({ x: c.at[0], y: c.at[1], r: 64, promptY: c.at[1] - img.displayHeight - 18, run: () => this.useCandle(glow, c.at) });
    }
    for (const t of R.things ?? []) {
      this.interacts.push({ x: t.at[0], y: t.at[1], r: t.r, promptY: t.at[1] - 70, run: () => this.say(t.lines.map((text) => ({ text, speaker: t.speaker, portrait: t.portrait }))) });
    }

    // Interaction prompt: blue chip with a "Z"
    const chip = this.add.image(0, 0, 'ui_chip_blue').setScale(0.36);
    const z = label(this, 0, -2, 'Z', 20, COLORS.cream, 5).setOrigin(0.5);
    const inner = this.add.container(0, 0, [chip, z]);
    this.prompt = this.add.container(0, 0, [inner]).setDepth(3500).setVisible(false);
    this.tweens.add({ targets: inner, y: -6, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });

    const cam = this.cameras.main;
    cam.setBounds(0, 0, RW, RH);
    cam.startFollow(this.player, true, 0.12, 0.12, 0, 40);
    cam.fadeIn(600, 0, 0, 0);

    this.dialogue = new Dialogue(this, this.controls);
    this.resetEncounter();
    Sound.playMusic(R.music);
    this.showRoomName();

    this.events.off('wake');
    this.events.on('wake', (_sys: unknown, result?: BattleResult) => this.onWake(result));
    this.events.off('resume');
    this.events.on('resume', () => this.controls.reset());

    if (data.fresh) {
      this.busy = true;
      this.time.delayedCall(900, () =>
        this.say(
          [
            { text: '* (You wake on a bench in the plaza. The lamps are already lit.)' },
            { text: '* (Someone by the fountain is waving at you.)' },
          ],
          () => undefined,
        ),
      );
    }
  }

  private showRoomName() {
    const W = this.scale.width;
    const c = this.add.container(W / 2, 64).setScrollFactor(0).setDepth(4200);
    const bg = this.add.image(0, 0, 'ui_banner_header').setScale(0.92, 0.62);
    const t = title(this, 0, 14, this.room.name, 26, COLORS.cream).setOrigin(0.5);
    c.add([bg, t]);
    const fit = Math.min(1, 330 / t.width);
    t.setScale(fit);
    c.setAlpha(0).setY(48);
    this.tweens.add({ targets: c, alpha: 1, y: 64, duration: 500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, y: 52, delay: 2600, duration: 700, onComplete: () => c.destroy() });
  }

  private frameFor(d: Dir) {
    return { down: 0, left: 4, right: 8, up: 12 }[d];
  }

  private scaleAt(y: number) {
    const [top, bottom] = this.room.scale;
    return Phaser.Math.Linear(top, bottom, Phaser.Math.Clamp(y / this.room.size[1], 0, 1));
  }

  private applyScale() {
    const sc = this.scaleAt(this.player.y);
    this.player.setScale(sc);
    this.shadow.setScale(sc * 0.8, sc * 0.85).setPosition(this.player.x, this.player.y);
    this.halo.setPosition(this.player.x, this.player.y - 70 * sc).setScale(sc * 1.6);
  }

  private walkable(x: number, y: number) {
    const R = this.room;
    if (!R.walk.some((p) => inPoly(x, y, p))) return false;
    if (R.block.some((p) => inPoly(x, y, p))) return false;
    return true;
  }

  private canStand(x: number, y: number) {
    const hw = 10 * (this.scaleAt(y) / 0.45);
    for (const n of this.room.npcs ?? []) {
      const dx = (x - n.at[0]) / 30;
      const dy = (y - n.at[1]) / 14;
      if (dx * dx + dy * dy < 1) return false;
    }
    return this.walkable(x, y) && this.walkable(x - hw, y) && this.walkable(x + hw, y) && this.walkable(x, y - 4);
  }

  private resetEncounter() {
    this.nextEncounter = Phaser.Math.Between(700, 1300);
    this.stepAcc = 0;
  }

  say(lines: Line[], done?: (choice: number) => void) {
    this.busy = true;
    this.prompt?.setVisible(false);
    this.player.anims.stop();
    this.player.setFrame(this.frameFor(this.dir));
    this.dialogue.show(lines, (c) => {
      this.time.delayedCall(60, () => {
        this.busy = false;
        this.controls.reset();
      });
      done?.(c);
    });
  }

  update(_t: number, rawDt: number) {
    const dt = Math.min(rawDt, 50);
    this.timeAcc += dt;
    if (this.timeAcc > 1000) {
      State.get().playSeconds += Math.floor(this.timeAcc / 1000);
      this.timeAcc %= 1000;
    }
    for (const o of this.ySortedObjs) o.obj.setDepth(10 + o.obj.y);
    this.shadow.setDepth(9 + this.player.y);
    if (this.controls.pressed('debug')) this.toggleDebug();
    if (this.dialogue.active) {
      this.dialogue.update(dt);
      return;
    }
    if (this.busy) return;

    if (this.controls.pressed('menu')) {
      Sound.confirm();
      this.player.anims.stop();
      this.scene.launch('Menu');
      this.scene.pause();
      return;
    }

    const ax = this.controls.axis();
    const moving = ax.x !== 0 || ax.y !== 0;
    if (moving) {
      if (Math.abs(ax.x) > 0 && (ax.y === 0 || Math.abs(ax.x) >= Math.abs(ax.y))) this.dir = ax.x < 0 ? 'left' : 'right';
      if (ax.y !== 0 && ax.x === 0) this.dir = ax.y < 0 ? 'up' : 'down';
      const len = Math.hypot(ax.x, ax.y);
      const sc = this.scaleAt(this.player.y) / 0.45;
      const speed = (this.controls.down('run') ? 290 : 190) * sc;
      const dx = (ax.x / len) * speed * (dt / 1000);
      const dy = (ax.y / len) * speed * (dt / 1000);
      const p = this.player;
      let nx = p.x;
      let ny = p.y;
      if (this.canStand(p.x + dx, p.y + dy)) {
        nx = p.x + dx;
        ny = p.y + dy;
      } else if (dx && this.canStand(p.x + dx, p.y)) {
        nx = p.x + dx;
      } else if (dy && this.canStand(p.x, p.y + dy)) {
        ny = p.y + dy;
      }
      const moved = Math.hypot(nx - p.x, ny - p.y);
      p.setPosition(nx, ny);
      if (moved > 0) this.lastSafe = [nx, ny];
      const anim = `hero_walk_${this.dir}`;
      if (p.anims.currentAnim?.key !== anim || !p.anims.isPlaying) p.play(anim, true);
      p.anims.timeScale = this.controls.down('run') ? 1.5 : 1;
      this.applyScale();
      this.stepAcc += moved / sc;
      if (moved > 0 && this.checkExitsAndTriggers()) return;
      if (moved > 0 && this.checkEncounter()) return;
    } else if (this.player.anims.isPlaying) {
      this.player.anims.stop();
      this.player.setFrame(this.frameFor(this.dir));
    }

    // Interaction
    const near = this.nearestInteract();
    if (near) {
      this.prompt.setVisible(true).setPosition(near.x, Math.max(near.promptY, 30));
      if (this.controls.pressed('confirm')) {
        Sound.confirm();
        near.run();
      }
    } else {
      this.prompt.setVisible(false);
    }
  }

  private nearestInteract(): Interact | null {
    const p = this.player;
    const fx = p.x + (this.dir === 'left' ? -20 : this.dir === 'right' ? 20 : 0);
    const fy = p.y + (this.dir === 'up' ? -20 : this.dir === 'down' ? 12 : 0);
    let best: Interact | null = null;
    let bd = Infinity;
    for (const it of this.interacts) {
      const d = Math.hypot(it.x - fx, it.y - fy);
      if (d < it.r && d < bd) {
        best = it;
        bd = d;
      }
    }
    return best;
  }

  private checkExitsAndTriggers(): boolean {
    const p = this.player;
    for (const e of this.room.exits) {
      const [x, y, w, h] = e.rect;
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) {
        if (e.locked && !State.flag(e.locked)) {
          this.pushBack(e.rect);
          this.say((e.lockedText ?? ['* It won\'t budge.']).map((text) => ({ text })));
          return true;
        }
        this.travel(e.to, e.spawn);
        return true;
      }
    }
    for (const t of this.room.triggers ?? []) {
      if (State.flag(t.once)) continue;
      const [x, y, w, h] = t.rect;
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) {
        this.runTrigger(t.id);
        return true;
      }
    }
    return false;
  }

  private pushBack(rect: [number, number, number, number]) {
    const p = this.player;
    const cx = rect[0] + rect[2] / 2;
    const cy = rect[1] + rect[3] / 2;
    const [rw, rh] = this.room.size;
    // Step back toward the room centre until standing on safe ground again.
    const tx = Phaser.Math.Clamp(p.x + (rw / 2 - cx) * 0.06, 0, rw);
    const ty = Phaser.Math.Clamp(p.y + (rh / 2 - cy) * 0.06, 0, rh);
    if (this.canStand(tx, ty)) p.setPosition(tx, ty);
    else p.setPosition(this.lastSafe[0] + Math.sign(rw / 2 - cx) * 30, this.lastSafe[1] + Math.sign(rh / 2 - cy) * 30);
    this.applyScale();
  }

  private travel(to: string, spawn: string) {
    this.busy = true;
    this.player.anims.stop();
    Sound.whoosh();
    const cam = this.cameras.main;
    cam.fadeOut(380, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      const sp = ROOMS[to].spawns[spawn];
      State.get().room = to;
      State.get().x = sp.at[0];
      State.get().y = sp.at[1];
      this.scene.restart({ room: to, spawn });
    });
  }

  private checkEncounter(): boolean {
    const enc = this.room.encounters;
    if (!enc) return false;
    const s = State.get();
    const left = s.encountersLeft[this.room.id] ?? enc.budget;
    if (left <= 0) return false;
    if (this.stepAcc < this.nextEncounter) return false;
    s.encountersLeft[this.room.id] = left - 1;
    const id = enc.table[Phaser.Math.Between(0, enc.table.length - 1)];
    this.startBattle(id);
    return true;
  }

  startBattle(monster: string) {
    this.busy = true;
    this.player.anims.stop();
    this.player.setFrame(this.frameFor(this.dir));
    this.prompt.setVisible(false);
    Sound.stopMusic(0.1);
    Sound.alert();
    const cam = this.cameras.main;
    const sx = this.player.x - cam.scrollX;
    const sy = this.player.y - cam.scrollY - this.player.displayHeight * 0.45;
    const bang = label(this, this.player.x, this.player.y - this.player.displayHeight - 10, '!', 54, COLORS.yellow, 9).setOrigin(0.5, 1).setDepth(5000);
    bang.setScale(0.3);
    this.tweens.add({ targets: bang, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.time.delayedCall(520, () => {
      bang.destroy();
      const black = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(9000);
      const soul = this.add.image(sx, sy, 'ui_soul').setScale(0.2).setScrollFactor(0).setDepth(9001);
      let n = 0;
      this.time.addEvent({
        delay: 110,
        repeat: 5,
        callback: () => {
          n++;
          soul.setVisible(n % 2 === 0);
          if (n % 2 === 0) Sound.blip(1.6);
        },
      });
      this.time.delayedCall(720, () => {
        Sound.whoosh();
        this.tweens.add({
          targets: soul,
          x: 640,
          y: 490,
          duration: 520,
          ease: 'Cubic.easeInOut',
          onComplete: () => {
            this.scene.launch('Battle', { monster, room: this.room.id });
            this.scene.sleep();
            black.destroy();
            soul.destroy();
          },
        });
      });
    });
  }

  private onWake(result?: BattleResult) {
    this.controls.reset();
    this.cameras.main.fadeIn(500, 0, 0, 0);
    Sound.playMusic(this.room.music);
    this.resetEncounter();
    this.busy = false;
    if (!result) return;
    if (result.monster === 'nocturne') {
      State.setFlag('metNocturne');
      const kind = result.outcome === 'won' ? 'won' : 'peace';
      this.say(
        kind === 'peace'
          ? [{ text: '* The fireflies drift back to the trail.' }, { text: '* Somewhere above, something is keeping watch over you.' }]
          : [{ text: '* The fireflies do not come back.' }, { text: '* The trail feels colder.' }],
      );
    }
    if (result.monster === 'rift_drake') {
      State.setFlag('drakeDone');
      this.busy = true;
      this.time.delayedCall(400, () => {
        this.scene.start('Ending', { peaceful: result.outcome !== 'won' });
      });
    }
  }

  private runTrigger(id: string) {
    if (id === 'nocturne') {
      this.busy = true;
      this.cameras.main.shake(300, 0.004);
      this.say(
        [
          { text: '* All at once, the fireflies go out.' },
          { text: '* A voice comes from everywhere and nowhere.' },
          { text: '...Turn back, little tamer. The Drake is not for you.', speaker: '???', voice: 0.7 },
        ],
        () => this.startBattle('nocturne'),
      );
    }
    if (id === 'drake') {
      this.busy = true;
      Sound.stopMusic(0.5);
      this.cameras.main.shake(900, 0.008);
      this.say(
        [
          { text: '* The Waystone flickers. Once. Twice.' },
          { text: '* Something enormous uncoils from behind it. Cyan light bleeds through cracked scales.' },
          { text: 'WHO DISTURBS THE STONE?', speaker: '???', voice: 0.5 },
        ],
        () => this.startBattle('rift_drake'),
      );
    }
  }

  private talkNpc(id: string, spr: Phaser.GameObjects.Sprite) {
    if (id !== 'wren') return;
    spr.anims.stop();
    spr.setFrame(2);
    const W = (text: string): Line => ({ text, speaker: 'Wren', portrait: 'wren_portrait', voice: 1.25 });
    const K = (text: string): Line => ({ text, speaker: State.get().name, portrait: 'hero_portrait', voice: 0.95 });
    const after = () => spr.play('wren_idle');
    if (!State.flag('metWren')) {
      this.say(
        [
          W('Oh good, you\'re awake! You\'re the new tamer the Guild sent, right? I\'m Wren.'),
          W('Listen — the western Waystone went dark three nights ago. Since then, the monsters on the forest road have been... jumpy.'),
          K('Jumpy how?'),
          W('Scared. And scared monsters fight. But they\'re not evil! If you talk to them — really talk — most of them will let you pass.'),
          W('Here. Binding Orbs and a tonic. If a monster is calm or worn out, an orb lets it come with you.'),
          { text: '* (You got 3 Binding Orbs and a Restoration Tonic.)' },
          W('Fight if you have to. But... try mercy first? For me?'),
          { text: 'Will you try?', speaker: 'Wren', portrait: 'wren_portrait', voice: 1.25, choices: ['I will', 'No promises'] },
        ],
        (choice) => {
          State.setFlag('metWren');
          State.addItem('orb', 3);
          State.addItem('tonic', 1);
          State.setFlag('promisedMercy', choice === 0);
          this.say(
            choice === 0
              ? [W('Thank you. The West Gate is down the stairs and to the left. Follow the lamps!'), W('Oh — and the candles. Touch one and it\'ll keep your place. Old Azurelake magic.')]
              : [W('...Fair. Just come back in one piece, okay?'), W('The West Gate is down the stairs and to the left. Candles will keep your place.')],
            after,
          );
        },
      );
      return;
    }
    const hints = [
      [W('Bat Fiends love fruit. And lullabies. And fruit lullabies, probably.')],
      [W('If a monster\'s name glows gold, it\'s ready to be spared. Check MERCY!')],
      [W('Stronger attacks have a higher TU cost. That means the monster gets more time to hit back. Choose wisely!')],
      [W('The Waystone is past the Mosswood Trail. Be careful, okay?')],
    ];
    this.say(hints[Phaser.Math.Between(0, hints.length - 1)], after);
  }

  private useCandle(glow: Phaser.GameObjects.Image, at: Pt) {
    const s = State.get();
    s.hp = s.maxHp;
    s.room = this.room.id;
    s.x = this.player.x;
    s.y = this.player.y;
    State.save();
    Sound.save();
    sparkleBurst(this, at[0], at[1] - 60, 18, 3600, 90);
    this.tweens.add({ targets: glow, alpha: 0.9, scale: glow.scale * 1.8, yoyo: true, duration: 500 });
    this.say([
      { text: '* The candle\'s small flame leans toward you, as if listening.' },
      { text: '* Watching it dance fills you with legendary resolve.' },
      { text: `* (HP fully restored. Progress saved — ${this.room.name}.)` },
    ]);
  }

  private toggleDebug() {
    if (this.debugGfx) {
      this.debugGfx.destroy();
      this.debugGfx = undefined;
      return;
    }
    const g = this.add.graphics().setDepth(8000);
    g.lineStyle(2, 0x00ff00, 1);
    for (const p of this.room.walk) g.strokePoints(p.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    g.lineStyle(2, 0xff0000, 1);
    for (const p of this.room.block) g.strokePoints(p.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
    g.fillStyle(0x0080ff, 0.4);
    for (const e of this.room.exits) g.fillRect(...e.rect);
    this.debugGfx = g;
  }
}
