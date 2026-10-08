import Phaser from 'phaser';
import { loadRoomArt, PAINTED_ART } from '../assets';
import { Sound } from '../audio/Sound';
import { Caption, fitSprite, Menu, MenuItem, QueueChip, RoundDisc, speech, tealPanel } from '../battle/teamUi';
import { baseOf, ELEMENT_TINT, evolvedOf, Fighter, grantExp, hpAt, levelMul, maxHpOf, Move, movesOf, newPartyMon, rollDamage, startTu, StatKey, StatusFx, tierOf, tuCost, UnitBase } from '../battle/units';
import { CAPTURE_CARDS, CaptureCard, captureChance, ITEMS, MONSTERS, MonsterDef, Stats } from '../data/monsters';
import { ROOMS } from '../data/rooms';
import { PartyMon, State } from '../state';
import { dustify, fireflies, lightPool, popNumber, sparkleBurst } from '../ui/fx';
import { Controls } from '../ui/input';
import { Touch } from '../ui/touch';
import { Bar, body, label, panel, COLORS } from '../ui/widgets';
import type { BattleResult } from './WorldScene';

// Dragon Island Blue team battle: up to three foes against Kael's three monsters, turn order
// set by Time Units (the queue on the left), Kael commanding from his portrait box.

/** Start data for the 'Battle' scene. */
export interface BattleStart {
  foes: string[]; // MONSTERS ids; up to 3 on the field, the rest step in as reinforcements
  room?: string;
  debug?: boolean;
  nocap?: boolean; // wild ones here cannot be captured
  fight?: string; // mission / bounty id (no fleeing)
  owner?: string; // a criminal's team: "<owner>'s <monster>"
  between?: string[]; // "* " lines as reinforcements step in; {N} = foes remaining
  lv?: number; // foe level (default: from the party's level)
}

type Phase = 'busy' | 'menu' | 'target' | 'cards' | 'say' | 'pages' | 'end';
type Fate = 'won' | 'spared' | 'bound';
type TimedStatus = 'confuse' | 'sleep' | 'stun' | 'slow' | 'haste' | 'taunt' | 'stealth';

interface Status extends Record<TimedStatus, number> {
  poison: number; // TU left
  poisonDur: number;
  poisonTotal: number;
  poisonAcc: number; // damage owed, paid at the start of the unit's turn
}

interface Unit extends Fighter {
  key: string;
  side: 'ally' | 'foe';
  base: UnitBase;
  def?: MonsterDef;
  mon?: PartyMon;
  name: string;
  hp: number;
  maxHp: number;
  tu: number;
  raw: Stats;
  mods: Record<StatKey, number>;
  st: Status;
  moves: Move[];
  slot: number;
  alive: boolean;
  fate?: Fate;
  tier?: 'deity' | 'boss' | 'miniboss';
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  homeX: number;
  homeY: number;
  nameText: Phaser.GameObjects.Text;
  bar: Bar;
  hpText?: Phaser.GameObjects.Text;
  stTag: Phaser.GameObjects.Text;
  extras: Phaser.GameObjects.GameObject[];
  zone: Phaser.GameObjects.Zone;
  chip?: QueueChip;
}

interface Targeting {
  cands: Unit[];
  sel: number;
  mode: 'one' | 'two' | 'all';
  onPick: (picked: Unit[]) => void;
  onBack: () => void;
  objs: Phaser.GameObjects.GameObject[];
  cursors: Phaser.GameObjects.Image[];
}

const PANEL_Y = 506;
const GROUND_Y = 452;
const FOE_X: Record<number, number[]> = { 1: [700], 2: [520, 900], 3: [360, 700, 1040] };
const ALLY_X: Record<number, number[]> = { 1: [653], 2: [500, 806], 3: [378, 653, 928] };
const ALLY_FOOT = 640;
const QUEUE_X = 18;
const QUEUE_Y = 14;
const QUEUE_STEP = 76;
const QUEUE_MAX = 6;
const PORTRAIT = { x: 1074, y: 508, w: 198, h: 206 };
// Kael's commands open in the centre box of the panel (over the party row), never over the field.
const DOCK = { x: 236, y: PANEL_Y + 2, w: 832, h: 206 };
const D = { foe: 10, foeUi: 30, queue: 40, panel: 50, ally: 52, allyUi: 54, caption: 58, menu: 70, cursor: 80, fx: 90, num: 95, pages: 100 };

const STATUS_NAMES: Record<string, string> = { confuse: 'Confused', sleep: 'Asleep', stun: 'Stunned', slow: 'Slowed', haste: 'Hasted', poison: 'Poisoned', taunt: 'Taunting', stealth: 'Hidden' };

export class BattleScene extends Phaser.Scene {
  private controls!: Controls;
  private data0!: BattleStart;
  private roomId = 'forest';
  private debugStart = false;
  private nocap = false;
  private phase: Phase = 'busy';
  private units: Unit[] = [];
  private allFoes: Unit[] = []; // every foe that has stepped onto the field
  private reserve: string[] = []; // foes still to step in
  private foeXs: number[] = [];
  private lead?: Unit;
  private tempParty = false;
  private wroteBack = false;
  private round = 0;
  private acted = new Set<string>();
  private keySeq = 0;
  private betweenIdx = 0;
  private turnUnit?: Unit;

  private caption!: Caption;
  private disc!: RoundDisc;
  private menu?: Menu;
  private menuKind: 'ability' | 'tamer' | 'items' | '' = '';
  private abilitySel = 0;
  private tgt?: Targeting;
  private cards?: { root: Phaser.GameObjects.Container; list: { c: Phaser.GameObjects.Container; card: CaptureCard; owned: number; canBuy: boolean; usable: boolean }[]; sel: number; info: Phaser.GameObjects.Text; hint: Phaser.GameObjects.Text; actor: Unit };
  private sayT = 0;
  private sayDone: (() => void) | null = null;
  private pageState?: { root: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; pages: string[]; i: number; done: () => void };
  private activeGlow!: Phaser.GameObjects.Image;
  private tamerHint!: Phaser.GameObjects.Image;
  private sil!: Phaser.GameObjects.Image;
  private silName!: Phaser.GameObjects.Text;
  private silSub!: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  init(data: BattleStart & { monster?: string }) {
    const foes = data.foes?.length ? data.foes : data.monster ? [data.monster] : ['bat_fiend'];
    this.data0 = { ...data, foes: foes.filter((id) => MONSTERS[id]) };
    if (!this.data0.foes.length) this.data0.foes = ['bat_fiend'];
    this.nocap = !!data.nocap;
    this.roomId = data.room ?? 'forest';
    this.debugStart = !!data.debug;
  }

  preload() {
    loadRoomArt(this, [ROOMS[this.roomId]?.bg ?? 'bg_forest']);
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.controls = new Controls(this);
    // battles are played by tapping rows and creatures: the joystick steps aside until we leave
    Touch.setStick(false);
    Touch.setLayout('battle');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      Touch.setStick(true);
      Touch.setLayout('world');
    });
    this.phase = 'busy';
    this.units = [];
    this.allFoes = [];
    this.round = 0;
    this.acted = new Set();
    this.keySeq = 0;
    this.betweenIdx = 0;
    this.menu = undefined;
    this.menuKind = '';
    this.abilitySel = 0;
    this.tgt = undefined;
    this.cards = undefined;
    this.pageState = undefined;
    this.sayDone = null;
    this.turnUnit = undefined;
    this.wroteBack = false;

    const leadDef = MONSTERS[this.data0.foes[0]];
    const tint = Phaser.Display.Color.HexStringToColor(leadDef.color).color;

    // Backdrop: the room painting, kept bright and scenic as in DIB, shaded at top and ground.
    const bgKey = ROOMS[this.roomId]?.bg ?? 'bg_forest';
    const bg = this.add.image(W / 2, H * 0.4, bgKey);
    bg.setScale(Math.max(W / bg.width, H / bg.height) * 1.12);
    try {
      bg.preFX?.addBlur(0, 1, 1, 0.7);
    } catch {
      /* FX unsupported */
    }
    this.add.rectangle(0, 0, W, H, 0x050a14, 0.1).setOrigin(0);
    const shade = this.add.graphics();
    shade.fillGradientStyle(0x02050a, 0x02050a, 0x02050a, 0x02050a, 0.6, 0.6, 0, 0);
    shade.fillRect(0, 0, W, 150);
    shade.fillGradientStyle(0x02050a, 0x02050a, 0x02050a, 0x02050a, 0, 0, 0.55, 0.55);
    shade.fillRect(0, 330, W, PANEL_Y - 330);
    lightPool(this, 720, 250, 420, tint, false, 2).setAlpha(0.18);
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setAlpha(0.6).setDepth(3);
    fireflies(this, 180, 40, W - 200, 340, 14, 4, tint);

    this.buildPanel();

    // Kael's team
    let mons = State.partyMons();
    this.tempParty = false;
    if (!mons.length && this.debugStart) {
      // a debug start with no save: a full test team (debug starts never write the save slot)
      const s = State.get();
      s.starter ??= { id: 'gold_hatchling', evolved: false };
      State.addMonster(newPartyMon(s.starter.id, 5, true));
      State.addMonster(newPartyMon('snow_cub', 5));
      State.addMonster(newPartyMon('bat_squirrel', 4));
      mons = State.partyMons();
    }
    if (!mons.length) {
      // a debug start with no save: a hatchling on loan, never saved
      mons = [newPartyMon('gold_hatchling', 5, true)];
      this.tempParty = true;
    }
    if (!mons.some((m) => m.hp > 0)) mons[0].hp = 1;
    const ax = ALLY_X[Math.min(3, mons.length)];
    mons.slice(0, 3).forEach((m, i) => this.makeAlly(m, i, ax[i]));

    // The foes: three on the field, the rest wait their turn.
    const foes = this.data0.foes;
    const n = Math.min(3, foes.length);
    this.foeXs = FOE_X[n];
    for (let i = 0; i < n; i++) this.makeFoe(foes[i], i, false);
    this.reserve = foes.slice(n);
    this.lead = this.allFoes[0];
    this.showActor(this.lead);

    this.disc = new RoundDisc(this, W - 44, Touch.active ? 118 : 40, D.foeUi);
    this.disc.set(0);
    this.caption = new Caption(this, 720, 478, 900, D.caption);
    this.activeGlow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setAlpha(0).setScale(1.1, 0.5).setDepth(D.ally - 1);
    this.tweens.add({ targets: this.activeGlow, scaleX: 1.25, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });

    this.input.on('pointerdown', () => {
      if (this.phase === 'say') this.sayT = 0;
    });

    this.layoutQueue(true);
    this.cameras.main.fadeIn(350, 0, 0, 0);
    Sound.playMusic(this.allFoes.some((f) => f.tier) ? 'boss' : leadDef.music);
    this.allFoes.forEach((f, i) => {
      f.sprite.setAlpha(0).setY(f.homeY + 30);
      this.tweens.add({ targets: f.sprite, alpha: 1, y: f.homeY, duration: 600, delay: 120 + i * 110, ease: 'Cubic.easeOut', onComplete: () => this.idle(f) });
    });
    this.time.delayedCall(650, () => {
      this.caption.show(leadDef.intro);
      this.hold(2800, () => this.next());
    });
  }

  // ---- building the screen ---------------------------------------------------
  private buildPanel() {
    const W = this.scale.width;
    // Dark wood behind the three framed boxes.
    this.add.rectangle(0, PANEL_Y - 6, W, 720 - PANEL_Y + 6, 0x24160b, 1).setOrigin(0).setDepth(D.panel - 1);
    this.add.rectangle(0, PANEL_Y - 6, W, 3, 0xb08a52, 0.9).setOrigin(0).setDepth(D.panel - 1);
    this.add.rectangle(0, PANEL_Y - 3, W, 3, 0x0d0804, 0.9).setOrigin(0).setDepth(D.panel - 1);
    // the left box is the brighter DIB teal, so the dark ghost of whoever acts reads clearly on it
    tealPanel(this, 8, PANEL_Y + 2, 222, 206).setDepth(D.panel).setTint(0xd8eef4);
    tealPanel(this, 236, PANEL_Y + 2, 832, 206).setDepth(D.panel);

    // Left box: the silhouette of whoever acts.
    const big = Touch.active;
    this.sil = this.add.image(119, 640, '__DEFAULT').setOrigin(0.5, 1).setDepth(D.ally).setVisible(false);
    this.silName = label(this, 119, 644, '', big ? 22 : 17, '#e6f4f8', 4).setOrigin(0.5, 0).setDepth(D.allyUi);
    this.silSub = label(this, 119, big ? 676 : 674, '', big ? 18 : 14, COLORS.gold, 3).setOrigin(0.5, 0).setDepth(D.allyUi);

    // Right box: the tamer. The painted corner bands stay on top of the portrait.
    const p = PORTRAIT;
    this.add.image(p.x, p.y, 'ui_frame_corner').setOrigin(0).setDisplaySize(p.w, p.h).setDepth(D.panel);
    if (this.textures.exists('hero_portrait')) {
      const x0 = p.x + 10;
      const y0 = p.y + 10;
      const x1 = p.x + p.w - 10;
      const y1 = p.y + p.h - 10;
      const cw = (x1 - x0) * 0.3;
      const ch = (y1 - y0) * 0.3;
      const m = this.make.graphics({}, false);
      m.fillStyle(0xffffff).fillPoints([new Phaser.Geom.Point(x0, y0), new Phaser.Geom.Point(x1 - cw, y0), new Phaser.Geom.Point(x1, y0 + ch), new Phaser.Geom.Point(x1, y1), new Phaser.Geom.Point(x0 + cw, y1), new Phaser.Geom.Point(x0, y1 - ch)], true);
      const img = this.add.image((x0 + x1) / 2, (y0 + y1) / 2 + 6, 'hero_portrait').setDepth(D.panel + 1);
      img.setScale(Math.max((x1 - x0) / img.width, (y1 - y0) / img.height) * 1.04);
      img.setMask(m.createGeometryMask());
    }
    this.tamerHint = this.add.image(p.x + p.w / 2, p.y + p.h / 2, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setDisplaySize(p.w * 1.3, p.h * 1.2).setAlpha(0).setDepth(D.panel + 2);
    const z = this.add.zone(p.x, p.y, p.w, p.h).setOrigin(0).setDepth(D.allyUi).setInteractive({ useHandCursor: true });
    z.on('pointerdown', () => this.tapPortrait());
  }

  private newStatus(): Status {
    return { confuse: 0, sleep: 0, stun: 0, slow: 0, haste: 0, taunt: 0, stealth: 0, poison: 0, poisonDur: 1, poisonTotal: 0, poisonAcc: 0 };
  }

  private refreshStats(u: Unit) {
    const r = u.raw;
    u.stats = {
      hp: r.hp,
      speed: r.speed,
      attack: Math.max(1, r.attack + u.mods.attack),
      magic: Math.max(1, r.magic + u.mods.magic),
      defense: Math.max(1, r.defense + u.mods.defense),
      resist: Math.max(1, r.resist + u.mods.resist),
    };
  }

  private painted(id: string, key: string) {
    return PAINTED_ART.has(id) || (this.textures.exists(key) && this.textures.get(key).getSourceImage().width > 360);
  }

  private makeAlly(mon: PartyMon, slot: number, x: number) {
    const evolved = evolvedOf(mon);
    const base = baseOf(mon.id, evolved) ?? baseOf('gold_hatchling')!;
    const maxHp = maxHpOf(mon.id, mon.lv, evolved);
    const key = this.textures.exists(base.art) ? base.art : 'starter_gold_hatchling';
    const shadow = this.add.image(x, ALLY_FOOT + 2, 'shadow').setDepth(D.ally - 1).setAlpha(0.85);
    const sprite = this.add.image(x, ALLY_FOOT, key).setOrigin(0.5, 1).setDepth(D.ally);
    fitSprite(sprite, 118, 230, 132, this.painted(mon.id, key));
    shadow.setScale((sprite.displayWidth / 128) * 1.1, 0.7);
    const nameText = label(this, x, 644, base.name, 21, '#f4f1e8', 5).setOrigin(0.5, 0).setDepth(D.allyUi);
    if (nameText.width > 250) nameText.setScale(250 / nameText.width);
    // on phones the canvas is drawn at about half size: the numbers grow to stay legible
    const big = Touch.active;
    const bar = new Bar(this, x - 104, big ? 690 : 691, 208, 'red', big ? 32 : 26).setDepth(D.allyUi);
    const hpText = label(this, x, big ? 689 : 691, '', big ? 24 : 15, '#f4f1e8', 3).setOrigin(0.5).setDepth(D.allyUi + 1);
    const stTag = label(this, x, 516, '', big ? 20 : 13, '#c9f0a0', 3).setOrigin(0.5, 0).setDepth(D.allyUi);
    const zone = this.add.zone(x - 135, PANEL_Y + 4, 270, 204).setOrigin(0).setDepth(D.allyUi + 2).setInteractive({ useHandCursor: true });
    const u: Unit = {
      key: 'a' + this.keySeq++,
      side: 'ally',
      base,
      mon,
      def: MONSTERS[mon.id],
      name: base.name,
      lv: mon.lv,
      hp: Phaser.Math.Clamp(mon.hp, 0, maxHp),
      maxHp,
      tu: Math.round(startTu(base.lv1.speed) * 0.85),
      raw: { ...base.lv1 },
      mods: { attack: 0, magic: 0, defense: 0, resist: 0 },
      stats: { ...base.lv1 },
      st: this.newStatus(),
      moves: movesOf(base),
      slot,
      alive: mon.hp > 0,
      element: base.element,
      dmgMul: 1,
      sprite,
      shadow,
      homeX: x,
      homeY: ALLY_FOOT,
      nameText,
      bar,
      hpText,
      stTag,
      extras: [],
      zone,
    };
    zone.on('pointerdown', () => this.tapUnit(u));
    this.refreshStats(u);
    this.refreshHp(u, false);
    this.units.push(u);
    if (u.alive) {
      u.chip = this.makeChip(u);
      sprite.scene.tweens.add({ targets: sprite, scaleY: sprite.scaleY * 1.02, duration: 1400 + slot * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else this.ghostAlly(u);
    return u;
  }

  private foeLevel(def: MonsterDef) {
    if (this.data0.lv) return Math.max(1, Math.round(this.data0.lv));
    const party = this.units.filter((u) => u.side === 'ally');
    const avg = party.length ? Math.round(party.reduce((a, u) => a + u.lv, 0) / party.length) : 1;
    const t = tierOf(def.role);
    return Math.max(1, avg + (t === 'deity' ? 4 : t ? 2 : Phaser.Math.Between(0, 1)));
  }

  private makeFoe(id: string, slot: number, entering: boolean) {
    const def = MONSTERS[id] ?? MONSTERS.bat_fiend;
    const base = baseOf(def.id)!;
    const x = this.foeXs[slot];
    const lv = this.foeLevel(def);
    const tier = tierOf(def.role);
    const mult = tier === 'deity' ? 10 : tier === 'boss' ? 6 : tier === 'miniboss' ? 3.5 : 1;
    const maxHp = Math.round(hpAt(base.lv1.hp, lv) * mult);
    const key = this.textures.exists(def.art) ? def.art : 'mon_bat_fiend';
    const shadow = this.add.image(x, GROUND_Y + 2, 'shadow').setDepth(D.foe - 1).setAlpha(0.9);
    const sprite = this.add.image(x, GROUND_Y, key).setOrigin(0.5, 1).setDepth(D.foe + slot);
    const targetH = tier === 'deity' ? 330 : tier === 'boss' ? 300 : tier === 'miniboss' ? 270 : 230;
    fitSprite(sprite, targetH, this.foeXs.length === 1 ? 560 : 330, tier ? 330 : 300, this.painted(def.id, key));
    shadow.setScale((sprite.displayWidth / 128) * 1.15, Math.min(1.6, 0.5 + sprite.displayWidth / 400));
    const name = this.data0.owner ? `${this.data0.owner}'s ${base.name}` : base.name;
    const nameText = label(this, x, 28, name, 29, base.color, 5).setOrigin(0.5, 0).setDepth(D.foeUi);
    const room = this.foeXs.length === 1 ? 520 : 300;
    if (nameText.width > room) nameText.setScale(room / nameText.width);
    const bar = new Bar(this, x - 116, 84, 232, 'red', 26).setDepth(D.foeUi);
    const extras: Phaser.GameObjects.GameObject[] = [];
    const big = Touch.active;
    const tagSize = big ? 22 : 15;
    const rank = def.boss
      ? label(this, x, 98, def.role === 'deity' ? 'DEITY' : def.role === 'boss' ? 'DRAGON OVERLORD' : 'GUARDIAN', tagSize, def.role === 'deity' ? '#ffcf6a' : COLORS.gold, 4)
      : def.rare
        ? label(this, x, 98, 'RARE SIGHTING', tagSize, '#9fd8ff', 4)
        : undefined;
    const lvTag = label(this, x + 112, 98, `LV ${lv}`, tagSize, '#e4dccb', 3).setOrigin(1, 0).setDepth(D.foeUi);
    if (rank) {
      // the rank and the level share the line under the bar, side by side
      const total = rank.width + lvTag.width;
      rank.setOrigin(0, 0).setX(x - total / 2).setDepth(D.foeUi);
      lvTag.setOrigin(0, 0).setX(x - total / 2 + rank.width);
      extras.push(rank);
    }
    extras.push(lvTag);
    const stTag = label(this, x, big ? 126 : 120, '', big ? 20 : 14, '#c9f0a0', 3).setOrigin(0.5, 0).setDepth(D.foeUi);
    const zone = this.add.zone(x - 160, 20, 320, GROUND_Y - 4).setOrigin(0).setDepth(D.foeUi + 1).setInteractive({ useHandCursor: true });
    const u: Unit = {
      key: 'f' + this.keySeq++,
      side: 'foe',
      base,
      def,
      name,
      lv,
      hp: maxHp,
      maxHp,
      tu: startTu(base.lv1.speed),
      raw: { ...base.lv1 },
      mods: { attack: 0, magic: 0, defense: 0, resist: 0 },
      stats: { ...base.lv1 },
      st: this.newStatus(),
      moves: movesOf(base),
      slot,
      alive: true,
      tier,
      element: base.element,
      dmgMul: tier === 'deity' ? 1.3 : 1,
      sprite,
      shadow,
      homeX: x,
      homeY: GROUND_Y,
      nameText,
      bar,
      stTag,
      extras,
      zone,
    };
    zone.on('pointerdown', () => this.tapUnit(u));
    this.refreshStats(u);
    this.refreshHp(u, false);
    this.units.push(u);
    this.allFoes.push(u);
    State.record(def.id).seen = true;
    u.chip = this.makeChip(u);
    if (entering) {
      const ui = [nameText, bar, stTag, ...extras] as unknown as Phaser.GameObjects.Components.Alpha[];
      ui.forEach((o) => o.setAlpha(0));
      this.tweens.add({ targets: ui, alpha: 1, duration: 500 });
      sprite.setAlpha(0).setY(GROUND_Y + 30);
      shadow.setAlpha(0);
      this.tweens.add({ targets: shadow, alpha: 0.9, duration: 500 });
      this.tweens.add({ targets: sprite, alpha: 1, y: GROUND_Y, duration: 650, ease: 'Cubic.easeOut', onComplete: () => this.idle(u) });
      sparkleBurst(this, x, GROUND_Y - sprite.displayHeight / 2, 10, D.fx, 90);
    }
    return u;
  }

  private makeChip(u: Unit) {
    const c = new QueueChip(this, u.base.art, u.side).setDepth(D.queue);
    c.setPosition(QUEUE_X, QUEUE_Y + QUEUE_MAX * QUEUE_STEP);
    c.alpha = 0;
    c.shown = u.tu;
    c.bar.set(u.hp / u.maxHp, false);
    return c;
  }

  private idle(u: Unit) {
    if (!u.alive || u.side !== 'foe') return;
    this.tweens.killTweensOf(u.sprite);
    u.sprite.setPosition(u.homeX, u.homeY);
    const flier = !!u.def?.flier;
    this.tweens.add({ targets: u.sprite, y: u.homeY - (flier ? 14 : 3), duration: flier ? 900 : 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private refreshHp(u: Unit, animate = true) {
    u.bar.set(u.hp / u.maxHp, animate);
    u.hpText?.setText(`${Math.max(0, u.hp)}/${u.maxHp}`);
    u.chip?.bar.set(u.hp / u.maxHp, animate);
  }

  private refreshStatus(u: Unit) {
    const parts: string[] = [];
    for (const k of ['sleep', 'stun', 'confuse', 'poison', 'slow', 'haste', 'taunt', 'stealth'] as const) if (u.st[k] > 0) parts.push(STATUS_NAMES[k]);
    const txt = u.alive ? parts.join(' · ') : '';
    if (u.stTag.text !== txt) u.stTag.setText(txt);
  }

  private living(side?: 'ally' | 'foe') {
    return this.units.filter((u) => u.alive && (!side || u.side === side));
  }

  private enemiesOf(u: Unit) {
    return this.living(u.side === 'ally' ? 'foe' : 'ally').sort((a, b) => a.homeX - b.homeX);
  }

  private friendsOf(u: Unit) {
    return this.living(u.side).sort((a, b) => a.homeX - b.homeX);
  }

  /** The TU queue: living units in acting order, numbers easing as time passes. */
  private layoutQueue(snap = false) {
    const order = this.living().sort((a, b) => a.tu - b.tu || (a.side === b.side ? a.slot - b.slot : a.side === 'ally' ? -1 : 1));
    order.forEach((u, i) => {
      const c = u.chip;
      if (!c) return;
      c.targetY = QUEUE_Y + Math.min(i, QUEUE_MAX) * QUEUE_STEP;
      c.targetAlpha = i < QUEUE_MAX ? 1 : 0;
      c.setDepth(D.queue + QUEUE_MAX - Math.min(i, QUEUE_MAX));
      if (snap) {
        c.y = c.targetY;
        c.shown = u.tu;
      }
    });
    for (const u of this.units) this.refreshStatus(u);
  }

  private showActor(u: Unit) {
    if (!this.textures.exists(u.base.art)) return;
    this.sil.setTexture(u.base.art).setVisible(true).setAlpha(0);
    const sc = Math.min(160 / this.sil.width, 112 / this.sil.height, 2);
    this.sil.setScale(sc).setTintFill(0x03141c);
    this.tweens.add({ targets: this.sil, alpha: 1, duration: 200 });
    this.silName.setText(u.name);
    if (this.silName.width > 200) this.silName.setScale(200 / this.silName.width);
    else this.silName.setScale(1);
    this.silSub.setText(`LV ${u.lv}  ·  ${u.base.element}`);
  }

  private clearActor() {
    this.tweens.killTweensOf(this.sil);
    this.sil.setVisible(false);
    this.silName.setText('');
    this.silSub.setText('');
  }

  // ---- the Time Unit loop --------------------------------------------------------
  private hold(ms: number, done: () => void) {
    this.phase = 'say';
    this.sayT = ms;
    this.sayDone = done;
  }

  private next(): void {
    if (this.phase === 'end') return;
    this.phase = 'busy';
    if (this.checkEnd()) return;
    if (!this.living('foe').length) return this.afterAction(); // empty field: call in the reserve
    const live = this.living();
    const u = live.reduce((best, x) => (x.tu < best.tu - 0.001 || (Math.abs(x.tu - best.tu) < 0.001 && x.side === 'ally' && best.side === 'foe') ? x : best));
    const d = u.tu;
    if (d > 0.5) {
      this.advance(d);
      this.time.delayedCall(Math.min(560, 240 + d * 1.4), () => this.beginTurn(u));
    } else {
      u.tu = 0;
      this.beginTurn(u);
    }
  }

  private advance(d: number) {
    for (const x of this.living()) {
      x.tu = Math.max(0, x.tu - d);
      const s = x.st;
      for (const k of ['confuse', 'sleep', 'stun', 'slow', 'haste', 'taunt', 'stealth'] as const) s[k] = Math.max(0, s[k] - d);
      if (s.poison > 0) {
        const used = Math.min(d, s.poison);
        s.poisonAcc += (s.poisonTotal * used) / Math.max(1, s.poisonDur);
        s.poison -= used;
      }
    }
    this.layoutQueue();
  }

  private beginTurn(u: Unit) {
    if (!u.alive) return this.next();
    this.turnUnit = u;
    this.acted.add(u.key);
    if (this.living().every((x) => this.acted.has(x.key))) {
      this.round++;
      this.disc.set(this.round);
      this.acted.clear();
    }
    this.showActor(u);
    const cost = (tu: number) => tuCost(tu, u.stats.speed, u.st.slow > 0, u.st.haste > 0);
    if (u.st.poisonAcc >= 1) {
      const n = Math.floor(u.st.poisonAcc);
      u.st.poisonAcc -= n;
      this.hurt(u, n, 0x9cff6a, true);
      this.caption.show(`* ${u.name} is hurt by poison. ${n} damage.`);
      if (!u.alive) return this.hold(1100, () => this.afterAction());
      return this.hold(800, () => this.actOrSkip(u, cost));
    }
    this.actOrSkip(u, cost);
  }

  private actOrSkip(u: Unit, cost: (tu: number) => number) {
    const skip = (text: string) => {
      u.tu += cost(100);
      this.layoutQueue();
      this.caption.show(text);
      this.hold(900, () => this.next());
    };
    if (u.st.sleep > 0) return skip(`* ${u.name} is fast asleep.`);
    if (u.st.stun > 0) {
      u.st.stun = 0;
      return skip(`* ${u.name} is stunned and cannot move.`);
    }
    if (u.st.confuse > 0 && Math.random() < 0.4) {
      this.tweens.add({ targets: u.sprite, angle: { from: -6, to: 6 }, duration: 110, yoyo: true, repeat: 2, onComplete: () => u.sprite.setAngle(0) });
      return skip(`* ${u.name} is confused and does nothing.`);
    }
    if (u.side === 'ally') this.allyTurn(u);
    else this.foeTurn(u);
  }

  private checkEnd(): boolean {
    if (!this.living('ally').length) {
      this.lose();
      return true;
    }
    if (!this.living('foe').length && !this.reserve.length) {
      this.win();
      return true;
    }
    return false;
  }

  /** After any action: fallen foes are replaced by reinforcements, then time moves on. */
  private afterAction(): void {
    if (this.phase === 'end') return;
    this.phase = 'busy';
    this.layoutQueue();
    if (!this.living('ally').length) return this.next();
    const spawned: number[] = [];
    for (let slot = 0; slot < this.foeXs.length && this.reserve.length; slot++) {
      if (this.units.some((u) => u.side === 'foe' && u.alive && u.slot === slot)) continue;
      for (const gone of this.units.filter((u) => u.side === 'foe' && u.slot === slot)) this.retire(gone);
      const id = this.reserve.shift()!;
      this.makeFoe(id, slot, true);
      spawned.push(slot);
    }
    if (!spawned.length) return this.next();
    Sound.whoosh();
    this.layoutQueue();
    const between = this.data0.between ?? [];
    const left = this.living('foe').length + this.reserve.length;
    const line = between.length ? between[this.betweenIdx++ % between.length].replace('{N}', String(left)) : `* ${spawned.length > 1 ? 'More foes step' : 'Another foe steps'} in. (${left} left)`;
    this.caption.show(line);
    this.hold(1600, () => this.next());
  }

  /** A fallen, spared or captured foe's leftovers go before another steps into its slot. */
  private retire(u: Unit) {
    for (const o of [u.sprite, u.shadow, u.nameText, u.bar, u.stTag, ...u.extras]) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    u.zone.destroy();
    this.units = this.units.filter((x) => x !== u);
  }

  // ---- an ally's turn: the ability menu -------------------------------------------
  private allyTurn(u: Unit) {
    this.activeGlow.setPosition(u.homeX, u.homeY - 6).setAlpha(0.45);
    u.nameText.setColor(COLORS.yellow);
    this.tweens.killTweensOf(this.tamerHint);
    this.tamerHint.setAlpha(0);
    this.tweens.add({ targets: this.tamerHint, alpha: 0.16, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
    this.caption.show(`* What will ${u.name} do?`);
    this.abilitySel = 0;
    this.openAbilities(u);
  }

  private endAllyTurn() {
    const u = this.turnUnit;
    if (u?.side === 'ally') u.nameText.setColor(u.alive ? '#f4f1e8' : '#8a8f96');
    this.activeGlow.setAlpha(0);
    this.tweens.killTweensOf(this.tamerHint);
    this.tamerHint.setAlpha(0);
  }

  private closeUi() {
    this.menu?.close();
    this.menu = undefined;
    this.menuKind = '';
    this.clearTarget();
    if (this.cards) {
      this.cards.root.destroy();
      this.cards = undefined;
    }
  }

  private openAbilities(u: Unit) {
    this.closeUi();
    this.showActor(u);
    this.phase = 'menu';
    this.menuKind = 'ability';
    // the effect line is cut to fit one column of the docked list (phones use larger type)
    const lim = Touch.active ? 40 : 50;
    const items: MenuItem[] = u.moves.map((mv) => ({
      text: mv.name,
      right: `TU ${mv.tu}`,
      sub: `${mv.desc.length > lim - mv.targetText.length ? mv.desc.slice(0, lim - 2 - mv.targetText.length).trimEnd() + '…' : mv.desc}  ·  ${mv.targetText}`,
      run: () => this.chooseMove(u, mv),
    }));
    items.push({ text: 'Tamer...', sub: 'Item · Capture · Spare · Check · Flee', icon: 'ui_med_scroll', color: COLORS.gold, run: () => this.openTamer(u) });
    this.menu = new Menu(this, DOCK, `${u.name}  ·  LV ${u.lv}`, u.base.color, items, null, D.menu, (i) => (this.abilitySel = i));
    this.menu.select(Math.min(this.abilitySel, items.length - 1), false);
  }

  private chooseMove(u: Unit, mv: Move, direct?: Unit) {
    const back = () => this.openAbilities(u);
    const foes = this.enemiesOf(u);
    switch (mv.target) {
      case 'foe':
        if (direct) return this.act(u, mv, [direct]);
        return this.pickTarget(foes, 'one', (p) => this.act(u, mv, p), back);
      case 'foes2':
        if (direct) return this.act(u, mv, this.withNeighbour(foes, direct));
        return this.pickTarget(foes, 'two', (p) => this.act(u, mv, p), back);
      case 'allFoes':
        if (direct) return this.act(u, mv, foes);
        return this.pickTarget(foes, 'all', (p) => this.act(u, mv, p), back);
      case 'allAllies':
        return this.act(u, mv, this.friendsOf(u));
      case 'self':
        return this.act(u, mv, [u]);
      default:
        if (mv.kind === 'escape') return this.tryFlee(u, mv.tu);
        return this.act(u, mv, []);
    }
  }

  private withNeighbour(list: Unit[], t: Unit) {
    const i = list.indexOf(t);
    const other = list[i + 1] ?? list[i - 1];
    return other ? [t, other] : [t];
  }

  // ---- choosing a target ----------------------------------------------------------
  private pickTarget(cands: Unit[], mode: Targeting['mode'], onPick: (p: Unit[]) => void, onBack: () => void, info?: (u: Unit) => { text: string; color: string }) {
    this.closeUi();
    if (!cands.length) return onBack();
    this.phase = 'target';
    const objs: Phaser.GameObjects.GameObject[] = [];
    if (info) {
      for (const c of cands) {
        const inf = info(c);
        objs.push(label(this, c.homeX, this.cursorY(c) - 34, inf.text, 26, inf.color, 5).setOrigin(0.5, 1).setDepth(D.cursor));
      }
    }
    const lowest = cands.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
    this.tgt = { cands, sel: Math.max(0, cands.indexOf(cands[0].side === 'foe' ? cands[0] : lowest)), mode, onPick, onBack, objs, cursors: [] };
    this.caption.show(cands[0].side === 'ally' ? '* Choose one of your monsters.' : mode === 'all' ? '* All of them. (Z to confirm, X to go back)' : '* Choose a target.');
    this.drawTarget();
  }

  private drawTarget() {
    const t = this.tgt;
    if (!t) return;
    for (const c of t.cursors) c.destroy();
    t.cursors = [];
    const chosen = t.mode === 'all' ? t.cands : t.mode === 'two' ? this.withNeighbour(t.cands, t.cands[t.sel]) : [t.cands[t.sel]];
    for (const u of chosen) {
      const y = this.cursorY(u);
      const k = u.side === 'ally' ? 0.7 : 1;
      const glow = this.add.image(u.homeX, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setScale(0.32 * k).setAlpha(0.7).setDepth(D.cursor);
      const cur = this.add.image(u.homeX, y, 'ui_cursor_diamond').setScale(0.95 * k).setTint(0xfff1c8, 0xfff1c8, 0xd9a84a, 0xd9a84a).setDepth(D.cursor);
      this.tweens.add({ targets: [cur, glow], y: y + 10 * k, yoyo: true, repeat: -1, duration: 380, ease: 'Sine.easeInOut' });
      t.cursors.push(glow, cur);
    }
    for (const u of this.units) if (u.alive) u.nameText.setAlpha(t.cands.includes(u) && !chosen.includes(u) ? 0.75 : 1);
    for (const u of chosen) u.nameText.setAlpha(1);
    this.showActor(t.cands[t.sel]);
  }

  /** Where the target diamond hovers: over a foe's head clear of the name plates, or just inside an ally's box. */
  private cursorY(u: Unit) {
    const top = u.homeY - u.sprite.displayHeight;
    return u.side === 'foe' ? Math.max(186, top - 22) : Math.max(PANEL_Y + 18, top + 4);
  }

  private clearTarget() {
    const t = this.tgt;
    if (!t) return;
    for (const o of [...t.objs, ...t.cursors]) o.destroy();
    for (const u of this.units) if (u.alive) u.nameText.setAlpha(1);
    this.tgt = undefined;
  }

  private targetUpdate() {
    const t = this.tgt!;
    const c = this.controls;
    const n = t.cands.length;
    if (t.mode !== 'all' && n > 1) {
      if (c.pressed('left') || c.pressed('up')) {
        t.sel = (t.sel + n - 1) % n;
        Sound.move();
        this.drawTarget();
      } else if (c.pressed('right') || c.pressed('down')) {
        t.sel = (t.sel + 1) % n;
        Sound.move();
        this.drawTarget();
      }
    }
    if (c.pressed('confirm')) this.confirmTarget(t.cands[t.sel]);
    else if (c.pressed('cancel')) {
      Sound.cancel();
      const back = t.onBack;
      this.clearTarget();
      back();
    }
  }

  private confirmTarget(u: Unit) {
    const t = this.tgt;
    if (!t || !t.cands.includes(u)) return;
    t.sel = t.cands.indexOf(u);
    Sound.confirm();
    const picked = t.mode === 'all' ? t.cands : t.mode === 'two' ? this.withNeighbour(t.cands, u) : [u];
    const go = t.onPick;
    this.clearTarget();
    go(picked);
  }

  /** Direct taps on a creature (sprite, name or bar). */
  private tapUnit(u: Unit) {
    if (this.phase === 'target' && this.tgt) {
      if (this.tgt.cands.includes(u)) this.confirmTarget(u);
      return;
    }
    if (this.phase === 'menu' && this.menuKind === 'ability' && this.turnUnit?.side === 'ally' && u.alive) {
      const actor = this.turnUnit;
      const mv = actor.moves[this.abilitySel];
      if (!mv || u.side === actor.side) return;
      if (mv.target === 'foe' || mv.target === 'foes2' || mv.target === 'allFoes') {
        Sound.confirm();
        this.closeUi();
        this.chooseMove(actor, mv, u);
      }
    }
  }

  private tapPortrait() {
    const u = this.turnUnit;
    if (!u || u.side !== 'ally') return;
    if ((this.phase === 'menu' && this.menuKind === 'ability') || this.phase === 'target') {
      Sound.confirm();
      this.openTamer(u);
    }
  }

  // ---- doing it ------------------------------------------------------------------
  private act(u: Unit, mv: Move, targets: Unit[]) {
    this.closeUi();
    this.endAllyTurn();
    this.phase = 'busy';
    u.tu += tuCost(mv.tu, u.stats.speed, u.st.slow > 0, u.st.haste > 0);
    this.layoutQueue();
    this.caption.show(`* ${u.name} used ${mv.name}!`);
    if (u.side === 'foe' && u.def?.talk.length && Math.random() < 0.3) {
      speech(this, u.homeX, u.homeY - u.sprite.displayHeight - 40, u.def.talk[Phaser.Math.Between(0, u.def.talk.length - 1)].replace(/^\*\s*/, ''), D.fx);
    }
    this.animateUse(u, mv, targets, () => {
      if (mv.kind === 'analyze') {
        const lines = this.living('foe').map((f) => `* ${f.name}  LV ${f.lv}  —  HP ${f.hp}/${f.maxHp}\n  ATK ${f.stats.attack}  MAG ${f.stats.magic}  SPD ${f.stats.speed}  DEF ${f.stats.defense}  RES ${f.stats.resist}`);
        if (this.reserve.length) lines.push(`* ${this.reserve.length} more wait beyond: ${[...new Set(this.reserve.map((id) => MONSTERS[id]?.name ?? id))].join(', ')}.`);
        return this.pages(lines, () => this.afterAction());
      }
      const summary = this.resolve(u, mv, targets);
      this.caption.show(`* ${u.name} used ${mv.name}!${summary ? ' ' + summary : ''}`);
      this.hold(this.units.some((x) => x.fate === undefined && !x.alive && x.side === 'foe') ? 1300 : 1050, () => this.afterAction());
    });
  }

  /**
   * Guardians', Overlords' and deities' wiki ranges are far above a Lv1 budget (Orochi's Wiggle is
   * 45-55 at ATK 40), so one blow on Kael's monsters is capped to a share of their max HP:
   * a strong hit, never an instant wipe. Remove or tune here.
   */
  private capHit(u: Unit, t: Unit, n: number) {
    if (u.side !== 'foe' || t.side !== 'ally') return n;
    const cap = u.tier === 'deity' ? 0.5 : u.tier === 'boss' ? 0.4 : u.tier === 'miniboss' ? 0.45 : 0.7;
    return Math.min(n, Math.max(1, Math.ceil(t.maxHp * cap)));
  }

  private statusChance(t: Unit, kind: StatusFx['kind']) {
    if (kind === 'haste') return 1;
    const hard = kind === 'sleep' || kind === 'stun' || kind === 'confuse';
    return t.tier === 'deity' ? (hard ? 0.25 : 0.5) : t.tier ? (hard ? 0.45 : 0.65) : 0.8;
  }

  private applyStatus(att: Unit, t: Unit, s: StatusFx): boolean {
    if (!t.alive || Math.random() > this.statusChance(t, s.kind)) return false;
    if (s.kind === 'poison') {
      const avg = s.dmg ? (s.dmg[0] + s.dmg[1]) / 2 : 5;
      t.st.poison = s.tu;
      t.st.poisonDur = s.tu;
      t.st.poisonTotal = Math.max(1, Math.round(avg * levelMul(att.lv) * att.dmgMul));
      t.st.poisonAcc = 0;
    } else t.st[s.kind] = Math.max(t.st[s.kind], s.tu);
    return true;
  }

  private applyStats(t: Unit, stats: Move['stats']) {
    const changed: string[] = [];
    for (const k of Object.keys(stats) as StatKey[]) {
      const v = stats[k] ?? 0;
      if (!v) continue;
      const cap = Math.max(6, Math.round(t.raw[k] * 0.6));
      t.mods[k] = Phaser.Math.Clamp(t.mods[k] + v, -cap, cap);
      changed.push(k.charAt(0).toUpperCase() + k.slice(1));
    }
    this.refreshStats(t);
    return changed;
  }

  /** Apply a move's effects; returns the narration tail ("6 damage."). */
  private resolve(u: Unit, mv: Move, targets: Unit[]): string {
    const live = targets.filter((t) => t.alive);
    const notes: string[] = [];
    const statusLine = (t: Unit, kinds: string[]) => {
      if (kinds.length) notes.push(`${t.name} is ${kinds.map((k) => STATUS_NAMES[k].toLowerCase()).join(' and ')}.`);
    };
    switch (mv.kind) {
      case 'damage': {
        const dealt: number[] = [];
        for (const t of live) {
          const n = this.capHit(u, t, rollDamage(u, t, mv));
          dealt.push(n);
          this.hurt(t, n, ELEMENT_TINT[mv.element ?? u.element] ?? 0xffffff);
          if (t.alive) {
            statusLine(t, mv.statuses.filter((s) => this.applyStatus(u, t, s)).map((s) => s.kind));
            const down = Object.fromEntries(Object.entries(mv.stats).filter(([, v]) => (v ?? 0) < 0));
            if (Object.keys(down).length) this.applyStats(t, down);
          }
        }
        const up = Object.fromEntries(Object.entries(mv.stats).filter(([, v]) => (v ?? 0) > 0));
        if (Object.keys(up).length) this.applyStats(u, up);
        if (mv.drain > 0 && u.alive) {
          const heal = Math.max(1, Math.round(dealt.reduce((a, b) => a + b, 0) * mv.drain));
          this.heal(u, heal);
          notes.push(`${u.name} drains ${heal} HP.`);
        }
        if (!dealt.length) return 'It hit nothing.';
        return `${dealt.join(', ')} damage.${notes.length ? ' ' + notes.join(' ') : ''}`;
      }
      case 'status': {
        let any = false;
        for (const t of live) {
          const got = mv.statuses.filter((s) => this.applyStatus(u, t, s)).map((s) => s.kind);
          if (got.length) any = true;
          statusLine(t, got);
          const down = Object.fromEntries(Object.entries(mv.stats).filter(([, v]) => (v ?? 0) < 0));
          if (Object.keys(down).length) this.applyStats(t, down);
          if (got.length) this.flashStatus(t, 0xb08aff);
        }
        return any ? notes.join(' ') : 'It had no effect.';
      }
      case 'buff': {
        for (const t of live) {
          const ch = this.applyStats(t, mv.stats);
          const got = mv.statuses.filter((s) => this.applyStatus(u, t, s)).map((s) => s.kind);
          this.flashStatus(t, 0x9fe8ff);
          if (ch.length) popNumber(this, t.homeX, t.homeY - t.sprite.displayHeight * 0.6, `${ch[0]} up`, '#9fe8ff', D.num).setFontSize(26);
          else if (got.includes('haste')) popNumber(this, t.homeX, t.homeY - t.sprite.displayHeight * 0.6, 'Speed up', '#9fe8ff', D.num).setFontSize(26);
        }
        const what = [...Object.keys(mv.stats).map((k) => k.charAt(0).toUpperCase() + k.slice(1)), ...(mv.statuses.some((s) => s.kind === 'haste') ? ['speed'] : [])];
        return `${live.length > 1 ? 'The team' : live[0]?.name ?? u.name}: ${what.join(', ') || 'strength'} rose.`;
      }
      case 'debuff': {
        for (const t of live) {
          const ch = this.applyStats(t, mv.stats);
          this.flashStatus(t, 0xff9a6a);
          if (ch.length) popNumber(this, t.homeX, t.homeY - t.sprite.displayHeight * 0.6, `${ch[0]} down`, '#ffb08a', D.num).setFontSize(26);
        }
        return `${Object.keys(mv.stats).map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(', ')} fell.`;
      }
      case 'cleanse': {
        for (const t of live) {
          if (mv.cleanse === 'all') {
            for (const k of ['confuse', 'sleep', 'stun', 'slow', 'haste', 'taunt', 'stealth', 'poison'] as const) t.st[k] = 0;
            t.st.poisonAcc = 0;
            t.mods = { attack: 0, magic: 0, defense: 0, resist: 0 };
            this.refreshStats(t);
          } else for (const k of mv.cleanse ?? []) t.st[k] = 0;
          this.flashStatus(t, 0xfff0a0);
        }
        return mv.cleanse === 'all' ? 'Every effect was washed away.' : `${(mv.cleanse ?? []).map((k) => STATUS_NAMES[k]).join(' and ') || 'Nothing'} cleared.`;
      }
      case 'taunt':
        u.st.taunt = 500;
        u.st.stealth = 0;
        this.flashStatus(u, 0xff7a5e);
        return `The foes are drawn to ${u.name}.`;
      case 'stealth':
        u.st.stealth = 500;
        u.st.taunt = 0;
        this.flashStatus(u, 0x9fd8ff);
        return `${u.name} slips from notice.`;
      default:
        // abilities the battle cannot model (summons, splits...) still steady the user a little
        this.applyStats(u, { defense: 1 });
        this.flashStatus(u, 0xfff0a0);
        return `${u.name} steadies itself.`;
    }
  }

  private flashStatus(t: Unit, tint: number) {
    const x = t.homeX;
    const y = t.homeY - t.sprite.displayHeight * 0.5;
    const ring = this.add.image(x, y, 'ui_fx_silverring').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0.4).setDepth(D.fx);
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 650, onComplete: () => ring.destroy() });
    sparkleBurst(this, x, y, 8, D.fx, 70);
  }

  private headOf(t: Unit) {
    return { x: t.homeX, y: t.homeY - t.sprite.displayHeight * (t.side === 'foe' ? 0.55 : 0.5) };
  }

  /** Damage with impact flash, element spark and a floating number. */
  private hurt(t: Unit, n: number, tint: number, quiet = false) {
    if (!t.alive) return;
    t.hp = Math.max(0, t.hp - n);
    if (t.st.sleep > 0) t.st.sleep = 0; // any damage wakes it
    this.refreshHp(t);
    const h = this.headOf(t);
    if (!quiet) {
      Sound.hit();
      if (t.side === 'ally') this.cameras.main.shake(140, 0.005);
      const flash = this.add.image(h.x, h.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0.25).setDepth(D.fx);
      this.tweens.add({ targets: flash, scale: 1.5, alpha: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
      sparkleBurst(this, h.x, h.y, 7, D.fx, 70);
    }
    t.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (t.alive) t.sprite.clearTint();
    });
    if (t.side === 'foe') this.tweens.add({ targets: t.sprite, x: { from: t.homeX - 12, to: t.homeX }, duration: 260, ease: 'Sine.easeOut' });
    else this.tweens.add({ targets: t.sprite, x: { from: t.homeX + 8, to: t.homeX }, duration: 220, ease: 'Sine.easeOut' });
    popNumber(this, h.x + Phaser.Math.Between(-24, 24), h.y - 16, `-${n}`, quiet ? '#9cff6a' : '#ff4a42', D.num).setFontSize(t.side === 'foe' ? 44 : 34);
    if (t.hp <= 0) this.faint(t);
  }

  private heal(t: Unit, n: number) {
    const before = t.hp;
    t.hp = Math.min(t.maxHp, t.hp + n);
    this.refreshHp(t);
    const h = this.headOf(t);
    popNumber(this, h.x, h.y - 10, `+${t.hp - before}`, '#7dff9a', D.num).setFontSize(34);
    return t.hp - before;
  }

  private faint(t: Unit) {
    t.alive = false;
    t.st = this.newStatus();
    t.stTag.setText('');
    const chip = t.chip;
    t.chip = undefined;
    if (chip) this.tweens.add({ targets: chip, alpha: 0, scale: 0.6, duration: 400, onComplete: () => chip.destroy() });
    this.tweens.killTweensOf(t.sprite);
    Sound.dust();
    const tint = Phaser.Display.Color.HexStringToColor(t.base.color).color;
    if (t.side === 'foe') {
      t.fate = 'won';
      State.record(t.base.id).defeated++;
      State.get().kills++;
      t.zone.disableInteractive();
      dustify(this, t.sprite, tint, D.fx);
      this.tweens.add({ targets: [t.nameText, t.bar, t.shadow, t.stTag, ...t.extras], alpha: 0, duration: 700, delay: 300 });
    } else {
      dustify(this, t.sprite, tint, D.fx);
      this.time.delayedCall(1150, () => {
        if (!t.alive) this.ghostAlly(t);
      });
      t.nameText.setColor('#8a8f96');
    }
  }

  /** A fainted ally stays in its slot as a faint grey shape (a Dragonfruit Tart can bring it back). */
  private ghostAlly(t: Unit) {
    this.tweens.killTweensOf(t.sprite); // the dust-away fade must not win over the ghost
    t.sprite.setVisible(true).setPosition(t.homeX, t.homeY).setTint(0x50555c).setAlpha(0);
    this.tweens.add({ targets: t.sprite, alpha: 0.36, duration: 400 });
    t.nameText.setColor('#8a8f96');
    this.refreshHp(t, false);
  }

  private revive(t: Unit) {
    t.alive = true;
    this.tweens.killTweensOf(t.sprite);
    t.sprite.clearTint().setAlpha(1);
    t.nameText.setColor('#f4f1e8');
    t.tu = tuCost(100, t.stats.speed);
    t.chip = this.makeChip(t);
    sparkleBurst(this, t.homeX, t.homeY - 60, 14, D.fx, 90);
  }

  // ---- animation -----------------------------------------------------------------
  private animateUse(u: Unit, mv: Move, targets: Unit[], impact: () => void) {
    const el = mv.element ?? u.element;
    const tint = ELEMENT_TINT[el] ?? 0xffffff;
    const hostile = targets.some((t) => t.side !== u.side);
    const spr = u.sprite;
    if (!hostile) {
      Sound.chime();
      this.tweens.add({ targets: spr, y: u.homeY - 16, yoyo: true, duration: 160, ease: 'Quad.easeOut', onComplete: () => this.idle(u) });
      this.time.delayedCall(320, impact);
      return;
    }
    this.tweens.killTweensOf(spr);
    spr.setPosition(u.homeX, u.homeY);
    const first = targets[0];
    const restore = () => (u.side === 'foe' ? this.idle(u) : spr.setPosition(u.homeX, u.homeY));
    if (u.side === 'ally') {
      this.tweens.add({ targets: spr, y: u.homeY - 46, x: u.homeX + (first.homeX - u.homeX) * 0.12, duration: 150, yoyo: true, ease: 'Quad.easeOut', onComplete: restore });
    } else {
      const sx = spr.scaleX;
      const sy = spr.scaleY;
      this.tweens.add({ targets: spr, y: u.homeY + 26, x: u.homeX + (first.homeX - u.homeX) * 0.08, scaleX: sx * 1.07, scaleY: sy * 1.07, duration: 170, yoyo: true, ease: 'Quad.easeOut', onComplete: () => {
        spr.setScale(sx, sy);
        restore();
      } });
    }
    if (mv.kind === 'damage' && !mv.magical) {
      this.time.delayedCall(150, () => {
        Sound.slash();
        for (const t of targets) this.slash(t, tint);
      });
      this.time.delayedCall(340, impact);
      return;
    }
    // magic and status: a glowing mote flies to each target, then bursts in the element's colour
    Sound.whoosh();
    const from = { x: u.homeX, y: u.homeY - spr.displayHeight * 0.55 };
    targets.forEach((t, i) => {
      const to = this.headOf(t);
      const orb = this.add.image(from.x, from.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0.32).setDepth(D.fx);
      const core = this.add.image(from.x, from.y, 'dot').setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setDepth(D.fx);
      this.tweens.add({ targets: [orb, core], x: to.x, y: to.y, duration: 300, delay: 120 + i * 60, ease: 'Sine.easeIn', onComplete: () => {
        orb.destroy();
        core.destroy();
        this.burst(to.x, to.y, el, tint);
      } });
    });
    this.time.delayedCall(450 + targets.length * 60, impact);
  }

  private slash(t: Unit, tint: number) {
    const { x, y } = this.headOf(t);
    const r = Math.max(60, Math.min(150, t.sprite.displayWidth * 0.45));
    const g = this.add.graphics().setDepth(D.fx).setBlendMode(Phaser.BlendModes.ADD);
    const o = { k: 0 };
    this.tweens.add({
      targets: o,
      k: 1,
      duration: 200,
      onUpdate: () => {
        g.clear();
        g.lineStyle(12 * (1 - o.k) + 2, tint, 0.8 * (1 - o.k * 0.6));
        g.beginPath();
        g.arc(x, y, r, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(210 + 120 * o.k), false);
        g.strokePath();
        g.lineStyle(4 * (1 - o.k) + 1, 0xffffff, 1 - o.k * 0.6);
        g.beginPath();
        g.arc(x, y, r, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(210 + 120 * o.k), false);
        g.strokePath();
      },
      onComplete: () => g.destroy(),
    });
  }

  private burst(x: number, y: number, el: string, tint: number) {
    if (el === 'Fire') {
      for (let i = 0; i < 9; i++) {
        const f = this.add.image(x + Phaser.Math.Between(-50, 50), y + 40, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(i % 2 ? 0xff7a1a : 0xffd04a).setScale(0.22).setDepth(D.fx);
        this.tweens.add({ targets: f, y: y - Phaser.Math.Between(30, 110), scale: 0.6, alpha: 0, duration: 480, delay: i * 25, onComplete: () => f.destroy() });
      }
    } else if (el === 'Water') {
      const ring = this.add.image(x, y, 'ui_fx_waterring').setBlendMode(Phaser.BlendModes.ADD).setScale(0.4).setDepth(D.fx);
      this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
    } else if (el === 'Air') {
      const tw = this.add.image(x, y + 10, 'ui_fx_tornado').setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.9).setDepth(D.fx);
      this.tweens.add({ targets: tw, scale: 1.1, angle: 40, alpha: 0, duration: 560, onComplete: () => tw.destroy() });
    } else if (el === 'Earth') {
      for (let i = 0; i < 10; i++) {
        const d = this.add.image(x, y + 20, 'dot').setTint(i % 2 ? 0x8a6a3a : 0xd0a24e).setScale(Phaser.Math.FloatBetween(0.4, 0.8)).setDepth(D.fx);
        this.tweens.add({ targets: d, x: x + Phaser.Math.Between(-80, 80), y: y + Phaser.Math.Between(-80, 10), alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => d.destroy() });
      }
    } else {
      const ring = this.add.image(x, y, 'ui_fx_silverring').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0.4).setDepth(D.fx);
      this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    }
  }

  // ---- foe AI ----------------------------------------------------------------------
  private foeTurn(u: Unit) {
    this.phase = 'busy';
    const enemies = this.enemiesOf(u);
    const friends = this.friendsOf(u);
    const hurt = u.hp / u.maxHp < 0.5;
    const modSum = u.mods.attack + u.mods.magic + u.mods.defense + u.mods.resist;
    const weight = (mv: Move) => {
      switch (mv.kind) {
        case 'damage':
          return 3 + (mv.drain && hurt ? 2 : 0) + (mv.target === 'allFoes' && enemies.length > 1 ? 0.5 : 0);
        case 'status':
          return enemies.every((e) => mv.statuses.every((s) => s.kind === 'poison' ? e.st.poison > 0 : (e.st as unknown as Record<string, number>)[s.kind] > 0)) ? 0.2 : 1.1;
        case 'buff':
          return modSum > 4 ? 0.2 : 0.8;
        case 'debuff':
          return 0.7;
        case 'cleanse':
          return friends.some((f) => f.st.sleep > 0 || f.st.poison > 0) ? 2.5 : 0;
        case 'taunt':
        case 'stealth':
          return u.st.taunt > 0 || u.st.stealth > 0 ? 0 : 0.35;
        case 'generic':
          return 0.2;
        default:
          return 0;
      }
    };
    const scored = u.moves.map((mv) => ({ mv, w: weight(mv) })).filter((x) => x.w > 0);
    let mv = u.moves.find((m) => m.kind === 'damage') ?? u.moves[0];
    if (scored.length) {
      let r = Math.random() * scored.reduce((a, x) => a + x.w, 0);
      for (const x of scored) {
        r -= x.w;
        if (r <= 0) {
          mv = x.mv;
          break;
        }
      }
    }
    const one = () => {
      if (Math.random() < 0.3) return enemies.reduce((a, b) => (b.hp < a.hp ? b : a));
      const ws = enemies.map((e) => (e.st.taunt > 0 ? 3 : 1) * (e.st.stealth > 0 ? 0.3 : 1));
      let r = Math.random() * ws.reduce((a, b) => a + b, 0);
      for (let i = 0; i < enemies.length; i++) {
        r -= ws[i];
        if (r <= 0) return enemies[i];
      }
      return enemies[0];
    };
    let targets: Unit[];
    switch (mv.target) {
      case 'foe':
        targets = [one()];
        break;
      case 'foes2':
        targets = this.withNeighbour(enemies, one());
        break;
      case 'allFoes':
        targets = enemies;
        break;
      case 'allAllies':
        targets = friends;
        break;
      default:
        targets = [u];
    }
    this.time.delayedCall(280, () => this.act(u, mv, targets));
  }

  // ---- Kael's tamer commands -----------------------------------------------------------
  /** No running from missions, bounties, or any Guardian, Overlord or deity on the field. */
  private canFlee() {
    return !this.data0.fight && !this.living('foe').some((f) => f.tier || f.def?.boss);
  }

  private spareable(f: Unit) {
    return f.hp / f.maxHp <= 0.35 || ((f.tier === 'boss' || f.tier === 'deity') && this.round >= 5);
  }

  /** Kael acted: the command costs the active monster its turn (100 TU). */
  private tamerCost(u: Unit) {
    u.tu += tuCost(100, u.stats.speed, u.st.slow > 0, u.st.haste > 0);
    this.layoutQueue();
  }

  private openTamer(u: Unit) {
    this.closeUi();
    this.showActor(u);
    this.phase = 'menu';
    this.menuKind = 'tamer';
    const foes = this.living('foe');
    const ready = foes.some((f) => this.spareable(f));
    const items: MenuItem[] = [
      { text: 'Item', icon: 'ui_med_bag', sub: 'Use something from the satchel', run: () => this.openItems(u) },
      { text: 'Capture', icon: 'ui_capture_normal', sub: this.nocap ? 'Nothing here answers to a card' : 'Throw a Capture Card', disabled: this.nocap, run: () => this.openCards(u) },
      { text: 'Spare', icon: 'ui_med_mercy', sub: ready ? 'A foe is ready to yield' : 'A worn-down foe may yield', color: ready ? COLORS.yellow : undefined, run: () => this.openSpare(u) },
      { text: 'Check', icon: 'ui_med_scroll', sub: 'Study a foe', run: () => this.openCheck(u) },
      { text: 'Flee', icon: 'ui_cursor_arrow', iconBack: 'ui_slot_round', iconFlip: true, sub: this.canFlee() ? 'Escape with your team' : 'There is no escaping this', disabled: !this.canFlee(), run: () => this.tryFlee(u, 100) },
    ];
    this.menu = new Menu(this, DOCK, `${State.get().name}  ·  Tamer`, COLORS.gold, items, () => this.openAbilities(u), D.menu);
    this.caption.show(`* ${State.get().name} steps forward. (This uses ${u.name}'s turn.)`);
  }

  private openItems(u: Unit) {
    const inv = State.get().inventory;
    const list = Object.entries(inv).filter(([id, n]) => n > 0 && ITEMS[id] && !ITEMS[id].key && !ITEMS[id].capture);
    if (!list.length) {
      Sound.cancel();
      this.caption.show('* Your satchel is empty.');
      return;
    }
    this.closeUi();
    this.showActor(u);
    this.phase = 'menu';
    this.menuKind = 'items';
    const items: MenuItem[] = list.map(([id, n]) => ({
      text: ITEMS[id].name,
      right: `x${n}`,
      sub: id === 'tart' ? 'Heals one monster, even a fainted one' : 'Heals one standing monster',
      run: () => {
        const allies = this.units.filter((a) => a.side === 'ally' && (id === 'tart' || a.alive));
        this.pickTarget(allies, 'one', ([t]) => this.useItem(u, id, t), () => this.openItems(u));
      },
    }));
    this.menu = new Menu(this, DOCK, 'Satchel', COLORS.gold, items, () => this.openTamer(u), D.menu);
  }

  private useItem(u: Unit, id: string, t: Unit) {
    if (!t.alive && id !== 'tart') {
      this.caption.show('* A fainted monster cannot drink a tonic.');
      return this.openItems(u);
    }
    if (!State.useItem(id)) return this.openTamer(u);
    this.endAllyTurn();
    this.phase = 'busy';
    Sound.heal();
    const amount = Math.round((id === 'tart' ? 30 : 15) * (1 + 0.18 * (t.lv - 1)));
    if (!t.alive) this.revive(t);
    this.flashStatus(t, 0x7dff9a);
    const got = this.heal(t, amount);
    this.tamerCost(u);
    this.caption.show(`* Kael gives ${t.name} the ${ITEMS[id].name}. ${t.hp >= t.maxHp ? 'HP fully restored.' : `${got} HP restored.`}`);
    this.hold(1200, () => this.afterAction());
  }

  private openSpare(u: Unit) {
    const foes = this.enemiesOf(u);
    this.pickTarget(
      foes,
      'one',
      ([f]) => {
        if (!this.spareable(f)) {
          Sound.cancel();
          this.openSpare(u);
          this.caption.show(f.tier && f.hp / f.maxHp > 0.35 ? `* ${f.name} is wavering... but it is not finished yet.` : `* ${f.name} is not ready to yield.`);
          return;
        }
        this.spare(u, f);
      },
      () => this.openTamer(u),
      (f) => (this.spareable(f) ? { text: 'Ready to yield', color: COLORS.yellow } : { text: 'Not yet', color: '#c9b98a' }),
    );
  }

  private spare(u: Unit, f: Unit) {
    this.endAllyTurn();
    this.phase = 'busy';
    Sound.spare();
    f.alive = false;
    f.fate = 'spared';
    State.record(f.base.id).spared++;
    State.get().spares++;
    f.zone.disableInteractive();
    const chip = f.chip;
    f.chip = undefined;
    if (chip) this.tweens.add({ targets: chip, alpha: 0, duration: 400, onComplete: () => chip.destroy() });
    this.tweens.killTweensOf(f.sprite);
    sparkleBurst(this, f.homeX, f.homeY - f.sprite.displayHeight / 2, 22, D.fx, 200);
    this.tweens.add({ targets: f.sprite, alpha: 0, y: f.homeY - 40, duration: 1200, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: [f.nameText, f.bar, f.shadow, f.stTag, ...f.extras], alpha: 0, duration: 900 });
    f.stTag.setText('');
    this.tamerCost(u);
    this.caption.show(f.def?.spareText ?? `* ${f.name} leaves peacefully.`);
    this.hold(2200, () => this.afterAction());
  }

  private openCheck(u: Unit) {
    this.pickTarget(this.enemiesOf(u), 'one', ([f]) => {
      this.endAllyTurn();
      this.tamerCost(u);
      const text = (f.def?.check ?? `${f.name}.`).split('\n').filter(Boolean).map((l) => (l.startsWith('*') ? l : '* ' + l));
      this.pages([[`* ${f.name}  ·  LV ${f.lv}  ·  ${f.base.element}  ·  HP ${f.hp}/${f.maxHp}`, ...text].join('\n')], () => this.afterAction());
    }, () => this.openTamer(u));
  }

  private tryFlee(u: Unit, tu: number) {
    if (!this.canFlee()) {
      Sound.cancel();
      this.caption.show(this.data0.fight ? '* There is no turning back from this fight.' : '* There is no escaping this.');
      return;
    }
    this.closeUi();
    this.endAllyTurn();
    this.phase = 'busy';
    const avg = (list: Unit[]) => list.reduce((a, x) => a + x.stats.speed, 0) / Math.max(1, list.length);
    const chance = Phaser.Math.Clamp(0.55 + (avg(this.living('ally')) - avg(this.living('foe'))) / 50, 0.2, 0.95);
    if (Math.random() < chance) {
      Sound.whoosh();
      this.phase = 'end';
      this.caption.show('* You slip away with your team.');
      for (const a of this.living('ally')) this.tweens.add({ targets: a.sprite, alpha: 0, x: a.homeX - 60, duration: 500 });
      this.time.delayedCall(900, () => this.finish('fled'));
      return;
    }
    Sound.cancel();
    u.tu += tuCost(tu, u.stats.speed, u.st.slow > 0, u.st.haste > 0);
    this.layoutQueue();
    this.caption.show('* You could not get away!');
    this.hold(1000, () => this.afterAction());
  }

  // ---- Capture: the three DIB cards, then a foe -------------------------------------------
  private capturable(f: Unit) {
    return !this.nocap && !!f.def && f.def.capture > 0;
  }

  private chance(f: Unit, cc: CaptureCard) {
    return f.def ? captureChance(f.def, f.hp / f.maxHp, false, cc) : 0;
  }

  private openCards(u: Unit) {
    const foes = this.enemiesOf(u);
    if (this.nocap || !foes.some((f) => this.capturable(f))) {
      Sound.cancel();
      const t = this.lead?.alive ? this.lead.tier : foes[0]?.tier;
      this.caption.show(this.nocap ? '* Not here. Whatever lives in this place answers to no card.' : t === 'deity' ? '* A deity is held by nothing. It can only be calmed.' : t === 'boss' ? '* A Dragon Overlord answers to no card. It can only be calmed.' : '* No card can hold these.');
      return;
    }
    this.closeUi();
    this.showActor(u);
    this.caption.hide();
    this.phase = 'cards';
    const s = State.get();
    const big = Touch.active;
    // docked like the command lists: the three cards on the left of the centre box, the details beside them
    const { x: px, y: py, w: pw, h: ph } = DOCK;
    const root = this.add.container(0, 0).setDepth(D.menu);
    const bg = panel(this, px, py, pw, ph, 'blue').setInteractive();
    const shade = this.add.rectangle(px + 12, py + 10, pw - 24, ph - 20, 0x040a12, 0.55).setOrigin(0);
    const head = label(this, px + 26, py + 10, 'Capture Card', 19, COLORS.gold, 4);
    const infoX = px + 452;
    const infoW = pw - 452 - 28;
    const info = body(this, infoX, py + 22, '', big ? 18 : 17, COLORS.cream, infoW);
    const hint = body(this, infoX, py + 120, '* The more worn down a foe is, the better a card holds.', big ? 16 : 14, '#b9cdd6', infoW);
    root.add([bg, shade, head, info, hint]);
    const list: NonNullable<BattleScene['cards']>['list'] = [];
    CAPTURE_CARDS.forEach((cc, i) => {
      const owned = s.inventory[cc.item] ?? 0;
      const canBuy = owned <= 0 && s.gold >= cc.price;
      const usable = owned > 0 || canBuy;
      const best = Math.max(0, ...foes.filter((f) => this.capturable(f)).map((f) => this.chance(f, cc)));
      const c = this.add.container(px + 96 + i * 128, py + 118);
      const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setScale(0.8, 0.95).setAlpha(0).setName('glow');
      const sc = 0.56;
      const card = this.add.image(0, 0, cc.tex).setScale(sc);
      if (!usable) card.setTint(0x6a6f78);
      // the green window spans source rows 30-126, the price plate rows 137-188 (card is 160x200)
      const big = label(this, 0, -26 * sc, `${Math.round(best * 100)}%`, 32, '#ffffff', 4).setOrigin(0.5);
      const small = label(this, 0, 8 * sc, 'best chance', big ? 15 : 13, '#ffffff', 3).setOrigin(0.5);
      const plate = label(this, 0, 62 * sc, owned > 0 ? `x${owned}` : `${cc.price} G`, 18, COLORS.ink, 0).setOrigin(0.5).setStroke('#ffffff', 3).setShadow(0, 0, '#000', 0);
      if (!usable) [big, small, plate].forEach((t) => t.setAlpha(0.55));
      const zone = this.add.zone(0, 0, 160 * sc + 20, 200 * sc + 20).setInteractive({ useHandCursor: true });
      c.add([glow, card, big, small, plate, zone]);
      zone.on('pointerover', () => this.selectCard(i));
      zone.on('pointerdown', () => {
        this.selectCard(i);
        this.chooseCard();
      });
      root.add(c);
      list.push({ c, card: cc, owned, canBuy, usable });
    });
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 160 });
    this.cards = { root, list, sel: Math.max(0, list.findIndex((x) => x.owned > 0)), info, hint, actor: u };
    this.selectCard(this.cards.sel);
  }

  private selectCard(i: number) {
    const cs = this.cards;
    if (!cs) return;
    if (i !== cs.sel) Sound.move();
    cs.sel = i;
    cs.list.forEach((x, k) => {
      (x.c.getByName('glow') as Phaser.GameObjects.Image).setAlpha(k === i ? 0.45 : 0);
      this.tweens.killTweensOf(x.c);
      this.tweens.add({ targets: x.c, scale: k === i ? 1.05 : 0.9, duration: 120 });
    });
    const x = cs.list[i];
    const name = ITEMS[x.card.item]?.name ?? 'Card';
    cs.info.setText(x.owned > 0 ? `${name}: throw one (${x.owned} left).` : x.canBuy ? `${name}: buy one for ${x.card.price} G and throw it. (You have ${State.get().gold} G)` : `${name}: none left. It costs ${x.card.price} G.`);
    cs.hint.setY(cs.info.y + cs.info.height + 8);
  }

  private cardsUpdate() {
    const cs = this.cards!;
    const c = this.controls;
    const n = cs.list.length;
    if (c.pressed('left')) this.selectCard((cs.sel + n - 1) % n);
    else if (c.pressed('right')) this.selectCard((cs.sel + 1) % n);
    else if (c.pressed('confirm')) this.chooseCard();
    else if (c.pressed('cancel')) {
      Sound.cancel();
      this.openTamer(cs.actor);
    }
  }

  private chooseCard() {
    const cs = this.cards;
    if (!cs) return;
    const x = cs.list[cs.sel];
    if (!x.usable) {
      Sound.cancel();
      this.cameras.main.shake(80, 0.002);
      return;
    }
    Sound.confirm();
    this.cardTarget(cs.actor, x.card);
  }

  /** With a card in hand, pick the foe to throw it at (the card panel is gone by now). */
  private cardTarget(u: Unit, cc: CaptureCard) {
    this.pickTarget(
      this.enemiesOf(u),
      'one',
      ([f]) => {
        if (!this.capturable(f)) {
          Sound.cancel();
          this.cardTarget(u, cc);
          this.caption.show(f.tier === 'deity' ? '* A deity is held by nothing. It can only be calmed.' : f.tier === 'boss' ? '* A Dragon Overlord answers to no card. It can only be calmed.' : `* No card can hold ${f.name}.`);
          return;
        }
        this.throwCard(u, cc, f);
      },
      () => this.openCards(u),
      (f) => (this.capturable(f) ? { text: `${Math.round(this.chance(f, cc) * 100)}%`, color: '#ffffff' } : { text: '—', color: '#9a9a9a' }),
    );
  }

  private throwCard(u: Unit, cc: CaptureCard, f: Unit) {
    const s = State.get();
    if ((s.inventory[cc.item] ?? 0) <= 0) {
      if (s.gold < cc.price) return this.openCards(u);
      s.gold -= cc.price;
      State.addItem(cc.item, 1);
    }
    State.useItem(cc.item);
    this.endAllyTurn();
    this.phase = 'busy';
    this.tamerCost(u);
    Sound.bind();
    const name = ITEMS[cc.item]?.name ?? 'card';
    const chance = this.chance(f, cc);
    const ok = Math.random() < chance;
    const mx = f.homeX;
    const my = f.homeY - f.sprite.displayHeight * 0.45;
    const rest = f.homeY - 70;
    const card = this.add.image(PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 60, cc.tex).setScale(0.3).setDepth(D.fx);
    this.caption.show(`* Kael throws a ${name} at ${f.name}! (${Math.round(chance * 100)}%)`);
    this.tweens.add({
      targets: card,
      x: mx,
      y: my,
      angle: 720,
      duration: 560,
      ease: 'Quad.easeOut',
      onComplete: () => {
        card.setAngle(0);
        this.tweens.killTweensOf(f.sprite);
        const sx = f.sprite.scaleX;
        const sy = f.sprite.scaleY;
        this.tweens.add({ targets: f.sprite, scaleX: 0.02, scaleY: 0.02, y: my + 20, alpha: 0.4, duration: 420, ease: 'Cubic.easeIn' });
        this.tweens.add({ targets: card, y: rest, scale: 0.4, duration: 400, delay: 420, ease: 'Quad.easeOut' });
        const glow = this.add.image(mx, rest, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(cc.item === 'gold_card' ? 0xffd04a : cc.item === 'silver_card' ? 0xdfe8f0 : 0x7dff9a).setAlpha(0).setScale(0.9).setDepth(D.fx - 1);
        this.tweens.add({ targets: glow, alpha: 0.55, duration: 300, delay: 600, yoyo: true, repeat: 2 });
        let wob = 0;
        this.time.addEvent({
          delay: 520,
          repeat: 2,
          startAt: -900,
          callback: () => {
            wob++;
            Sound.move();
            this.tweens.add({ targets: card, angle: { from: -14, to: 14 }, duration: 110, yoyo: true });
            if (wob !== 3 && (ok || wob !== 2)) return;
            this.time.delayedCall(450, () => {
              glow.destroy();
              if (ok) {
                Sound.save();
                const crown = this.add.image(card.x, card.y - 80, 'ui_crown').setScale(0.1).setDepth(D.fx);
                this.tweens.add({ targets: crown, scale: 0.4, y: card.y - 100, duration: 400, ease: 'Cubic.easeOut' });
                sparkleBurst(this, card.x, card.y, 18, D.fx, 120);
                f.alive = false;
                f.fate = 'bound';
                f.zone.disableInteractive();
                f.stTag.setText('');
                const chip = f.chip;
                f.chip = undefined;
                if (chip) this.tweens.add({ targets: chip, alpha: 0, duration: 400, onComplete: () => chip.destroy() });
                this.tweens.add({ targets: [f.nameText, f.bar, f.shadow, ...f.extras], alpha: 0, duration: 700 });
                this.tweens.add({ targets: [card, crown], alpha: 0, delay: 1300, duration: 400, onComplete: () => {
                  card.destroy();
                  crown.destroy();
                } });
                State.record(f.base.id).bound = true;
                State.get().spares++;
                const where = State.addMonster(newPartyMon(f.base.id, f.lv));
                this.caption.show(`* Captured! ${f.base.name} ${where === 'party' ? 'joins your team.' : 'is sent to your reserve.'}`);
                this.hold(1900, () => this.afterAction());
              } else {
                Sound.shatter();
                sparkleBurst(this, card.x, card.y, 12, D.fx, 90);
                card.destroy();
                f.sprite.setPosition(f.homeX, f.homeY).setScale(sx, sy).setAlpha(1);
                this.idle(f);
                const fail = f.def?.captureFail?.length ? f.def.captureFail[Phaser.Math.Between(0, f.def.captureFail.length - 1)] : `* ${f.name} broke free of the ${name}.`;
                const why = chance >= 0.5 ? 'It nearly held.' : f.hp / f.maxHp > 0.6 ? 'Wear it down first.' : 'Not this time.';
                this.caption.show(`${fail} ${why}`);
                this.hold(1900, () => this.afterAction());
              }
            });
          },
        });
      },
    });
  }

  // ---- result pages ---------------------------------------------------------------------
  private pages(list: string[], done: () => void) {
    this.closeUi();
    this.caption.hide();
    this.phase = 'pages';
    const root = this.add.container(0, 0).setDepth(D.pages);
    const px = 250;
    const pw = 780;
    const pages = list.length ? list : [''];
    // the panel grows to the longest page (a Check can run to five lines), staying above the party box
    const text = body(this, px + 40, 0, '', 24, COLORS.cream, pw - 80);
    const tallest = Math.max(...pages.map((pg) => text.setText(pg).height));
    const ph = Math.min(PANEL_Y - 30, Math.max(210, tallest + 84));
    const py = Math.max(16, Math.min(170, PANEL_Y - 12 - ph));
    text.setY(py + 34);
    const bg = panel(this, px, py, pw, ph, 'blue');
    const shade = this.add.rectangle(px + 14, py + 12, pw - 28, ph - 24, 0x040a12, 0.62).setOrigin(0);
    const hint = label(this, px + pw - 36, py + ph - 34, 'Z  ▸', 16, COLORS.gold, 3).setOrigin(1, 0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, yoyo: true, repeat: -1, duration: 600 });
    const zone = this.add.zone(0, 0, this.scale.width, this.scale.height).setOrigin(0).setInteractive();
    zone.on('pointerdown', () => this.nextPage());
    root.add([zone, bg, shade, text, hint]);
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 180 });
    this.pageState = { root, text, pages, i: 0, done };
    text.setText(this.pageState.pages[0]);
  }

  private nextPage() {
    const p = this.pageState;
    if (!p) return;
    Sound.blip(1.1);
    p.i++;
    if (p.i < p.pages.length) {
      p.text.setText(p.pages[p.i]).setAlpha(0);
      this.tweens.add({ targets: p.text, alpha: 1, duration: 150 });
      return;
    }
    this.pageState = undefined;
    const root = p.root;
    this.tweens.add({ targets: root, alpha: 0, duration: 150, onComplete: () => root.destroy() });
    if (this.phase === 'pages') this.phase = 'busy';
    p.done();
  }

  // ---- outcomes -----------------------------------------------------------------------------
  private writeBack() {
    if (this.tempParty || this.wroteBack) return;
    this.wroteBack = true;
    for (const u of this.units) if (u.side === 'ally' && u.mon) u.mon.hp = Phaser.Math.Clamp(u.hp, 0, u.maxHp);
  }

  private tally() {
    const t = { won: 0, spared: 0, bound: 0 };
    for (const f of this.allFoes) if (f.fate) t[f.fate]++;
    return t;
  }

  /** The battle is decided: the queue and narration step aside. */
  private clearField() {
    this.endAllyTurn();
    this.closeUi();
    this.caption.hide();
    for (const u of this.units) if (u.chip) u.chip.targetAlpha = 0;
  }

  private win() {
    this.phase = 'end';
    this.clearField();
    this.clearActor();
    const s = State.get();
    let exp = 0;
    let gold = 0;
    for (const f of this.allFoes) {
      const d = f.def;
      if (!d) continue;
      if (f.fate === 'won') {
        exp += d.exp;
        gold += d.gold;
      } else if (f.fate === 'bound') exp += d.exp;
      else if (f.fate === 'spared') exp += Math.ceil(d.exp / 2);
    }
    s.gold += gold;
    this.writeBack();
    const standing = this.living('ally');
    const share = Math.ceil(exp / Math.max(1, standing.length));
    const lines = [`* The battle is over.\n* Your team gained ${exp} EXP${gold ? ` and ${gold} G` : ''}.`];
    const grow: string[] = [];
    if (!this.tempParty) {
      for (const a of standing) {
        if (!a.mon) continue;
        const wasEvolved = evolvedOf(a.mon);
        grow.push(...grantExp(a.mon, share));
        if (!wasEvolved && evolvedOf(a.mon)) {
          const evo = baseOf(a.mon.id, true);
          if (evo && this.textures.exists(evo.art)) {
            this.tweens.killTweensOf(a.sprite);
            a.sprite.setTexture(evo.art);
            fitSprite(a.sprite, 118, 230, 132, false);
            sparkleBurst(this, a.homeX, a.homeY - 60, 24, D.fx, 140);
          }
        }
        // the panel shows the grown monster: new name, LV and HP
        const b = baseOf(a.mon.id, evolvedOf(a.mon));
        if (b && b.name !== a.name) {
          a.name = b.name;
          a.nameText.setText(b.name).setScale(1);
          if (a.nameText.width > 250) a.nameText.setScale(250 / a.nameText.width);
        }
        a.lv = a.mon.lv;
        a.maxHp = maxHpOf(a.mon.id, a.mon.lv, evolvedOf(a.mon));
        a.hp = a.mon.hp;
        this.refreshHp(a);
      }
      // fainted monsters come round with 1 HP after a won battle
      for (const a of this.units) if (a.side === 'ally' && a.mon && a.mon.hp <= 0) a.mon.hp = 1;
    }
    if (grow.length) Sound.levelUp();
    else Sound.chime();
    // three lines to a page
    for (let i = 0; i < grow.length; i += 3) lines.push(grow.slice(i, i + 3).join('\n'));
    const leadFate = this.lead?.fate ?? 'won';
    this.time.delayedCall(700, () => this.pages(lines, () => this.finish(leadFate)));
  }

  private lose() {
    this.phase = 'end';
    this.endAllyTurn();
    this.closeUi();
    this.writeBack();
    Sound.stopMusic(0.1);
    Sound.shatter();
    this.caption.show('* Your team has fallen.');
    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(1600, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.stop('World');
        this.scene.start('GameOver');
      });
    });
  }

  private finish(outcome: BattleResult['outcome']) {
    this.phase = 'end';
    this.writeBack();
    Sound.stopMusic(0.4);
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const result: BattleResult = { monster: this.lead?.base.id ?? this.data0.foes[0], outcome, fight: this.data0.fight, tally: this.tally() };
      if (this.debugStart || !this.scene.isSleeping('World')) {
        // a debug run never touches the save slot
        this.scene.start('World', { room: this.roomId, spawn: Object.keys(ROOMS[this.roomId]?.spawns ?? {})[0], debug: true });
        return;
      }
      this.scene.stop();
      this.scene.wake('World', result);
    });
  }

  update(_t: number, rawDt: number) {
    const dt = Math.min(rawDt, 50);
    for (const u of this.units) u.chip?.tick(u.tu, dt);
    const c = this.controls;
    switch (this.phase) {
      case 'menu':
        if (c.pressed('menu') && this.turnUnit?.side === 'ally') {
          Sound.confirm();
          if (this.menuKind === 'ability') this.openTamer(this.turnUnit);
          else this.openAbilities(this.turnUnit);
          return;
        }
        this.menu?.update(c);
        return;
      case 'target':
        if (this.tgt) this.targetUpdate();
        return;
      case 'cards':
        if (this.cards) this.cardsUpdate();
        return;
      case 'pages':
        if (c.pressed('confirm')) this.nextPage();
        return;
      case 'say': {
        this.sayT -= dt;
        if (c.pressed('confirm')) this.sayT = 0;
        if (this.sayT <= 0) {
          const d = this.sayDone;
          this.sayDone = null;
          this.phase = 'busy';
          d?.();
        }
        return;
      }
      default:
        // keep presses made during animations from leaking into the next menu
        for (const k of ['confirm', 'cancel', 'menu', 'up', 'down', 'left', 'right']) c.pressed(k);
        return;
    }
  }
}
