import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { ROOMS, RoomDef, Dir, Pt, rollEncounter } from '../data/rooms';
import { State } from '../state';
import { Dialogue, Line } from '../ui/Dialogue';
import { Controls } from '../ui/input';
import { fireflies, lightPool, sparkleBurst } from '../ui/fx';
import { label, title, COLORS } from '../ui/widgets';
import { scene } from '../data/script';
import { STARTERS } from '../data/starters';
import { ITEMS } from '../data/monsters';
import { STORY } from '../data/story';
import { EXPANSION_STORY } from '../data/expansion';
import { MISSIONS } from '../data/missions';
import type { MissionId } from '../data/missionTypes';
import { Quests } from '../quests';

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
  fight?: string; // set when a whole wave (a ritual group) was fought
  tally?: WaveTally;
}

export interface WaveTally {
  won: number;
  spared: number;
  bound: number;
}

/** A group fought one foe after another in a single battle (e.g. a ritual circle). */
export interface Wave {
  fight: string;
  queue: string[]; // foes still to come after the current one
  total: number;
  between: string[]; // "* " lines shown as each next foe steps in; {N} = foes remaining
  tally: WaveTally;
  index: number; // 1-based number of the current foe
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
  obj?: { x: number; y: number }; // follows a moving NPC
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
  private npcs: Record<string, Phaser.GameObjects.Sprite> = {};
  private fightReturn?: [number, number];
  private follower?: Phaser.GameObjects.Image;
  private followerShadow?: Phaser.GameObjects.Image;
  private trail: Pt[] = [];
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

    // NPCs (the guild master stands by the Guild Hall once he has stopped you)
    this.npcs = {};
    for (const n of R.npcs ?? []) {
      const at: Pt = n.id === 'halvard' && State.flag('briefed') ? [1236, 432] : n.at;
      const sh = this.add.image(at[0], at[1], 'shadow').setAlpha(0.8);
      const spr = this.add.sprite(at[0], at[1], n.sprite, 0).setOrigin(0.5, 0.98);
      spr.play(n.sprite);
      const sc = this.scaleAt(at[1]);
      spr.setScale(sc);
      sh.setScale(sc * 0.75, sc * 0.8);
      spr.setData('shadow', sh);
      this.npcs[n.id] = spr;
      this.ySortedObjs.push({ obj: spr, base: 0 });
      this.interacts.push({ obj: spr, x: at[0], y: at[1], r: 70, promptY: at[1] - 176 * sc - 16, run: () => this.talkNpc(n.id, spr) });
    }
    // The chosen hatchling follows a few steps behind.
    this.trail = [];
    this.follower = undefined;
    const st = this.starterKey();
    if (st) {
      this.followerShadow = this.add.image(at[0], at[1], 'shadow').setAlpha(0.7);
      this.follower = this.add.image(at[0] - 20, at[1], st).setOrigin(0.5, 0.96);
      this.follower.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      this.ySortedObjs.push({ obj: this.follower, base: 0 });
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
      const run = () => {
        if (t.id === 'guild' && State.flag('briefed') && !State.flag('hasStarter')) return this.openHatchery();
        if (R.id === 'dundean_square' && t.id === 'lodge') return this.say(t.lines.map((text) => ({ text })), () => this.openShop());
        this.say(t.lines.map((text) => ({ text, speaker: t.speaker, portrait: t.portrait })));
      };
      this.interacts.push({ x: t.at[0], y: t.at[1], r: t.r, promptY: t.at[1] - 70, run });
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

    this.events.off('starterChosen');
    this.events.on('starterChosen', (id: string) => this.onStarter(id));

    const entry = EXPANSION_STORY.room_entries[R.id] ?? MISSIONS?.room_entries[R.id];
    if (entry?.length && !State.flag('entered_' + R.id)) {
      State.setFlag('entered_' + R.id);
      this.busy = true;
      this.time.delayedCall(700, () => this.say(this.toLines(entry)));
    }

    if (data.fresh) {
      this.busy = true;
      this.time.delayedCall(900, () => this.say(scene('wake_aftermath')));
    }
  }

  private starterKey(): string | undefined {
    const s = State.get().starter;
    if (!s) return undefined;
    const key = 'starter_' + s.id + (s.evolved ? '_evo' : '');
    return this.textures.exists(key) ? key : 'starter_' + s.id;
  }

  private updateFollower() {
    const f = this.follower;
    if (!f) return;
    const p = this.player;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 4) this.trail.push([p.x, p.y]);
    if (this.trail.length > 14) this.trail.shift();
    const target = this.trail.length >= 14 ? this.trail[0] : [p.x - 26, p.y + 2];
    f.x += (target[0] - f.x) * 0.25;
    f.y += (target[1] - f.y) * 0.25;
    const sc = this.scaleAt(f.y) / 0.45;
    f.setScale(Math.max(0.3, (52 / f.height) * sc));
    if (target[0] < f.x - 1) f.setFlipX(false);
    else if (target[0] > f.x + 1) f.setFlipX(true);
    this.followerShadow?.setPosition(f.x, f.y).setScale(0.5 * sc, 0.5 * sc).setDepth(9 + f.y);
  }

  private onStarter(id: string) {
    const s = State.get();
    s.starter = { id, evolved: false };
    State.setFlag('hasStarter');
    const st = STARTERS.find((x) => x.id === id);
    if (st) State.record(id).seen = true;
    State.addItem('manual', 1);
    State.addItem('guide', 1);
    State.addItem('map', 1);
    State.addItem('orb', 3);
    State.addItem('silver_card', 1);
    this.controls.reset();
    // Hatchling appears beside the hero right away.
    const key = this.starterKey()!;
    this.followerShadow = this.add.image(this.player.x, this.player.y, 'shadow').setAlpha(0.7);
    this.follower = this.add.image(this.player.x - 26, this.player.y, key).setOrigin(0.5, 0.96);
    this.follower.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.ySortedObjs.push({ obj: this.follower, base: 0 });
    sparkleBurst(this, this.follower.x, this.follower.y - 30, 16, 3600, 70);
    this.cameras.main.fadeIn(500);
    this.say([...scene('after_choice'), ...scene('items_handover'), { text: '* (You also received 3 Capture Cards and a Silver Card. Use them from MERCY > Capture.)' }]);
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
    this.updateFollower();
    for (const o of this.ySortedObjs) o.obj.setDepth(10 + o.obj.y);
    for (const n of Object.values(this.npcs)) (n.getData('shadow') as Phaser.GameObjects.Image | undefined)?.setPosition(n.x, n.y).setDepth(9 + n.y);
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
      if (it.obj) {
        it.promptY += it.obj.y - it.y;
        it.x = it.obj.x;
        it.y = it.obj.y;
      }
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
          this.say(e.locked === 'hasStarter' ? scene('locked_gate_before_starter') : (e.lockedText ?? ['* It won\'t budge.']).map((text) => ({ text })));
          return true;
        }
        this.travel(e.to, e.spawn);
        return true;
      }
    }
    for (const t of this.room.triggers ?? []) {
      if (State.flag(t.once)) continue;
      if (t.requires && !State.flag(t.requires)) continue;
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
    const depth = 1 - Phaser.Math.Clamp(this.player.y / this.room.size[1], 0, 1);
    const id = rollEncounter(enc.table, depth);
    if (!id) return false;
    this.startBattle(id);
    return true;
  }

  startBattle(monster: string, wave?: Wave) {
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
    this.tweens.add({ targets: bang, scale: 1, duration: 160, ease: 'Cubic.easeOut' });
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
            this.scene.launch('Battle', { monster, room: this.room.id, wave });
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
    if (result.fight) return this.afterMissionFight(result);
    if (result.monster === 'lich') {
      State.setFlag('metLich');
      this.say(scene(result.outcome === 'won' ? 'after_lich_won' : 'after_lich_peace'));
    }
    if (result.monster === 'orochi') {
      // Not an ending: the Waystone falls quiet and the roads beyond open.
      State.setFlag('orochiDone');
      const peaceful = result.outcome !== 'won';
      State.setFlag(peaceful ? 'orochiSpared' : 'orochiSlain');
      this.busy = true;
      this.time.delayedCall(500, () => this.afterOrochi(peaceful));
    }
  }

  private toLines(lines: { speaker: string; portrait: string; text: string }[]): Line[] {
    return lines.map((l) => ({
      text: l.text.replace(/\{HERO\}/g, State.get().name),
      speaker: l.speaker || undefined,
      portrait: l.portrait && l.portrait !== 'none' ? l.portrait : undefined,
      voice: l.portrait === 'mon_divine' ? 0.6 : l.portrait === 'hero_portrait' ? 0.95 : 0.85,
    }));
  }

  private afterOrochi(peaceful: boolean) {
    const W = this.scale.width;
    const lines = this.toLines(peaceful ? EXPANSION_STORY.after_orochi_peace : EXPANSION_STORY.after_orochi_won);
    const fallback: Line[] = [{ text: '* The Waystone falls silent. Both roads beyond the fork lie open.' }];
    if (!peaceful) return this.say(lines.length ? lines : fallback);
    // Divine descends over the fork for a moment, then is gone.
    const divine = this.add.image(W / 2, 40, 'mon_divine').setScrollFactor(0).setDepth(4600).setBlendMode(Phaser.BlendModes.SCREEN).setAlpha(0);
    divine.setScale(360 / divine.height);
    const halo = this.add.image(W / 2, 150, 'glow').setScrollFactor(0).setDepth(4599).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff4dc).setScale(3).setAlpha(0);
    this.tweens.add({ targets: divine, alpha: 0.95, y: 230, duration: 2200, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: halo, alpha: 0.35, duration: 2200 });
    Sound.chime();
    this.time.delayedCall(2300, () =>
      this.say(lines.length ? lines : fallback, () => {
        this.tweens.add({ targets: [divine, halo], alpha: 0, y: '-=60', duration: 1600, onComplete: () => { divine.destroy(); halo.destroy(); } });
        sparkleBurst(this, this.player.x, this.player.y - 60, 20, 3600, 120);
      }),
    );
  }

  private runTrigger(id: string) {
    if (id.startsWith('m:')) return this.missionFight(id.slice(2));
    if (id === 'gm_stop') {
      // Master Halvard crosses the plaza to block the stairs.
      this.busy = true;
      this.player.anims.stop();
      this.dir = 'up';
      this.player.setFrame(this.frameFor('up'));
      const gm = this.npcs.halvard;
      const finish = () =>
        this.say(scene('guildmaster_stops_you'), () => {
          State.setFlag('briefed');
          if (gm) {
            gm.play('guildmaster_idle');
            this.tweens.add({ targets: gm, x: 1236, y: 432, duration: 2200, ease: 'Sine.easeInOut' });
          }
        });
      if (!gm) return finish();
      gm.anims.stop();
      gm.setFrame(2);
      this.tweens.add({ targets: gm, x: this.player.x + 70, y: this.player.y - 40, duration: 1200, ease: 'Sine.easeInOut', onComplete: finish });
      return;
    }
    if (id === 'gate_sign') {
      State.setFlag('gateSign');
      this.say(scene('gate_guard_or_sign'));
      return;
    }
    if (id === 'lich') {
      this.busy = true;
      this.cameras.main.shake(300, 0.004);
      this.say(scene('lich_encounter'), () => this.startBattle('lich'));
    }
    if (id === 'orochi') {
      this.busy = true;
      Sound.stopMusic(0.5);
      this.cameras.main.shake(900, 0.008);
      this.say(scene('orochi_awakens'), () => this.startBattle('orochi'));
    }
  }

  /** Inside the Guild Hall: the hatchery. */
  private openHatchery() {
    this.say(scene('guild_hall_choice_intro'), () => {
      this.time.delayedCall(80, () => {
        this.busy = true;
        this.scene.launch('Hatchling');
        this.scene.pause();
      });
    });
  }

  private talkNpc(id: string, spr: Phaser.GameObjects.Sprite) {
    if (id === 'halvard') {
      if (!State.flag('briefed')) return this.say([{ text: 'Not now, Kael. Stay by the fountain.', speaker: STORY.names.guild_master, portrait: 'guildmaster_portrait', voice: 0.7 }]);
      if (!State.flag('hasStarter')) return this.openHatchery();
      return this.say([{ text: 'The West Gate is open. Read the manual. And send word.', speaker: STORY.names.guild_master, portrait: 'guildmaster_portrait', voice: 0.7 }]);
    }
    const mission = Quests.givenBy(id);
    if (mission && MISSIONS && this.missionTalk(id, mission)) return;
    const ex = EXPANSION_STORY.npc_dialogue[id];
    if (ex) {
      const flag = 'met_' + id;
      if (!State.flag(flag)) {
        State.setFlag(flag);
        return this.say(this.toLines(ex.first));
      }
      const line = ex.repeat[Phaser.Math.Between(0, Math.max(0, ex.repeat.length - 1))] ?? '...';
      return this.say([{ text: line, speaker: ex.name, portrait: ex.portrait, voice: 0.85 }]);
    }
    if (id !== 'wren') return;
    spr.anims.stop();
    spr.setFrame(2);
    const after = () => spr.play('wren_idle');
    if (!State.flag('metWren')) {
      State.setFlag('metWren');
      return this.say(scene('wren_first'), after);
    }
    const hint = scene(`wren_hint_${Phaser.Math.Between(1, 3)}`);
    this.say(hint.length ? hint : scene('wren_hint_1'), after);
  }

  // ---- missions --------------------------------------------------------------
  /** Talk to a mission giver. Returns false when the mission has nothing to say (fall back to small talk). */
  private missionTalk(npc: string, m: MissionId): boolean {
    const M = MISSIONS!;
    if (!Quests.accepted(m)) {
      // first meeting: their greeting, then the request
      const ex = EXPANSION_STORY.npc_dialogue[npc];
      const greet = ex && !State.flag('met_' + npc) ? this.toLines(ex.first) : [];
      State.setFlag('met_' + npc);
      State.setFlag('quest_' + m);
      this.say([...greet, ...this.toLines(M.offer[m])], () => this.toast(`Quest: ${M.quests.find((q) => q.id === m)?.title ?? ''}`));
      return true;
    }
    if (!Quests.done(m)) {
      const w = M.waiting[m];
      const ex = EXPANSION_STORY.npc_dialogue[npc];
      this.say([{ text: w[Phaser.Math.Between(0, Math.max(0, w.length - 1))] ?? '...', speaker: ex?.name ?? npc, portrait: ex?.portrait ?? 'none', voice: 0.85 }]);
      return true;
    }
    if (!State.flag('thanked_' + m)) {
      State.setFlag('thanked_' + m);
      this.say(this.toLines(M.done[m]));
      return true;
    }
    return false;
  }

  private missionFight(fid: string) {
    const f = Quests.fight(fid);
    if (!f || !f.foes.length) return;
    this.busy = true;
    this.player.anims.stop();
    // where to put Kael back if he breaks off the fight
    this.fightReturn = this.trail[0] ? [this.trail[0][0], this.trail[0][1]] : [this.lastSafe[0], this.lastSafe[1]];
    this.cameras.main.shake(260, 0.003);
    const [first, ...rest] = f.foes;
    const wave: Wave = { fight: f.id, queue: rest, total: f.foes.length, between: f.between, tally: { won: 0, spared: 0, bound: 0 }, index: 1 };
    this.say(this.toLines(f.before), () => this.startBattle(first, wave));
  }

  private afterMissionFight(result: BattleResult) {
    const f = Quests.fight(result.fight!);
    if (!f) return;
    if (result.outcome === 'fled') {
      if (this.fightReturn) this.player.setPosition(this.fightReturn[0], this.fightReturn[1]);
      this.applyScale();
      this.say([{ text: '* You fall back into the dark. They are still there, waiting.' }]);
      return;
    }
    State.setFlag('fight_' + f.id);
    this.busy = true;
    const lines = this.toLines(f.after);
    const m = f.mission;
    const finished = Quests.done(m);
    const M = MISSIONS!;
    this.time.delayedCall(400, () =>
      this.say(lines, () => {
        if (!finished) return;
        // the mission's fragment of the torn formula
        const fr = M.fragments[m];
        State.addItem(fr.item, 1);
        Sound.save();
        const other = M.fragments[m === 'blood' ? 'wind' : 'blood'];
        const both = (State.get().inventory[other.item] ?? 0) > 0;
        this.say([...this.toLines(fr.found), { text: `* (You got the ${fr.item_name}.)` }], () => {
          if (!both) return;
          State.useItem(fr.item);
          State.useItem(other.item);
          State.addItem(M.formula.item, 1);
          State.setFlag('formulaJoined');
          this.say([...this.toLines(M.formula.joined), { text: `* (The two fragments became the ${M.formula.item_name}. Read it from the Satchel.)` }]);
        });
      }),
    );
  }

  /** The quartermaster at the Dundean hunters' lodge: capture cards and tonics, for gold. */
  private openShop(greeted = false) {
    const STOCK = [
      { item: 'orb', price: 25 },
      { item: 'silver_card', price: 120 },
      { item: 'tonic', price: 20 },
    ];
    const s = State.get();
    const ask = greeted ? '* Anything else?' : `* The quartermaster looks up. "Cards and tonics. Gold only."`;
    const prices = STOCK.map((x) => `${ITEMS[x.item].name} ${x.price} G`).join('  ·  ');
    this.say(
      [
        { text: ask, speaker: 'Quartermaster', portrait: 'none' },
        { text: `* ${prices}\n* (You have ${s.gold} G.)`, choices: ['Capture Card', 'Silver Card', 'Tonic', 'Leave'] },
      ],
      (c) => {
        const x = STOCK[c];
        if (!x) return;
        if (s.gold < x.price) {
          Sound.cancel();
          return this.say([{ text: '* "Come back with the gold."', speaker: 'Quartermaster', portrait: 'none' }], () => this.openShop(true));
        }
        s.gold -= x.price;
        State.addItem(x.item, 1);
        Sound.save();
        this.say([{ text: `* (You bought a ${ITEMS[x.item].name}. ${s.gold} G left.)` }], () => this.openShop(true));
      },
    );
  }

  /** A short banner, e.g. when a quest is accepted. */
  private toast(text: string) {
    const t = label(this, this.scale.width / 2, 120, text, 26, COLORS.gold, 6).setOrigin(0.5).setScrollFactor(0).setDepth(9000).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: 104, duration: 300, yoyo: true, hold: 1800, onComplete: () => t.destroy() });
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
      { text: '* The candle burns steady in the wind, as if it has been waiting.' },
      { text: '* In its small light, your resolve hardens.' },
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
