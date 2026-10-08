import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { ROOMS, RoomDef, Dir, Pt, rollGroup } from '../data/rooms';
import { loadRoomArt } from '../assets';
import { State } from '../state';
import { Dialogue, Line } from '../ui/Dialogue';
import { Controls } from '../ui/input';
import { fireflies, lightPool, sparkleBurst } from '../ui/fx';
import { label, title, COLORS } from '../ui/widgets';
import { scene } from '../data/script';
import { STARTERS } from '../data/starters';
import { ITEMS, MONSTERS as MONSTERS_BY_ID } from '../data/monsters';
import { STORY } from '../data/story';
import { EXPANSION_STORY } from '../data/expansion';
import { MISSIONS } from '../data/missions';
import { REGION_STORY, REGION_UNLOCKS } from '../data/regions';
import type { MissionId } from '../data/missionTypes';
import { Quests } from '../quests';
import { BOUNTIES } from '../data/bounties';
import type { Bounty } from '../data/bountyTypes';
import { newPartyMon } from '../battle/units';
import type { BattleStart } from './BattleScene';

interface WorldData {
  room?: string;
  spawn?: string;
  at?: Pt;
  fresh?: boolean;
  debug?: boolean;
}

// Villager dialogue from every generated region (past the Waystone, and through the old frontiers).
const npcLines = { ...EXPANSION_STORY.npc_dialogue, ...REGION_STORY.npc_dialogue };

export interface BattleResult {
  monster: string;
  outcome: 'won' | 'spared' | 'bound' | 'fled' | 'lost';
  fight?: string; // set for a mission group or a bounty team
  tally?: WaveTally; // every foe of the battle
}

export interface WaveTally {
  won: number;
  spared: number;
  bound: number;
}

/** Extras for a battle beyond its foes (see BattleStart). */
type BattleOpts = Omit<BattleStart, 'foes' | 'room' | 'debug'>;

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
  private trail: Pt[] = [];
  private timeAcc = 0;
  private saveAcc = 0;
  private hold = false;
  private busyFor = 0;

  constructor() {
    super('World');
  }

  init(data: WorldData) {
    this.dataIn = data ?? {};
  }

  preload() {
    const id = this.dataIn.room ?? State.get().room ?? 'plaza';
    loadRoomArt(this, [(ROOMS[id] ?? ROOMS.plaza).bg]);
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
    // Occluders: tall painted objects cut from the painting and drawn above the player when he is behind them.
    (R.occluders ?? []).forEach((o, i) => {
      const xs = o.poly.map((p) => p[0]);
      const ys = o.poly.map((p) => p[1]);
      const x0 = Math.floor(Math.min(...xs));
      const y0 = Math.floor(Math.min(...ys));
      const w = Math.ceil(Math.max(...xs)) - x0;
      const h = Math.ceil(Math.max(...ys)) - y0;
      const key = `occ_${R.id}_${i}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const c = this.textures.createCanvas(key, w, h);
      if (!c) return;
      const ctx = c.getContext();
      ctx.beginPath();
      o.poly.forEach(([x, y], k) => (k ? ctx.lineTo(x - x0, y - y0) : ctx.moveTo(x - x0, y - y0)));
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(this.textures.get(R.bg).getSourceImage() as HTMLImageElement, -x0, -y0);
      c.refresh();
      this.add.image(x0, y0, key).setOrigin(0).setDepth(10 + o.base);
    });
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

    // NPCs (once the guild master has stopped Kael he waits inside the Guild Hall)
    this.npcs = {};
    for (const n of R.npcs ?? []) {
      if (n.id === 'halvard' && State.flag('briefed')) continue;
      const at: Pt = n.at;
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
    // Monsters never walk the overworld beside Kael; they appear only in battle and in the menu.
    this.trail = [];
    // Candles (save points). Each starts unlit; once Kael lights it, it stays lit and is a waypoint.
    for (const c of R.candles ?? []) {
      const lit = State.flag('candle_' + c.id);
      const sc = this.scaleAt(c.at[1]) * 0.72;
      const img = this.add.image(c.at[0], c.at[1], 'ui_' + c.kind + (lit ? '' : '_unlit')).setOrigin(0.5, 1).setScale(sc);
      const glow = lightPool(this, c.at[0], c.at[1] - img.displayHeight * 0.85, 70, 0xffc070, true, 3).setVisible(lit);
      this.add.image(c.at[0], c.at[1], 'shadow').setScale(sc * 0.6, sc * 0.5).setDepth(c.at[1] - 1);
      this.ySortedObjs.push({ obj: img, base: 0 });
      const run = () => this.useCandle(img, glow, c);
      this.interacts.push({ x: c.at[0], y: c.at[1], r: 64, promptY: c.at[1] - img.displayHeight - 18, run });
      // a click or tap on the candle works too, once Kael is standing by it
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.busy || this.dialogue.active || Math.hypot(this.player.x - c.at[0], this.player.y - c.at[1]) > 110) return;
        run();
      });
    }
    for (const t of R.things ?? []) {
      const run = () => {
        if (t.id === 'guild' && State.flag('briefed') && !State.flag('hasStarter')) return this.openHatchery();
        if (t.id === 'guild' && State.flag('hasStarter')) return this.say([{ text: 'The West Gate is open. Read the manual. And send word.', speaker: STORY.names.guild_master, portrait: 'guildmaster_portrait', voice: 0.7 }]);
        if (BOUNTIES.some((b) => b.giver === `thing:${R.id}/${t.id}`) && this.bountyTalk(`thing:${R.id}/${t.id}`, t.lines)) return;
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

    // Progress is kept as you play: on arriving in a room, every few seconds, and when the page is hidden or closed.
    this.saveAcc = 0;
    this.busyFor = 0;
    this.hold = false;
    if (!WorldScene.hooked) {
      WorldScene.hooked = true;
      const flush = () => {
        const w = this.game.scene.getScene('World') as WorldScene;
        if (w.sys.settings.status >= Phaser.Scenes.RUNNING && w.sys.settings.status <= Phaser.Scenes.SLEEPING) w.autosave();
      };
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
    }
    this.autosave();

    const entry = EXPANSION_STORY.room_entries[R.id] ?? MISSIONS?.room_entries[R.id] ?? REGION_STORY.room_entries[R.id];
    if (entry?.length && !State.flag('entered_' + R.id)) {
      State.setFlag('entered_' + R.id);
      this.busy = true;
      this.time.delayedCall(700, () => this.say(this.toLines(entry)));
    }

    // An accepted bounty whose criminal waits here: they step out as Kael arrives.
    const ambush = BOUNTIES.find((b) => b.room === R.id && State.flag('bounty_' + b.id) && !State.flag('bounty_done_' + b.id));
    if (ambush) {
      this.busy = true;
      this.time.delayedCall(entry?.length && !State.flag('ambushed_' + ambush.id) ? 1400 : 700, () => this.bountyFight(ambush));
    }

    if (data.fresh) {
      this.busy = true;
      this.time.delayedCall(900, () => this.say(scene('wake_aftermath')));
    }
  }

  private static hooked = false;

  /** Write the run to the save slot with Kael where he stands (debug starts never touch the slot). */
  autosave() {
    if (this.dataIn.debug || !this.player || !this.room) return;
    const s = State.get();
    s.room = this.room.id;
    // Inside a trigger (its scene or fight still running), keep the last spot outside it, so Continue never lands in it.
    if (this.canStand(this.player.x, this.player.y) && !this.pendingTrigger(this.player.x, this.player.y)) {
      s.x = Math.round(this.player.x);
      s.y = Math.round(this.player.y);
    }
    State.save();
  }

  /** Kael's last few steps, so a broken-off fight can put him back where he came from. */
  private trackTrail() {
    const p = this.player;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 4) this.trail.push([p.x, p.y]);
    if (this.trail.length > 14) this.trail.shift();
  }

  private onStarter(id: string) {
    const s = State.get();
    s.starter = { id, evolved: false };
    State.setFlag('hasStarter');
    const st = STARTERS.find((x) => x.id === id);
    if (st) State.record(id).seen = true;
    // The hatchling is Kael's first monster: it fights for him from now on.
    if (!State.get().monsters.some((m) => m.starter)) State.addMonster(newPartyMon(id, 1, true));
    State.addItem('manual', 1);
    State.addItem('guide', 1);
    State.addItem('map', 1);
    State.addItem('orb', 3);
    State.addItem('silver_card', 1);
    this.controls.reset();
    sparkleBurst(this, this.player.x, this.player.y - 60, 16, 3600, 70);
    this.cameras.main.fadeIn(500);
    this.autosave();
    this.say([...scene('after_choice'), ...scene('items_handover'), { text: '* (You also received 3 Capture Cards and a Silver Card. Use them from your portrait in battle: Capture.)' }], () => this.autosave());
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
    this.trackTrail();
    for (const o of this.ySortedObjs) o.obj.setDepth(10 + o.obj.y);
    for (const n of Object.values(this.npcs)) (n.getData('shadow') as Phaser.GameObjects.Image | undefined)?.setPosition(n.x, n.y).setDepth(9 + n.y);
    this.shadow.setDepth(9 + this.player.y);
    if (this.controls.pressed('debug')) this.toggleDebug();
    if (this.dialogue.active) {
      this.busyFor = 0;
      this.dialogue.update(dt);
      return;
    }
    if (this.hold) return;
    if (this.busy) {
      // Watchdog: nothing on screen is holding Kael (no dialogue, no other screen, no fade, nobody walking),
      // yet input is still locked. Give control back rather than leave the game frozen.
      const holding = this.game.scene.getScenes(true).some((sc) => sc !== this) || this.cameras.main.fadeEffect.isRunning || this.tweens.getTweensOf([this.player, ...Object.values(this.npcs)]).length > 0;
      this.busyFor = holding ? 0 : this.busyFor + dt;
      if (this.busyFor > 5000) {
        this.busyFor = 0;
        this.busy = false;
        this.controls.reset();
      }
      return;
    }
    this.busyFor = 0;
    this.saveAcc += dt;
    if (this.saveAcc > 10000) {
      this.saveAcc = 0;
      this.autosave();
    }

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
      const len = Math.max(1, Math.hypot(ax.x, ax.y)); // keyboard diagonals normalise; a half-pushed stick walks slower
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
    const t = this.pendingTrigger(p.x, p.y);
    if (t) {
      this.runTrigger(t.id);
      return true;
    }
    return false;
  }

  /** The not-yet-fired trigger whose rect holds (x, y), if any. */
  private pendingTrigger(px: number, py: number) {
    return (this.room.triggers ?? []).find((t) => {
      if (State.flag(t.once) || (t.requires && !State.flag(t.requires))) return false;
      const [x, y, w, h] = t.rect;
      return px >= x && px <= x + w && py >= y && py <= y + h;
    });
  }

  /** Halvard walks to the Guild Hall door, climbs the steps and goes inside; Kael follows by pressing Z at the door. */
  private enterGuildHall(gm: Phaser.GameObjects.Sprite) {
    this.busy = true;
    gm.play('guildmaster_idle');
    this.walkTo(gm, 1230, 394, 120, () => {
      const sh = gm.getData('shadow') as Phaser.GameObjects.Image | undefined;
      this.tweens.add({ targets: [gm, sh].filter(Boolean), y: 318, alpha: 0, duration: 1100, ease: 'Sine.easeIn' });
      this.tweens.add({ targets: gm, scale: gm.scale * 0.92, duration: 1100 });
      Sound.whoosh();
      this.time.delayedCall(1150, () => {
        this.interacts = this.interacts.filter((i) => i.obj !== gm);
        this.ySortedObjs = this.ySortedObjs.filter((o) => o.obj !== gm);
        delete this.npcs.halvard;
        sh?.destroy();
        gm.destroy();
        this.busy = false;
        this.say([{ text: '* The Guild Hall door closes behind him. The lamp above it is still lit.' }]);
      });
    });
  }

  /** Walk a scripted character along the walkable floor (grid A* around blocks), never through scenery. */
  private walkTo(spr: Phaser.GameObjects.Sprite, tx: number, ty: number, speed: number, done?: () => void) {
    const st = 16;
    const [W, H] = this.room.size;
    const free = (cx: number, cy: number) => {
      const x = cx * st + st / 2;
      const y = cy * st + st / 2;
      const hw = 12 * (this.scaleAt(y) / 0.45);
      return this.walkable(x, y) && this.walkable(x - hw, y) && this.walkable(x + hw, y);
    };
    const key = (x: number, y: number) => y * 10000 + x;
    const sx = Math.floor(spr.x / st), sy = Math.floor(spr.y / st);
    const gx = Math.floor(tx / st), gy = Math.floor(ty / st);
    const open: [number, number, number][] = [[sx, sy, 0]];
    const from = new Map<number, number>([[key(sx, sy), -1]]);
    const cost = new Map<number, number>([[key(sx, sy), 0]]);
    let found = false;
    while (open.length && from.size < 60000) {
      open.sort((a, b) => a[2] - b[2]);
      const [cx, cy] = open.shift()!;
      if (cx === gx && cy === gy) { found = true; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx * st > W || ny * st > H) continue;
        if (!(nx === gx && ny === gy) && !free(nx, ny)) continue;
        const c = cost.get(key(cx, cy))! + (dx && dy ? 1.414 : 1);
        if (c < (cost.get(key(nx, ny)) ?? Infinity)) {
          cost.set(key(nx, ny), c);
          from.set(key(nx, ny), key(cx, cy));
          open.push([nx, ny, c + Math.hypot(gx - nx, gy - ny)]);
        }
      }
    }
    const pts: [number, number][] = [];
    if (found) {
      for (let k = key(gx, gy); k !== -1 && k !== key(sx, sy); k = from.get(k)!) pts.unshift([(k % 10000) * st + st / 2, Math.floor(k / 10000) * st + st / 2]);
      pts[pts.length - 1] = [tx, ty];
    } else pts.push([tx, ty]);
    // keep every 3rd point so the walk is smooth, then tween leg by leg
    const legs = pts.filter((_, i) => i % 3 === 2 || i === pts.length - 1);
    let px = spr.x, py = spr.y;
    const chain = legs.map(([x, y]) => {
      const d = Math.hypot(x - px, y - py);
      px = x; py = y;
      return { x, y, duration: Math.max(60, (d / speed) * 1000), ease: 'Linear' };
    });
    if (!chain.length) return done?.();
    this.tweens.chain({ targets: spr, tweens: chain, onComplete: () => done?.() });
  }

  /** The walkable point nearest (x, y), so people who walk up to Kael never end up standing on scenery. */
  private standNear(x: number, y: number): [number, number] {
    if (this.canStand(x, y)) return [x, y];
    for (let r = 12; r < 260; r += 12)
      for (let k = 0; k < 24; k++) {
        const px = x + r * Math.cos((k * Math.PI) / 12);
        const py = y + r * Math.sin((k * Math.PI) / 12);
        if (this.canStand(px, py) && Math.hypot(px - this.player.x, py - this.player.y) > 40) return [px, py];
      }
    return [this.player.x + 60, this.player.y];
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
    const g = rollGroup(enc.table, depth);
    if (!g) return false;
    // a wild group never outnumbers the monsters Kael puts on the field (a lone hatchling meets lone foes);
    // a fainted party slot counts when a living bench monster will step into it at the start
    const mons = State.partyMons().slice(0, 3);
    const up = mons.filter((m) => m.hp > 0).length;
    const ready = State.bench().filter((m) => m.hp > 0).length;
    const standing = up + Math.min(mons.length - up, ready);
    this.startBattle(g.foes.slice(0, Math.max(1, standing)), { nocap: g.nocap });
    return true;
  }

  /** DIB team battle: up to three foes on the field, the rest of the list stepping in as slots free up. */
  startBattle(foes: string[], opts: BattleOpts = {}) {
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
            const start: BattleStart = { foes, room: this.room.id, ...opts };
            this.scene.launch('Battle', start);
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
    this.afterBattle(result);
    // Keep the outcome at once (story flags, captures, EXP), with Kael already stepped back out of
    // any trigger, so a loss in the next wild fight never undoes it.
    this.autosave();
  }

  private afterBattle(result: BattleResult) {
    if (result.fight?.startsWith('bounty:')) return this.afterBounty(result);
    if (result.fight) return this.afterMissionFight(result);
    if (REGION_STORY.bosses[result.monster]) return this.afterRegionBoss(result);
    if ((result.monster === 'lich' || result.monster === 'orochi') && result.outcome === 'fled') {
      // breaking off is no ending: Kael steps back out of the trigger and it waits for him
      if (this.fightReturn) this.player.setPosition(this.fightReturn[0], this.fightReturn[1]);
      this.applyScale();
      this.say([{ text: '* You back away. It does not follow. It does not need to.' }]);
      return;
    }
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
    if (id.startsWith('b:')) return this.regionBoss(id.slice(2));
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
          if (gm) this.enterGuildHall(gm);
        });
      if (!gm) return finish();
      gm.anims.stop();
      gm.setFrame(2);
      const [tx, ty] = this.standNear(this.player.x + 70, this.player.y - 40);
      this.walkTo(gm, tx, ty, 150, finish);
      return;
    }
    if (id === 'gate_sign') {
      State.setFlag('gateSign');
      this.say(scene('gate_guard_or_sign'));
      return;
    }
    if (id === 'lich') {
      this.busy = true;
      this.fightReturn = this.trail[0] ? [this.trail[0][0], this.trail[0][1]] : [this.lastSafe[0], this.lastSafe[1]];
      this.cameras.main.shake(300, 0.004);
      this.say(scene('lich_encounter'), () => this.startBattle(['lich']));
    }
    if (id === 'orochi') {
      this.busy = true;
      this.fightReturn = this.trail[0] ? [this.trail[0][0], this.trail[0][1]] : [this.lastSafe[0], this.lastSafe[1]];
      Sound.stopMusic(0.5);
      this.cameras.main.shake(900, 0.008);
      this.say(scene('orochi_awakens'), () => this.startBattle(['orochi']));
    }
  }

  /** Inside the Guild Hall: the hatchery. */
  private openHatchery() {
    this.say(scene('guild_hall_choice_intro'), () => {
      // hold Kael still (a mashed Z must not reopen the door) while the box fades, then open the Hatchery
      this.hold = true;
      this.time.delayedCall(200, () => {
        this.hold = false;
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
    if (this.bountyTalk(id)) return;
    const ex = npcLines[id];
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
      const ex = npcLines[npc];
      const greet = ex && !State.flag('met_' + npc) ? this.toLines(ex.first) : [];
      State.setFlag('met_' + npc);
      State.setFlag('quest_' + m);
      this.say([...greet, ...this.toLines(M.offer[m])], () => this.toast(`Quest: ${M.quests.find((q) => q.id === m)?.title ?? ''}`));
      return true;
    }
    if (!Quests.done(m)) {
      const w = M.waiting[m];
      const ex = npcLines[npc];
      this.say([{ text: w[Phaser.Math.Between(0, Math.max(0, w.length - 1))] ?? '...', speaker: ex?.name ?? npc, portrait: ex?.portrait ?? 'none', voice: 0.85 }]);
      return true;
    }
    if (!State.flag('thanked_' + m)) {
      State.setFlag('thanked_' + m);
      // the reward may include lifting a barrier on one of the old frontier roads
      const lifted = REGION_UNLOCKS.filter((u) => u.requires === 'thanked_' + m).flatMap((u) => REGION_STORY.unlock_lines[u.exitTo] ?? []);
      this.say([...this.toLines(M.done[m]), ...this.toLines(lifted)]);
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
    this.say(this.toLines(f.before), () => this.startBattle([...f.foes], { fight: f.id, between: [...f.between] }));
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

  // ---- bounties: criminals and rogue tamers ------------------------------------------
  /** Offer the next open bounty from this giver, or close a finished one. False if there is nothing. */
  private bountyTalk(giver: string, intro?: string[]): boolean {
    const mine = BOUNTIES.filter((b) => b.giver === giver);
    const finished = mine.find((b) => State.flag('bounty_done_' + b.id) && !State.flag('bounty_paid_' + b.id));
    if (finished) {
      State.setFlag('bounty_paid_' + finished.id);
      this.say(this.toLines(finished.done));
      return true;
    }
    const open = mine.find((b) => !State.flag('bounty_' + b.id) && (!b.requires || State.flag(b.requires)));
    if (!open) return false;
    const pre = intro ? intro.map((text) => ({ text })) : [];
    this.say([...pre, ...this.toLines(open.offer), { text: `* Take the bounty? (${open.title})`, choices: ['Take it', 'Not now'] }], (c) => {
      if (c !== 0) return;
      State.setFlag('bounty_' + open.id);
      this.toast(`Bounty: ${open.title}`);
    });
    return true;
  }

  private bountyFight(b: Bounty) {
    if (!b.team.length || !MONSTERS_BY_ID[b.team[0]]) return;
    State.setFlag('ambushed_' + b.id);
    this.busy = true;
    this.player.anims.stop();
    this.fightReturn = [this.player.x, this.player.y];
    this.cameras.main.shake(220, 0.003);
    this.say(this.toLines(b.confront), () => this.startBattle([...b.team], { fight: 'bounty:' + b.id, owner: b.criminal, between: [...b.between] }));
  }

  private afterBounty(result: BattleResult) {
    const b = BOUNTIES.find((x) => 'bounty:' + x.id === result.fight);
    if (!b) return;
    if (result.outcome === 'fled') {
      this.say([{ text: `* You break away. ${b.criminal} lets you go, for now.` }]);
      return;
    }
    State.setFlag('bounty_done_' + b.id);
    const s = State.get();
    s.gold += b.reward.gold;
    for (const [k, n] of Object.entries(b.reward.items)) State.addItem(k, n);
    const got = [`${b.reward.gold} G`, ...Object.entries(b.reward.items).map(([k, n]) => `${ITEMS[k]?.name ?? k} x${n}`)].join(', ');
    this.busy = true;
    this.time.delayedCall(400, () => this.say([...this.toLines(b.after), { text: `* (Bounty paid: ${got}.)` }]));
  }

  // ---- Dragon Overlords and other region bosses -----------------------------------
  private regionBoss(id: string) {
    const b = REGION_STORY.bosses[id];
    if (!b || !MONSTERS_BY_ID[id]) return;
    this.busy = true;
    this.fightReturn = this.trail[0] ? [this.trail[0][0], this.trail[0][1]] : [this.lastSafe[0], this.lastSafe[1]];
    Sound.stopMusic(0.5);
    this.cameras.main.shake(700, 0.006);
    this.say(this.toLines(b.before), () => this.startBattle([id]));
  }

  private afterRegionBoss(result: BattleResult) {
    const b = REGION_STORY.bosses[result.monster];
    if (result.outcome === 'fled') {
      if (this.fightReturn) this.player.setPosition(this.fightReturn[0], this.fightReturn[1]);
      this.applyScale();
      this.say([{ text: '* You back away down the path. It does not follow. It does not need to.' }]);
      return;
    }
    State.setFlag('boss_' + result.monster);
    State.setFlag(result.outcome === 'won' ? 'slain_' + result.monster : 'spared_' + result.monster);
    this.busy = true;
    this.time.delayedCall(400, () => this.say(this.toLines(result.outcome === 'won' ? b.after_won : b.after_peace)));
  }

  /** A short banner, e.g. when a quest is accepted. */
  private toast(text: string) {
    const t = label(this, this.scale.width / 2, 120, text, 26, COLORS.gold, 6).setOrigin(0.5).setScrollFactor(0).setDepth(9000).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: 104, duration: 300, yoyo: true, hold: 1800, onComplete: () => t.destroy() });
  }

  private useCandle(img: Phaser.GameObjects.Image, glow: Phaser.GameObjects.Image, c: { id: string; at: Pt; kind: string }) {
    const s = State.get();
    const first = !State.flag('candle_' + c.id);
    if (first) {
      State.setFlag('candle_' + c.id);
      img.setTexture('ui_' + c.kind);
      glow.setVisible(true);
      this.tweens.add({ targets: img, scaleX: img.scaleX * 1.08, scaleY: img.scaleY * 1.08, yoyo: true, duration: 220, ease: 'Sine.easeOut' });
    }
    s.hp = s.maxHp;
    State.healParty();
    s.room = this.room.id;
    s.x = this.player.x;
    s.y = this.player.y;
    State.save();
    Sound.save();
    sparkleBurst(this, c.at[0], c.at[1] - img.displayHeight, 18, 3600, 90);
    this.tweens.add({ targets: glow, scale: glow.scale * 1.8, yoyo: true, duration: 500 });
    this.say([
      first ? { text: '* You touch the wick. It catches, and the flame stands up straight in the wind.' } : { text: '* The candle burns steady in the wind, as if it has been waiting.' },
      { text: '* In its small light, your resolve hardens.' },
      { text: `* (Your monsters are fully restored. Progress saved — ${this.room.name}.${first ? ' If your team falls, you will wake at the nearest lit candle.' : ''})` },
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
