import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { BulletField, PATTERNS, BASE_PATTERNS, Box } from '../battle/patterns';
import { AttackDef, CAPTURE_CARDS, CaptureCard, captureChance, ITEMS, MONSTERS, MonsterDef, SkillDef, skillFrom } from '../data/monsters';
import { STARTERS } from '../data/starters';
import { ROOMS } from '../data/rooms';
import { gainExp, State } from '../state';
import { Controls } from '../ui/input';
import { dustify, fireflies, lightPool, popNumber, sparkleBurst } from '../ui/fx';
import { Bar, body, label, panel, starRow, COLORS, FONT_BODY } from '../ui/widgets';
import type { BattleResult, Wave } from './WorldScene';

type Phase = 'busy' | 'menu' | 'cards' | 'timing' | 'list' | 'capture' | 'text' | 'talk' | 'dodge' | 'end';

interface ListItem {
  text: string;
  color?: string;
  run: () => void;
}

const DEFAULT_BOX: Box = { x: 120, y: 392, w: 1040, h: 190 };
const BUTTONS = [
  { name: 'FIGHT', icon: 'ui_med_monster' },
  { name: 'ACT', icon: 'ui_med_scroll' },
  { name: 'ITEM', icon: 'ui_med_bag' },
  { name: 'MERCY', icon: 'ui_med_mercy' },
];

export class BattleScene extends Phaser.Scene {
  private controls!: Controls;
  private m!: MonsterDef;
  private roomId = 'forest';
  private debugStart = false;
  private phase: Phase = 'busy';
  private hp = 0;
  private mercy = 0;
  private usedActs = new Set<string>();
  private turn = 0;
  private calm = 0;
  private nextTu = 100;

  private monster!: Phaser.GameObjects.Image;
  private companion?: Phaser.GameObjects.Image;
  private monsterBaseY = 0;
  private monsterGlow!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;
  private enemyBar!: Bar;
  private boxFrame!: Phaser.GameObjects.NineSlice;
  private boxInner!: Phaser.GameObjects.Rectangle;
  private box: Box = { ...DEFAULT_BOX };
  private boxText!: Phaser.GameObjects.Text;
  private maskG!: Phaser.GameObjects.Graphics;
  private hpBar!: Bar;
  private hpText!: Phaser.GameObjects.Text;
  private lvText!: Phaser.GameObjects.Text;
  private buttons: { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text; halo: Phaser.GameObjects.Image }[] = [];
  private btnSel = 0;
  private soul!: Phaser.GameObjects.Image;
  private soulGlow!: Phaser.GameObjects.Image;
  private cursorSoul!: Phaser.GameObjects.Image;
  private listObjs: Phaser.GameObjects.GameObject[] = [];
  private list: ListItem[] = [];
  private listSel = 0;
  private listBack: (() => void) | null = null;
  private cards: { c: Phaser.GameObjects.Container; skill: SkillDef; locked: boolean }[] = [];
  private cardSel = 0;
  private tooltip?: Phaser.GameObjects.Container;
  private timing?: { cursor: Phaser.GameObjects.Image; t: number; x0: number; x1: number; objs: Phaser.GameObjects.GameObject[]; skill: SkillDef; stopped: boolean };
  private typing = { full: '', shown: 0, acc: 0, pages: [] as string[], page: 0, done: null as null | (() => void) };
  private bubble?: Phaser.GameObjects.Container;
  private bubbleDone: (() => void) | null = null;
  private bubbleTimer = 0;
  private field?: BulletField;
  private dodge?: { t: number; dur: number; run: (t: number, dt: number) => void; inv: number; atk: AttackDef; tag: Phaser.GameObjects.Text; blind?: Phaser.GameObjects.Image };
  private dot?: { left: number; acc: number; kind: string };
  private captureCards: { c: Phaser.GameObjects.Container; card: CaptureCard; owned: number; canBuy: boolean; usable: boolean; pct: number }[] = [];
  private captureSel = 0;
  private wave?: Wave;
  private captureInfo?: Phaser.GameObjects.Text;
  private captureTitle?: Phaser.GameObjects.Text;

  constructor() {
    super('Battle');
  }

  init(data: { monster: string; room?: string; debug?: boolean; wave?: Wave }) {
    this.m = MONSTERS[data.monster] ?? MONSTERS.bat_fiend;
    this.roomId = data.room ?? 'forest';
    this.debugStart = !!data.debug;
    this.wave = data.wave;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.controls = new Controls(this);
    this.companion = undefined;
    this.hp = this.m.hp;
    this.mercy = 0;
    this.usedActs = new Set();
    this.turn = 0;
    this.calm = 0;
    this.buttons = [];
    this.btnSel = 0;
    this.phase = 'busy';
    const rec = State.record(this.m.id);
    rec.seen = true;

    // Backdrop: the current room painting, blurred and darkened.
    const bgKey = ROOMS[this.roomId]?.bg ?? 'bg_forest';
    const bg = this.add.image(W / 2, H / 2, bgKey);
    bg.setScale(Math.max(W / bg.width, H / bg.height) * 1.15);
    try {
      bg.preFX?.addBlur(1, 2, 2, 1.4);
    } catch {
      /* FX unsupported */
    }
    this.add.rectangle(0, 0, W, H, 0x040712, 0.42).setOrigin(0);
    const tint = Phaser.Display.Color.HexStringToColor(this.m.color).color;
    lightPool(this, W / 2, 250, 380, tint, false, 1).setAlpha(0.3);
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setAlpha(1).setDepth(1);
    fireflies(this, 0, 0, W, 380, 18, 2, tint);

    // Monster
    const floor = this.add.image(W / 2, 372, 'shadow').setScale(3.2, 1.6).setDepth(3).setAlpha(0.9);
    floor.setTint(0x000000);
    this.monsterGlow = this.add.image(W / 2, 260, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(0.18).setScale(2.4).setDepth(3);
    this.tweens.add({ targets: this.monsterGlow, alpha: 0.3, scale: 2.6, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.easeInOut' });
    this.monster = this.add.image(W / 2, 376, this.m.art).setOrigin(0.5, 1).setDepth(4);
    // Original DIB sprites are small: show them unaltered at a crisp integer scale.
    this.monster.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const fit = Math.min(this.m.height / this.monster.height, 520 / this.monster.width);
    const sc = fit >= 2 ? Math.max(2, Math.min(Math.round(fit), Math.floor(360 / this.monster.height))) : fit;
    if (this.m.faces === 'right') this.monster.setFlipX(false);
    this.monster.setScale(sc);
    this.monsterBaseY = 376;
    this.idleMonster();

    // Enemy nameplate (top-left), styled after the "Bat Fiend" plate in the UI sheet.
    this.nameText = label(this, 44, 26, this.m.name, 38, this.m.color, 8).setDepth(20);
    this.enemyBar = new Bar(this, 44, 92, 300, 'red', 34).setDepth(20);
    const nStars = Math.ceil(this.m.stars);
    starRow(this, this.nameText.x + this.nameText.width + 4 + (nStars * 24) / 2, 50, this.m.stars, nStars * 24, 24).setDepth(20);
    if (this.m.boss) label(this, 44, 120, 'GUARDIAN', 18, COLORS.gold, 5).setDepth(20);
    else if (this.m.rare) label(this, 44, 120, 'RARE SIGHTING', 18, '#9fd8ff', 5).setDepth(20);
    if (this.wave) {
      // the ritual group: which foe this is, of how many
      label(this, this.scale.width - 44, 30, `${this.wave.index} of ${this.wave.total}`, 26, COLORS.cream, 6).setOrigin(1, 0).setDepth(20);
      label(this, this.scale.width - 44, 66, this.wave.queue.length ? `${this.wave.queue.length} more waiting` : 'the last of them', 17, '#c9b98a', 4).setOrigin(1, 0).setDepth(20);
    }

    // Bullet board / text box
    this.boxFrame = panel(this, this.box.x - 14, this.box.y - 14, this.box.w + 28, this.box.h + 28, 'blue').setDepth(10);
    this.boxInner = this.add.rectangle(this.box.x, this.box.y, this.box.w, this.box.h, 0x050b18, 0.82).setOrigin(0).setDepth(11);
    this.maskG = this.make.graphics({}, false);
    this.boxText = body(this, this.box.x + 30, this.box.y + 24, '', 28, COLORS.cream, this.box.w - 60).setDepth(13);

    // The tamer's hatchling stands on the left, facing the enemy.
    const stId = State.get().starter?.id;
    if (stId) {
      const key = State.get().starter?.evolved && this.textures.exists('starter_' + stId + '_evo') ? 'starter_' + stId + '_evo' : 'starter_' + stId;
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.add.image(200, 382, 'shadow').setScale(1.1, 0.7).setDepth(3).setAlpha(0.8);
        this.companion = this.add.image(200, 380, key).setOrigin(0.5, 1).setDepth(4);
        this.companion.setScale(Math.max(1, Math.round(130 / this.companion.height)));
        this.tweens.add({ targets: this.companion, y: 376, yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut' });
      }
    }

    // Player stats line
    const s = State.get();
    this.lvText = label(this, 140, 614, `${s.name.toUpperCase()}   LV ${s.lv}`, 26, COLORS.cream, 6).setOrigin(0, 0.5).setDepth(20);
    label(this, 470, 614, 'HP', 22, COLORS.gold, 5).setOrigin(0, 0.5).setDepth(20);
    this.hpBar = new Bar(this, 514, 614, 200, 'orange', 30).setDepth(20);
    this.hpText = label(this, 730, 614, '', 24, COLORS.cream, 6).setOrigin(0, 0.5).setDepth(20);
    this.refreshHp(false);

    // Command buttons: painted medallions from the UI sheet.
    BUTTONS.forEach((b, i) => {
      const x = 210 + i * 262;
      const halo = this.add.image(x, 672, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setScale(0.75).setAlpha(0).setDepth(19);
      const icon = this.add.image(x, 672, b.icon).setScale(0.48).setDepth(20);
      const text = label(this, x + 40, 672, b.name, 30, COLORS.cream, 7).setOrigin(0, 0.5).setDepth(20);
      this.buttons.push({ icon, text, halo });
    });
    this.cursorSoul = this.add.image(0, 0, 'ui_soul').setScale(0.17).setDepth(30).setVisible(false);

    // Soul
    this.soulGlow = this.add.image(640, 490, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff4a5a).setScale(0.32).setAlpha(0.6).setDepth(26).setVisible(false);
    this.soul = this.add.image(640, 490, 'ui_soul').setScale(0.2).setDepth(27);

    // Intro: the soul arrives from the overworld transition, then settles.
    this.cameras.main.fadeIn(350, 0, 0, 0);
    Sound.playMusic(this.m.music);
    this.monster.setAlpha(0).setY(this.monsterBaseY + 30);
    this.tweens.add({ targets: this.monster, alpha: 1, y: this.monsterBaseY, duration: 600, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.soul, alpha: 0, duration: 400, delay: 200, onComplete: () => this.soul.setVisible(false).setAlpha(1) });
    const w = this.wave;
    const intro = w && w.index > 1 && w.between.length ? w.between[(w.index - 2) % w.between.length].replace('{N}', String(w.queue.length + 1)) : this.m.intro;
    this.time.delayedCall(500, () => this.toMenu(intro));
  }

  // ---- helpers -------------------------------------------------------------
  private idleMonster() {
    this.tweens.killTweensOf(this.monster);
    const flier = !!this.m.flier;
    this.tweens.add({ targets: this.monster, y: this.monsterBaseY - (flier ? 14 : 4), duration: flier ? 900 : 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const sx = this.monster.scaleX;
    const sy = this.monster.scaleY;
    this.tweens.add({ targets: this.monster, scaleY: sy * 1.02, scaleX: sx * 0.995, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private refreshHp(animate = true) {
    const s = State.get();
    this.hpBar.set(s.hp / s.maxHp, animate);
    this.hpText.setText(`${Math.max(0, s.hp)} / ${s.maxHp}`);
  }

  private setButtons(active: boolean) {
    this.buttons.forEach((b, i) => {
      const sel = active && i === this.btnSel;
      b.text.setColor(sel ? COLORS.yellow : COLORS.cream);
      this.tweens.killTweensOf(b.icon);
      this.tweens.add({ targets: b.icon, scale: sel ? 0.56 : 0.48, duration: 120 });
      b.halo.setAlpha(sel ? 0.45 : 0);
      b.icon.setAlpha(active || i === this.btnSel ? 1 : 0.85);
    });
    if (active) {
      const b = this.buttons[this.btnSel];
      this.cursorSoul.setVisible(true).setPosition(b.icon.x - 52, b.icon.y);
    }
  }

  private spareable() {
    return this.mercy >= 100 && (this.m.role !== 'boss' || this.turn >= 3);
  }

  private updateName() {
    const ok = this.spareable();
    this.nameText.setColor(ok ? COLORS.yellow : this.m.color);
    if (ok && !this.nameText.getData('glow')) {
      this.nameText.setData('glow', true);
      sparkleBurst(this, this.nameText.x + this.nameText.width / 2, this.nameText.y + 26, 10, 40, 60);
    }
  }

  private clearList() {
    for (const o of this.listObjs) o.destroy();
    this.listObjs = [];
    this.cursorSoul.setVisible(false);
  }

  private resizeBox(target: Box, ms = 260, done?: () => void) {
    const from = { ...this.box };
    const o = { k: 0 };
    this.tweens.add({
      targets: o,
      k: 1,
      duration: ms,
      ease: 'Cubic.easeInOut',
      onUpdate: () => this.applyBox({
        x: Phaser.Math.Linear(from.x, target.x, o.k),
        y: Phaser.Math.Linear(from.y, target.y, o.k),
        w: Phaser.Math.Linear(from.w, target.w, o.k),
        h: Phaser.Math.Linear(from.h, target.h, o.k),
      }),
      onComplete: () => {
        this.applyBox(target);
        done?.();
      },
    });
  }

  private applyBox(b: Box) {
    this.box = { ...b };
    this.boxFrame.setPosition(b.x - 14, b.y - 14);
    this.boxFrame.setSize(b.w + 28, b.h + 28);
    this.boxInner.setPosition(b.x, b.y).setSize(b.w, b.h);
    this.maskG.clear().fillStyle(0xffffff).fillRect(b.x, b.y, b.w, b.h);
  }

  // ---- text in the box -----------------------------------------------------
  private boxSay(pages: string | string[], done: () => void) {
    this.clearList();
    this.phase = 'text';
    const list = Array.isArray(pages) ? pages : [pages];
    this.typing = { full: list[0], shown: 0, acc: 0, pages: list, page: 0, done };
    this.boxText.setText('').setVisible(true);
  }

  private updateTyping(dt: number) {
    const ty = this.typing;
    if (ty.shown < ty.full.length) {
      ty.acc += dt;
      while (ty.acc > 24 && ty.shown < ty.full.length) {
        ty.acc -= 24;
        ty.shown++;
        if (ty.shown % 2 === 0 && ty.full[ty.shown - 1] !== ' ') Sound.blip(0.9);
      }
      this.boxText.setText(ty.full.slice(0, ty.shown));
      if (this.controls.pressed('confirm') || this.controls.pressed('cancel')) {
        ty.shown = ty.full.length;
        this.boxText.setText(ty.full);
      }
      return;
    }
    if (this.controls.pressed('confirm')) {
      ty.page++;
      if (ty.page < ty.pages.length) {
        ty.full = ty.pages[ty.page];
        ty.shown = 0;
        this.boxText.setText('');
      } else {
        const d = ty.done;
        ty.done = null;
        d?.();
      }
    }
  }

  // ---- main menu -------------------------------------------------------------
  private toMenu(flavor?: string) {
    this.clearList();
    this.phase = 'menu';
    const text = flavor ?? this.m.idle[(this.turn - 1 + this.m.idle.length) % this.m.idle.length];
    this.typing = { full: text, shown: 0, acc: 0, pages: [text], page: 0, done: null };
    this.boxText.setText('').setVisible(true);
    this.setButtons(true);
  }

  private menuUpdate(dt: number) {
    const ty = this.typing;
    if (ty.shown < ty.full.length) {
      ty.acc += dt;
      while (ty.acc > 22 && ty.shown < ty.full.length) {
        ty.acc -= 22;
        ty.shown++;
      }
      this.boxText.setText(ty.full.slice(0, ty.shown));
    }
    if (this.controls.pressed('left')) {
      this.btnSel = (this.btnSel + 3) % 4;
      Sound.move();
      this.setButtons(true);
    }
    if (this.controls.pressed('right')) {
      this.btnSel = (this.btnSel + 1) % 4;
      Sound.move();
      this.setButtons(true);
    }
    if (this.controls.pressed('confirm')) {
      Sound.confirm();
      this.boxText.setText('');
      this.setButtons(false);
      [() => this.openCards(), () => this.openActs(), () => this.openItems(), () => this.openMercy()][this.btnSel]();
    }
  }

  // ---- lists (ACT / ITEM / MERCY) -------------------------------------------
  private openList(items: ListItem[], back: () => void) {
    this.clearList();
    this.boxText.setVisible(false);
    this.phase = 'list';
    this.list = items;
    this.listSel = 0;
    this.listBack = back;
    items.forEach((it, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const t = body(this, this.box.x + 90 + col * 470, this.box.y + 28 + row * 54, `* ${it.text}`, 30, it.color ?? COLORS.cream).setDepth(14);
      this.listObjs.push(t);
    });
    this.refreshList();
  }

  private refreshList() {
    this.listObjs.forEach((o, i) => {
      const t = o as Phaser.GameObjects.Text;
      t.setColor(i === this.listSel ? COLORS.yellow : this.list[i].color ?? COLORS.cream);
    });
    const t = this.listObjs[this.listSel] as Phaser.GameObjects.Text;
    this.cursorSoul.setVisible(true).setPosition(t.x - 30, t.y + 22);
  }

  private listUpdate() {
    const c = this.controls;
    const n = this.list.length;
    let sel = this.listSel;
    if (c.pressed('right') && sel % 2 === 0 && sel + 1 < n) sel++;
    if (c.pressed('left') && sel % 2 === 1) sel--;
    if (c.pressed('down') && sel + 2 < n) sel += 2;
    if (c.pressed('up') && sel - 2 >= 0) sel -= 2;
    if (sel !== this.listSel) {
      this.listSel = sel;
      Sound.move();
      this.refreshList();
    }
    if (c.pressed('confirm')) {
      Sound.confirm();
      const it = this.list[this.listSel];
      this.clearList();
      it.run();
    } else if (c.pressed('cancel')) {
      Sound.cancel();
      this.clearList();
      this.listBack?.();
    }
  }

  private openActs() {
    const items: ListItem[] = this.m.acts.map((a) => ({
      text: a.name,
      run: () => {
        if (a.name === 'Check') return this.boxSay(['* ' + this.m.check.replace('\n', '\n')], () => this.enemyTurn(100));
        const first = !this.usedActs.has(a.name);
        this.usedActs.add(a.name);
        if (first || !a.once) this.mercy = Math.min(100, this.mercy + a.mercy);
        else this.mercy = Math.min(100, this.mercy + 8);
        if (a.calm) this.calm += a.calm;
        if (a.heal) this.heal(a.heal);
        const extra = !first && a.once ? ['* It barely reacts this time.'] : [];
        this.reactMonster();
        this.boxSay([...a.text, ...extra], () => {
          this.updateName();
          this.enemyTurn(100);
        });
      },
    }));
    this.openList(items, () => this.toMenu());
  }

  private openItems() {
    const inv = State.get().inventory;
    const items: ListItem[] = Object.entries(inv)
      .filter(([id, n]) => n > 0 && !ITEMS[id]?.key && !ITEMS[id]?.capture)
      .map(([id, n]) => ({ text: `${ITEMS[id]?.name ?? id}  x${n}`, run: () => this.useItem(id) }));
    if (!items.length) {
      this.boxSay('* Your satchel is empty.', () => this.toMenu());
      return;
    }
    this.openList(items, () => this.toMenu());
  }

  private openMercy() {
    const ok = this.spareable();
    const items: ListItem[] = [
      { text: 'Spare', color: ok ? COLORS.yellow : COLORS.cream, run: () => this.trySpare() },
      { text: 'Capture', run: () => this.openCapture() },
      { text: 'Flee', run: () => this.tryFlee() },
    ];
    this.openList(items, () => this.toMenu());
  }

  private heal(n: number) {
    const s = State.get();
    const before = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + n);
    this.refreshHp();
    Sound.heal();
    popNumber(this, 600, 560, `+${s.hp - before}`, '#7dff9a');
  }

  private useItem(id: string) {
    if (!State.useItem(id)) return this.toMenu();
    const amount = id === 'tart' ? 30 : 15;
    this.heal(amount);
    const s = State.get();
    this.boxSay([`* You drink the ${ITEMS[id].name}.`, s.hp >= s.maxHp ? '* Your HP was maxed out.' : `* You recovered ${amount} HP.`], () => this.enemyTurn(100));
  }

  // ---- FIGHT: skill cards + timing bar --------------------------------------
  /** The companion hatchling's real DIB abilities (plus its Dragonling's once evolved). */
  private skills(): SkillDef[] {
    const s = State.get();
    const st = STARTERS.find((x) => x.id === s.starter?.id) ?? STARTERS.find((x) => x.choice === 'fire');
    if (!st) return [skillFrom({ name: 'Tail', tu: '70', effect: 'Physical Damage' })];
    const base = st.abilities.filter((a) => a.tu && a.tu !== '-').map((a) => skillFrom(a)).sort((a, b) => a.tu - b.tu);
    const evo = st.evolution.next_abilities
      .filter((a) => a.tu && a.tu !== '-' && !base.some((b) => b.name === a.name))
      .map((a) => skillFrom(a, st.evolution.at_level));
    return [...base, ...evo].slice(0, 4);
  }

  private openCards() {
    this.clearList();
    this.boxText.setVisible(false);
    this.phase = 'cards';
    this.cards = [];
    const lv = State.get().lv;
    const skills = this.skills();
    const gap = Math.min(250, (this.box.w - 120) / skills.length);
    const x0 = this.box.x + this.box.w / 2 - (gap * (skills.length - 1)) / 2;
    skills.forEach((sk, i) => {
      const x = x0 + i * gap;
      const y = this.box.y + 62;
      const locked = lv < sk.minLv;
      const c = this.add.container(x, y).setDepth(15);
      const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setScale(1.1, 0.8).setAlpha(0).setName('glow');
      const card = this.add.image(0, 0, sk.card).setScale(0.62);
      if (locked) card.setTint(0x666677);
      const nm = label(this, 0, 48, locked ? '???' : sk.name, 26, COLORS.cream, 6).setOrigin(0.5, 0);
      const tu = label(this, 0, 80, `TU:${sk.tu}`, 20, locked ? '#8a8a8a' : COLORS.cream, 5).setOrigin(0.5, 0);
      const info = this.add.image(nm.width / 2 + 22, 64, 'ui_btn_info').setScale(0.36);
      c.add([glow, card, nm, tu, info]);
      c.setAlpha(0).setY(y + 16);
      this.tweens.add({ targets: c, alpha: 1, y, duration: 180, delay: i * 40, ease: 'Cubic.easeOut' });
      this.cards.push({ c, skill: sk, locked });
      this.listObjs.push(c);
    });
    this.cardSel = 0;
    this.refreshCards();
  }

  private refreshCards() {
    this.cards.forEach((cd, i) => {
      const sel = i === this.cardSel;
      const glow = cd.c.getByName('glow') as Phaser.GameObjects.Image;
      glow.setAlpha(sel ? 0.5 : 0);
      this.tweens.killTweensOf(cd.c);
      cd.c.setAlpha(1);
      this.tweens.add({ targets: cd.c, scale: sel ? 1.1 : 0.95, y: this.box.y + 62 - (sel ? 8 : 0), duration: 120 });
      const nm = cd.c.list[2] as Phaser.GameObjects.Text;
      nm.setColor(sel ? COLORS.yellow : cd.locked ? '#8a8a8a' : COLORS.cream);
    });
    const cd = this.cards[this.cardSel];
    this.tooltip?.destroy();
    const desc = cd.locked ? `Locked — reach LV ${cd.skill.minLv}.` : cd.skill.desc;
    const tt = this.add.container(cd.c.x, this.box.y - 40).setDepth(40);
    const t = body(this, 0, 0, desc, 20, COLORS.ink, 0).setOrigin(0.5).setStroke('#fff4dc', 0).setShadow(0, 0, '#000', 0);
    const p = panel(this, -t.width / 2 - 26, -26, t.width + 52, 52, 'parchment');
    tt.add([p, t]);
    const minX = 30 + t.width / 2 + 26;
    const maxX = this.scale.width - 30 - t.width / 2 - 26;
    tt.x = Phaser.Math.Clamp(tt.x, minX, maxX);
    this.tooltip = tt;
    this.listObjs.push(tt);
  }

  private cardsUpdate() {
    const c = this.controls;
    const goL = c.pressed('left');
    const goR = c.pressed('right');
    if (goL || goR) {
      this.cardSel = (this.cardSel + (goL ? this.cards.length - 1 : 1)) % this.cards.length;
      Sound.move();
      this.refreshCards();
    }
    if (c.pressed('cancel')) {
      Sound.cancel();
      this.tooltip = undefined;
      this.clearList();
      this.toMenu();
      return;
    }
    if (c.pressed('confirm')) {
      const cd = this.cards[this.cardSel];
      if (cd.locked) {
        Sound.cancel();
        this.cameras.main.shake(80, 0.002);
        return;
      }
      Sound.confirm();
      this.tooltip = undefined;
      this.clearList();
      if (cd.skill.support) this.useSupport(cd.skill);
      else this.startTiming(cd.skill);
    }
  }

  private startTiming(skill: SkillDef) {
    this.phase = 'timing';
    const b = this.box;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const tw = 860;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const track = panel(this, cx - tw / 2 - 16, cy - 40, tw + 32, 80, 'parchment').setDepth(14);
    objs.push(track);
    const zones: [number, number, number][] = [[tw, 0x3a1f10, 0.55], [tw * 0.5, 0x8a4a14, 0.6], [tw * 0.2, 0xd08a1e, 0.75], [tw * 0.06, 0xffe07a, 0.95]];
    for (const [w, col, a] of zones) objs.push(this.add.rectangle(cx, cy, w, 34, col, a).setDepth(15));
    objs.push(this.add.image(cx, cy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setScale(0.5, 0.35).setAlpha(0.6).setDepth(16));
    const cursor = this.add.image(cx - tw / 2, cy - 4, 'ui_cursor_diamond').setScale(0.9).setDepth(17);
    objs.push(cursor);
    const hint = label(this, cx, b.y + b.h - 22, 'Z — strike', 22, COLORS.cream, 5).setOrigin(0.5).setDepth(17);
    objs.push(hint);
    this.timing = { cursor, t: 0, x0: cx - tw / 2, x1: cx + tw / 2, objs, skill, stopped: false };
  }

  private timingUpdate(dt: number) {
    const tm = this.timing!;
    if (tm.stopped) return;
    tm.t += dt / 1000;
    const dur = 1.25;
    const k = tm.t / dur;
    tm.cursor.x = Phaser.Math.Linear(tm.x0, tm.x1, Math.min(1, k));
    if (this.controls.pressed('confirm') || k >= 1) {
      tm.stopped = true;
      const center = (tm.x0 + tm.x1) / 2;
      const acc = k >= 1 ? 0 : 1 - Math.abs(tm.cursor.x - center) / ((tm.x1 - tm.x0) / 2);
      this.tweens.add({ targets: tm.cursor, scale: 1.3, yoyo: true, duration: 90, repeat: 2 });
      this.time.delayedCall(320, () => {
        for (const o of tm.objs) o.destroy();
        this.timing = undefined;
        this.performAttack(tm.skill, acc);
      });
    }
  }

  private useSupport(skill: SkillDef) {
    this.phase = 'busy';
    const comp = this.companion;
    if (comp) this.tweens.add({ targets: comp, y: comp.y - 18, yoyo: true, duration: 220, repeat: 1 });
    Sound.chime();
    this.calm += 1.5;
    this.heal(6);
    const who = this.companionName();
    this.boxSay([`* ${who} uses ${skill.name}.`, `* ${skill.desc.replace(/\.$/, '')}.`, '* You steady yourself. (+6 HP, the next attack is shorter.)'], () => this.enemyTurn(skill.tu));
  }

  private companionName() {
    const st = STARTERS.find((x) => x.id === State.get().starter?.id);
    if (!st) return 'Your hatchling';
    return State.get().starter?.evolved ? st.evolution.next_name : st.name;
  }

  private performAttack(skill: SkillDef, acc: number) {
    this.phase = 'busy';
    const s = State.get();
    if (acc <= 0.02) {
      label(this, this.monster.x, 200, 'MISS', 44, '#cfd8e8', 8).setOrigin(0.5).setDepth(60).setAlpha(1);
      this.time.delayedCall(700, () => this.enemyTurn(skill.tu));
      Sound.cancel();
      return;
    }
    const crit = acc > 0.94;
    const mult = (0.3 + 0.7 * acc) * (crit ? 1.3 : 1);
    const dmg = Math.max(1, Math.round(s.atk * skill.power * mult * Phaser.Math.FloatBetween(0.9, 1.1) - this.m.def));
    this.playSkillFx(skill, () => {
      this.hp = Math.max(0, this.hp - dmg);
      this.enemyBar.set(this.hp / this.m.hp);
      Sound.hit();
      this.cameras.main.shake(160, 0.006);
      this.monster.setTintFill(0xffffff);
      this.time.delayedCall(70, () => this.monster.clearTint());
      this.tweens.add({ targets: this.monster, x: { from: this.monster.x - 14, to: this.monster.x }, duration: 260, ease: 'Sine.easeOut' });
      popNumber(this, this.monster.x + 60, 180, `${dmg}`, crit ? COLORS.yellow : '#ff5a5a', 60);
      if (crit) label(this, this.monster.x - 80, 140, 'CRITICAL', 24, COLORS.yellow, 4).setOrigin(0.5).setDepth(60);
      // Hurting a monster makes it less inclined to trust you.
      this.mercy = Math.max(0, this.mercy - 10);
      this.updateName();
      this.time.delayedCall(900, () => {
        if (this.hp <= 0) this.defeat();
        else this.enemyTurn(skill.tu);
      });
    });
  }

  private playSkillFx(skill: SkillDef, impact: () => void) {
    const mx = this.monster.x;
    const my = this.monsterBaseY - this.monster.displayHeight * 0.5;
    const comp = this.companion;
    if (comp) this.tweens.add({ targets: comp, x: comp.x + 120, yoyo: true, duration: 160, ease: 'Quad.easeOut' });
    if (skill.card === 'ui_card_tail' || skill.card === 'ui_card_outrage') {
      const hits = skill.card === 'ui_card_outrage' ? 3 : 1;
      for (let h = 0; h < hits; h++) {
        this.time.delayedCall(h * 170, () => {
          Sound.slash();
          const g = this.add.graphics().setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
          const dir = h % 2 === 0 ? 1 : -1;
          const o = { k: 0 };
          this.tweens.add({
            targets: o,
            k: 1,
            duration: 200,
            onUpdate: () => {
              g.clear();
              g.lineStyle(10 * (1 - o.k) + 2, 0xffffff, 1 - o.k * 0.6);
              g.beginPath();
              g.arc(mx, my, 150, Phaser.Math.DegToRad(dir > 0 ? 200 : -20), Phaser.Math.DegToRad((dir > 0 ? 200 : -20) + dir * 140 * o.k), dir < 0);
              g.strokePath();
            },
            onComplete: () => g.destroy(),
          });
          sparkleBurst(this, mx + dir * 40, my, 6, 55, 80);
        });
      }
      this.time.delayedCall(hits * 170 + 60, impact);
    } else if (skill.card === 'ui_card_flame') {
      Sound.whoosh();
      for (let i = 0; i < 10; i++) {
        const f = this.add.image(mx + Phaser.Math.Between(-90, 90), my + 140, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(i % 2 ? 0xff7a1a : 0xffd04a).setScale(0.3).setDepth(50);
        this.tweens.add({ targets: f, y: my - Phaser.Math.Between(40, 160), scale: 0.9, alpha: 0, duration: 520, delay: i * 30, onComplete: () => f.destroy() });
      }
      this.time.delayedCall(380, impact);
    } else {
      Sound.chime();
      const ring = this.add.image(mx, my, 'ui_fx_silverring').setBlendMode(Phaser.BlendModes.ADD).setScale(0.4).setDepth(50).setTint(0x9fd8ff);
      this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
      sparkleBurst(this, mx, my, 20, 55, 200);
      this.time.delayedCall(500, impact);
    }
  }

  private reactMonster() {
    this.tweens.add({ targets: this.monster, angle: { from: -3, to: 3 }, duration: 120, yoyo: true, repeat: 1, onComplete: () => this.monster.setAngle(0) });
  }

  // ---- enemy turn ------------------------------------------------------------
  private enemyTurn(tu: number) {
    this.turn++;
    this.nextTu = tu;
    const line = this.m.talk[(this.turn - 1) % this.m.talk.length];
    this.showBubble(line, () => this.startDodge());
  }

  private showBubble(text: string, done: () => void) {
    this.phase = 'talk';
    this.bubble?.destroy();
    const x = this.monster.x + Math.min(260, this.monster.displayWidth / 2) + 10;
    const y = 120;
    const t = this.add.text(0, 0, text, { fontFamily: FONT_BODY, fontStyle: '700', fontSize: '27px', color: COLORS.ink, align: 'left', lineSpacing: 4 }).setOrigin(0, 0.5);
    const w = t.width + 50;
    const h = t.height + 40;
    const p = panel(this, -20, -h / 2, w, h, 'parchment');
    const tail = this.add.triangle(-18, 0, 0, -12, 0, 12, -22, 4, 0xe9d1a6).setOrigin(0, 0.5);
    t.setX(5);
    const c = this.add.container(x, y, [tail, p, t]).setDepth(45);
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 160, ease: 'Cubic.easeOut' });
    Sound.blip(0.7);
    this.bubble = c;
    this.bubbleDone = done;
    this.bubbleTimer = 0;
  }

  private bubbleUpdate(dt: number) {
    this.bubbleTimer += dt;
    if (this.controls.pressed('confirm') || this.bubbleTimer > 2600) {
      const b = this.bubble;
      this.bubble = undefined;
      if (b) this.tweens.add({ targets: b, alpha: 0, scale: 0.8, duration: 120, onComplete: () => b.destroy() });
      const d = this.bubbleDone;
      this.bubbleDone = null;
      this.phase = 'busy';
      d?.();
    }
  }

  private startDodge() {
    this.phase = 'busy';
    this.boxText.setVisible(false);
    const list: AttackDef[] = this.m.attacks?.length ? this.m.attacks : this.m.patterns.map((p) => ({ ability: 'Attack', tu: 100, pattern: p, projectile: 'fx_sparkle', twist: 'none' }));
    const atk = list[(this.turn - 1) % list.length];
    const pat = PATTERNS[BASE_PATTERNS[atk.pattern] ?? atk.pattern] ?? PATTERNS.bat_sparkle;
    let [w, h] = atk.box ?? pat.box;
    if (atk.twist === 'all_foes_wide') w = Math.min(560, w + 80);
    w = Math.min(w, 560);
    h = Math.min(h, 250); // keep the board clear of the monster and the HP line
    const target: Box = { x: 640 - w / 2, y: 488 - h / 2 + 40, w, h };
    target.y = Math.max(Math.min(target.y, 600 - h), 340);
    // Real DIB Time Units: the ability's own TU plus the TU of the move you just used.
    const base = 2.2 + this.nextTu * 0.016 + atk.tu * 0.008 + (this.m.boss ? 1.2 : 0);
    const dur = Math.max(2.4, base - this.calm);
    this.calm = 0;
    const tag = label(this, 640, target.y - 44, `${atk.ability.toUpperCase()}  ·  TU ${atk.tu}`, 24, this.m.color, 6).setOrigin(0.5).setDepth(40).setAlpha(0);
    this.tweens.add({ targets: tag, alpha: 1, duration: 160 });
    this.resizeBox(target, 300, () => {
      this.soul.setVisible(true).setPosition(target.x + target.w / 2, target.y + target.h / 2).setAlpha(1).setScale(0.2);
      this.soulGlow.setVisible(true);
      this.field = new BulletField(this, target, 24);
      if (atk.tint) this.field.tint = Phaser.Display.Color.HexStringToColor(atk.tint).color;
      this.field.layer.setMask(this.maskG.createGeometryMask());
      let power = ((this.m.boss ? 1.08 : 0.92) + this.turn * (this.m.boss ? 0.05 : 0.04)) * (atk.intensity ?? 1);
      if (atk.twist === 'multi_hit') power *= 1.2;
      const run = pat.run({ scene: this, field: this.field, box: target, soul: this.soul, power: Phaser.Math.Clamp(power, 0.6, 1.7), rng: new Phaser.Math.RandomDataGenerator([`${this.turn}${atk.ability}`]), proj: this.m.attacks?.length ? 'ui_' + atk.projectile : undefined });
      let blind: Phaser.GameObjects.Image | undefined;
      if (atk.twist === 'blind') blind = this.add.image(this.soul.x, this.soul.y, 'vignette').setDisplaySize(target.w * 1.5, target.h * 1.5).setDepth(25).setTint(0x000000);
      if (atk.twist === 'confuse') label(this, 640, target.y + target.h + 26, 'Confused — your movements are reversed', 18, COLORS.yellow, 5).setOrigin(0.5).setDepth(40).setName('twistTag');
      this.dodge = { t: 0, dur, run, inv: 0, atk, tag, blind };
      this.phase = 'dodge';
    });
  }

  private dodgeUpdate(dt: number) {
    const d = this.dodge!;
    d.t += dt / 1000;
    const b = this.box;
    const ax = this.controls.axis();
    if (d.atk.twist === 'confuse') {
      ax.x = -ax.x;
      ax.y = -ax.y;
    }
    const slow = d.atk.twist === 'slow' ? 0.62 : 1;
    const sp = (this.controls.down('cancel') ? 120 : 230) * slow * (dt / 1000);
    const len = Math.hypot(ax.x, ax.y) || 1;
    const r = 11;
    this.soul.x = Phaser.Math.Clamp(this.soul.x + (ax.x / len) * sp, b.x + r, b.x + b.w - r);
    this.soul.y = Phaser.Math.Clamp(this.soul.y + (ax.y / len) * sp, b.y + r, b.y + b.h - r);
    this.soulGlow.setPosition(this.soul.x, this.soul.y);
    d.blind?.setPosition(this.soul.x, this.soul.y);
    d.run(d.t, dt);
    const hit = this.field!.update(dt, { x: this.soul.x, y: this.soul.y, r: 6 });
    if (d.inv > 0) {
      d.inv -= dt / 1000;
      this.soul.setAlpha(Math.floor(d.inv * 12) % 2 ? 0.3 : 1);
      if (d.inv <= 0) this.soul.setAlpha(1);
    } else if (hit) {
      const dmg = this.hurt();
      if (d.atk.twist === 'lifesteal' && this.hp > 0) {
        const heal = Math.max(1, Math.round(dmg * 0.5));
        this.hp = Math.min(this.m.hp, this.hp + heal);
        this.enemyBar.set(this.hp / this.m.hp);
        popNumber(this, this.monster.x + 60, 200, `+${heal}`, '#7dff9a', 60).setFontSize(30);
      }
      if (d.atk.twist === 'poison' || d.atk.twist === 'burn') this.dot = { left: d.atk.twist === 'poison' ? 6 : 3, acc: 0, kind: d.atk.twist };
      if (State.get().hp <= 0) return this.lose();
      d.inv = 1.0;
    }
    if (this.dot) {
      this.dot.acc += dt;
      if (this.dot.acc > 600) {
        this.dot.acc = 0;
        this.dot.left--;
        const s = State.get();
        if (s.hp > 1) {
          s.hp -= 1;
          this.refreshHp();
          popNumber(this, this.soul.x + 20, this.soul.y - 20, '-1', this.dot.kind === 'poison' ? '#9cff6a' : '#ffa04a', 60).setFontSize(22);
        }
        if (this.dot.left <= 0) this.dot = undefined;
      }
      this.soul.setTint(this.dot ? (this.dot.kind === 'poison' ? 0x9cff6a : 0xffa04a) : 0xffffff);
    }
    if (d.t >= d.dur) this.endDodge();
  }

  private hurt(): number {
    const s = State.get();
    const dmg = Math.max(1, this.m.atk - Math.floor(s.def / 2));
    s.hp = Math.max(0, s.hp - dmg);
    this.refreshHp();
    Sound.hurt();
    this.cameras.main.shake(140, 0.008);
    this.cameras.main.flash(80, 120, 0, 20);
    popNumber(this, this.soul.x, this.soul.y - 30, `-${dmg}`, '#ff5a6a', 60).setFontSize(32);
    return dmg;
  }

  private endDodge() {
    this.phase = 'busy';
    this.dot = undefined;
    this.soul.clearTint();
    if (this.dodge) {
      const tag = this.dodge.tag;
      this.tweens.add({ targets: tag, alpha: 0, duration: 150, onComplete: () => tag.destroy() });
      this.dodge.blind?.destroy();
    }
    this.children.getByName('twistTag')?.destroy();
    this.field?.clear();
    const f = this.field;
    this.time.delayedCall(200, () => f?.destroy());
    this.field = undefined;
    this.dodge = undefined;
    this.soul.setVisible(false);
    this.soulGlow.setVisible(false);
    this.resizeBox({ ...DEFAULT_BOX }, 280, () => this.toMenu());
  }

  // ---- outcomes ----------------------------------------------------------------
  private trySpare() {
    if (!this.spareable()) {
      this.boxSay(this.m.role === 'boss' && this.mercy >= 100 ? [`* ${this.m.name} is wavering... but it is not finished yet. Hold on a little longer.`] : [`* You spared ${this.m.name}.`, '* ...It is not ready to yield.'], () => this.enemyTurn(100));
      return;
    }
    this.phase = 'end';
    Sound.spare();
    State.record(this.m.id).spared++;
    State.get().spares++;
    const gold = Math.round(this.m.gold * 0.6);
    State.get().gold += gold;
    this.tweens.killTweensOf(this.monster);
    sparkleBurst(this, this.monster.x, this.monsterBaseY - this.monster.displayHeight / 2, 26, 60, 220);
    this.tweens.add({ targets: this.monster, alpha: 0.0, y: this.monsterBaseY - 40, duration: 1200, ease: 'Sine.easeIn' });
    // Mercy still teaches the hatchling something: it earns half the EXP as bond.
    const bond = Math.ceil(this.m.exp / 2);
    this.boxSay([this.m.spareText, `* The battle is over.\n* You gained ${bond} bond EXP and ${gold} G.`, ...this.grow(bond)], () => this.finish('spared'));
  }

  /** Apply EXP; returns extra result pages (level-ups and the DIB evolution at its real level). */
  private grow(exp: number): string[] {
    const s = State.get();
    const pages: string[] = [];
    if (gainExp(exp) > 0) {
      Sound.levelUp();
      pages.push(`* Your strength grows. You are now LV ${s.lv}.`);
      this.lvText.setText(`${s.name.toUpperCase()}   LV ${s.lv}`);
      this.refreshHp();
    }
    const st = STARTERS.find((x) => x.id === s.starter?.id);
    if (st && s.starter && !s.starter.evolved && s.lv >= st.evolution.at_level) {
      s.starter.evolved = true;
      pages.push(`* ${st.name} is glowing...`, `* ${st.name} evolved into ${st.evolution.next_name}.`);
      const fresh = st.evolution.next_abilities.filter((a) => a.tu !== '-' && !st.abilities.some((b) => b.name === a.name)).map((a) => a.name);
      if (fresh.length) pages.push(`* New techniques: ${fresh.join(', ')}.`);
      if (this.companion && this.textures.exists('starter_' + st.id + '_evo')) this.companion.setTexture('starter_' + st.id + '_evo');
    }
    return pages;
  }

  private tryFlee() {
    if (this.m.boss) {
      this.boxSay(['* There is no escaping this.'], () => this.enemyTurn(100));
      return;
    }
    this.phase = 'end';
    Sound.whoosh();
    this.boxSay('* You retreat into the dark.', () => this.finish('fled'));
  }

  // ---- MERCY > Capture: the three DIB capture cards ---------------------------
  // Each card shows its live capture chance like the DIB card face ("34% Chance").
  // A card you don't carry can be bought on the spot, as in DIB.
  private openCapture() {
    this.clearList();
    this.boxText.setVisible(false);
    if (this.m.capture <= 0) {
      this.boxSay(['* No card can hold this one.', this.m.role === 'boss' ? '* The Overlord of Norwoods can only be calmed.' : '* It is beyond capture.'], () => this.toMenu());
      return;
    }
    this.phase = 'capture';
    this.captureCards = [];
    const s = State.get();
    const calm = this.spareable();
    const cy = this.box.y + this.box.h / 2;
    const x0 = this.box.x + 190;
    CAPTURE_CARDS.forEach((cc, i) => {
      const owned = s.inventory[cc.item] ?? 0;
      const canBuy = owned <= 0 && s.gold >= cc.price;
      const usable = owned > 0 || canBuy;
      const pct = Math.round(captureChance(this.m, this.hp / this.m.hp, calm, cc) * 100);
      const c = this.add.container(x0 + i * 172, cy).setDepth(15);
      const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd77a).setScale(1.0, 1.15).setAlpha(0).setName('glow');
      const card = this.add.image(0, 0, cc.tex).setScale(0.8);
      if (!usable) card.setTint(0x6a6f78);
      // the green window spans source rows 30-126, the price plate rows 137-188 (card is 160x200)
      const big = label(this, 0, -26 * 0.8, `${pct}%`, 40, '#ffffff', 5).setOrigin(0.5);
      const small = label(this, 0, 6 * 0.8, 'Chance', 22, '#ffffff', 4).setOrigin(0.5);
      const plate = label(this, 0, 62 * 0.8, owned > 0 ? `x${owned}` : `${cc.price} G`, 22, COLORS.ink, 0).setOrigin(0.5).setStroke('#ffffff', 3).setShadow(0, 0, '#000', 0);
      c.add([glow, card, big, small, plate]);
      if (!usable) [big, small, plate].forEach((t) => t.setAlpha(0.55));
      c.setAlpha(0).setY(cy + 14);
      this.tweens.add({ targets: c, alpha: 1, y: cy, duration: 180, delay: i * 50, ease: 'Cubic.easeOut' });
      this.captureCards.push({ c, card: cc, owned, canBuy, usable, pct });
      this.listObjs.push(c);
    });
    const ix = this.box.x + 680;
    this.captureTitle = label(this, ix, this.box.y + 18, '', 24, COLORS.gold, 4).setDepth(14);
    this.captureInfo = body(this, ix, this.box.y + 52, '', 20, COLORS.cream, this.box.x + this.box.w - ix - 24).setDepth(14);
    this.listObjs.push(this.captureTitle, this.captureInfo, label(this, ix, this.box.y + this.box.h - 34, `Gold: ${s.gold} G`, 17, '#c9b98a', 4).setDepth(14));
    this.captureSel = Math.max(0, this.captureCards.findIndex((x) => x.owned > 0));
    this.refreshCapture();
  }

  private refreshCapture() {
    this.captureCards.forEach((x, i) => {
      const sel = i === this.captureSel;
      (x.c.getByName('glow') as Phaser.GameObjects.Image).setAlpha(sel ? 0.45 : 0);
      this.tweens.killTweensOf(x.c);
      x.c.setAlpha(1);
      this.tweens.add({ targets: x.c, scale: sel ? 1.04 : 0.9, duration: 120 });
    });
    const x = this.captureCards[this.captureSel];
    const it = ITEMS[x.card.item];
    const hint = this.m.rare ? 'A rare sighting. It will fight the card hard.' : this.hp / this.m.hp > 0.6 ? 'Weaken it first: the more damaged it is, the higher the chance.' : 'It is weakened. The chance has risen.';
    const action = x.owned > 0 ? `Throw one (${x.owned} left).` : x.canBuy ? `Buy one for ${x.card.price} G and throw it.` : `None left. It costs ${x.card.price} G.`;
    this.captureTitle?.setText(`${it.name} — ${x.pct}%`);
    this.captureInfo?.setText(`${action}\n${x.card.mult === Infinity ? 'A guaranteed capture.' : hint}`);
    this.cursorSoul.setVisible(true).setPosition(x.c.x - 80, x.c.y);
  }

  private captureUpdate() {
    const c = this.controls;
    const l = c.pressed('left');
    const r = c.pressed('right');
    if (l || r) {
      this.captureSel = (this.captureSel + (l ? this.captureCards.length - 1 : 1)) % this.captureCards.length;
      Sound.move();
      this.refreshCapture();
    }
    if (c.pressed('cancel')) {
      Sound.cancel();
      this.clearList();
      this.openMercy();
      return;
    }
    if (c.pressed('confirm')) {
      const x = this.captureCards[this.captureSel];
      if (!x.usable) {
        Sound.cancel();
        this.cameras.main.shake(80, 0.002);
        return;
      }
      Sound.confirm();
      const s = State.get();
      if (x.owned <= 0) {
        s.gold -= x.card.price;
        State.addItem(x.card.item, 1);
      }
      this.clearList();
      this.throwCard(x.card);
    }
  }

  private throwCard(cc: CaptureCard) {
    State.useItem(cc.item);
    this.phase = 'busy';
    Sound.bind();
    const card = this.add.image(640, 600, cc.tex).setScale(0.32).setDepth(55);
    const mx = this.monster.x;
    const my = this.monsterBaseY - this.monster.displayHeight * 0.45;
    const chance = captureChance(this.m, this.hp / this.m.hp, this.spareable(), cc);
    const ok = Math.random() < chance;
    const name = ITEMS[cc.item].name;
    this.tweens.add({
      targets: card,
      x: mx,
      y: my,
      angle: 720,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => {
        card.setAngle(0);
        this.tweens.killTweensOf(this.monster);
        const sx = this.monster.scaleX;
        const sy = this.monster.scaleY;
        this.tweens.add({ targets: this.monster, scaleX: 0.02, scaleY: 0.02, x: mx, y: my + 20, alpha: 0.4, duration: 420, ease: 'Cubic.easeIn' });
        this.tweens.add({ targets: card, y: 330, scale: 0.42, duration: 400, delay: 420, ease: 'Quad.easeOut' });
        const glow = this.add.image(mx, 330, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(cc.item === 'gold_card' ? 0xffd04a : cc.item === 'silver_card' ? 0xdfe8f0 : 0x7dff9a).setAlpha(0).setScale(0.9).setDepth(54);
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
            if (wob === 3 || (!ok && wob === 2)) {
              this.time.delayedCall(450, () => {
                glow.destroy();
                if (ok) {
                  this.phase = 'end';
                  Sound.save();
                  const crown = this.add.image(card.x, card.y - 90, 'ui_crown').setScale(0.1).setDepth(56);
                  this.tweens.add({ targets: crown, scale: 0.45, y: card.y - 110, duration: 400, ease: 'Cubic.easeOut' });
                  sparkleBurst(this, card.x, card.y, 18, 57, 120);
                  const rec = State.record(this.m.id);
                  rec.bound = true;
                  State.get().spares++;
                  this.boxSay([`* Captured! ${this.m.name} is yours.`, `* (See "My Monsters" in the C menu.)`], () => this.finish('bound'));
                } else {
                  Sound.shatter();
                  sparkleBurst(this, card.x, card.y, 12, 57, 90);
                  card.destroy();
                  this.monster.setPosition(640, this.monsterBaseY).setScale(sx, sy).setAlpha(1);
                  this.idleMonster();
                  const fail = this.m.captureFail?.length ? this.m.captureFail : [`* ${this.m.name} broke free of the ${name}.`];
                  const why = chance >= 0.5 ? '* It nearly held.' : this.hp / this.m.hp > 0.6 ? '* It is too strong yet. Wear it down first.' : '* Not this time.';
                  this.boxSay([...fail, `${why} (${Math.round(chance * 100)}% chance)`], () => this.enemyTurn(100));
                }
              });
            }
          },
        });
      },
    });
  }

  private defeat() {
    this.phase = 'end';
    Sound.dust();
    this.tweens.killTweensOf(this.monster);
    const tint = Phaser.Display.Color.HexStringToColor(this.m.color).color;
    dustify(this, this.monster, tint, 50);
    const s = State.get();
    State.record(this.m.id).defeated++;
    s.kills++;
    s.gold += this.m.gold;
    const pages = [`* The battle is over.\n* You gained ${this.m.exp} EXP and ${this.m.gold} G.`, ...this.grow(this.m.exp)];
    this.time.delayedCall(1200, () => this.boxSay(pages, () => this.finish('won')));
  }

  private lose() {
    this.phase = 'end';
    this.field?.clear();
    Sound.stopMusic(0.1);
    Sound.shatter();
    const x = this.soul.x;
    const y = this.soul.y;
    this.soul.setTint(0x888888);
    this.time.delayedCall(700, () => {
      this.soul.setVisible(false);
      for (let i = 0; i < 6; i++) {
        const sh = this.add.image(x, y, 'shard').setDepth(80);
        this.tweens.add({ targets: sh, x: x + Phaser.Math.Between(-140, 140), y: y + Phaser.Math.Between(80, 260), angle: Phaser.Math.Between(-360, 360), alpha: 0, duration: 1200, ease: 'Quad.easeIn' });
      }
      this.cameras.main.fadeOut(1600, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.stop('World');
        this.scene.start('GameOver');
      });
    });
  }

  private finish(outcome: BattleResult['outcome']) {
    this.phase = 'busy';
    const w = this.wave;
    if (w && (outcome === 'won' || outcome === 'spared' || outcome === 'bound')) w.tally[outcome]++;
    if (w && w.queue.length && outcome !== 'fled' && outcome !== 'lost') {
      // the next of the group steps into the circle
      this.cameras.main.fadeOut(350, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const [next, ...rest] = w.queue;
        this.scene.restart({ monster: next, room: this.roomId, debug: this.debugStart, wave: { ...w, queue: rest, index: w.index + 1 } });
      });
      return;
    }
    Sound.stopMusic(0.4);
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const result: BattleResult = { monster: this.m.id, outcome, fight: w?.fight, tally: w?.tally };
      if (this.debugStart || !this.scene.isSleeping('World')) {
        this.scene.start('World', { room: this.roomId, spawn: Object.keys(ROOMS[this.roomId].spawns)[0] });
        return;
      }
      this.scene.stop();
      this.scene.wake('World', result);
    });
  }

  update(_t: number, rawDt: number) {
    const dt = Math.min(rawDt, 50);
    switch (this.phase) {
      case 'menu':
        return this.menuUpdate(dt);
      case 'text':
        return this.updateTyping(dt);
      case 'list':
        return this.listUpdate();
      case 'capture':
        return this.captureUpdate();
      case 'cards':
        return this.cardsUpdate();
      case 'timing':
        return this.timingUpdate(dt);
      case 'talk':
        return this.bubbleUpdate(dt);
      case 'dodge':
        return this.dodgeUpdate(dt);
      case 'end':
        if (this.typing.done) this.updateTyping(dt);
        return;
      default:
        return;
    }
  }
}

