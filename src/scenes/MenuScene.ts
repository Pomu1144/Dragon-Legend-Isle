import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { BESTIARY_ORDER, CAPTURE_CARDS, ITEMS, MONSTERS } from '../data/monsters';
import { EXPANSION_STORY } from '../data/expansion';
import { REGION_STORY } from '../data/regions';
import { MISSIONS } from '../data/missions';
import { STORY } from '../data/story';
import type { ReaderPage } from './ReaderScene';

const PER_PAGE = 10;

/** The Rogue Formula can be performed while Kael owns both a Blood Rogue and a Cult Rogue. */
function canFuse() {
  const own = State.get().monsters;
  return own.some((m) => m.id === 'blood_rogue') && own.some((m) => m.id === 'cult_rogue');
}

/** Satchel healing grows with the monster's LV, like its max HP. A Tonic cannot wake a fainted monster; a Tart can. */
function healAmount(item: string, lv: number) {
  return Math.round((item === 'tart' ? 30 : 15) * (1 + 0.18 * (lv - 1)));
}

/** Fit monster art (all painted) into a w x h box. */
function fitArt(img: Phaser.GameObjects.Image, w: number, h: number) {
  return img.setScale(Math.min(w / img.width, h / img.height));
}

/** One owned monster's display data: its form (the hatchling may have evolved), HP and EXP. */
function view(mon: PartyMon) {
  const evo = State.evolved(mon);
  const base = baseOf(mon.id, evo);
  const max = maxHpOf(mon.id, mon.lv, evo);
  const abilities = [...new Map((base?.abilities ?? []).map((a) => [a.name, a])).values()];
  return { base, name: base?.name ?? mon.id, art: base?.art ?? 'mon_' + mon.id, element: base?.element ?? '', stars: base?.stars ?? 1, max, hp: Math.min(mon.hp, max), next: expToNext(mon.lv), abilities };
}

interface PickOpt {
  name: string;
  art?: string;
  arrow?: -1 | 1; // a move-earlier / move-later choice: the painted arrow instead of art
  sub?: string;
  color?: string;
  hp?: [number, number];
  disabled?: boolean;
}

/** 1st, 2nd, 3rd, 4th... */
function ordinal(n: number) {
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** First sentences of the bestiary entry that fit in the two lines under the cards. */
function shortLore(lore: string, max = 130) {
  // The header line already gives number / element / stars, so drop a lore opener that repeats them.
  const parts = lore.replace(/^No\. \d+[^.]*\.\s*/, '').split(/(?<=\.)\s+(?=[A-Z])/).filter((p, i) => i > 0 || !/\b(No\.|number)\s*\d+/i.test(p));
  if (!parts.length) return '';
  let out = '';
  for (const p of parts) {
    if ((out + ' ' + p).trim().length > max) break;
    out = (out + ' ' + p).trim();
  }
  return out || parts[0].slice(0, max);
}
import { Quests } from '../quests';
import { PARTY_SIZE, PartyMon, State } from '../state';
import { baseOf, elementColor, expToNext, maxHpOf, newPartyMon, ELEMENT_TINT } from '../battle/units';
import { Controls } from '../ui/input';
import { Bar, body, cardName, label, panel, starRow, title, COLORS } from '../ui/widgets';

const TABS = [
  { key: 'ui_tab_party', name: 'Party' },
  { key: 'ui_tab_bestiary', name: 'My Monsters' },
  { key: 'ui_tab_quests', name: 'Satchel' },
  { key: 'ui_tab_world', name: 'Quests' },
  { key: 'ui_tab_trophy', name: 'Records' },
];

export class MenuScene extends Phaser.Scene {
  private controls!: Controls;
  private tab = 0;
  private tabImgs: Phaser.GameObjects.Image[] = [];
  private content!: Phaser.GameObjects.Container;
  private sel = 0;
  private cardObjs: Phaser.GameObjects.Container[] = [];
  private detail?: Phaser.GameObjects.Text;
  private itemIds: string[] = [];
  private itemTexts: Phaser.GameObjects.Text[] = [];
  private closing = false;
  private ownedIds: string[] = []; // My Monsters: owned monsters (uids) first, then the bestiary
  private picker?: { root: Phaser.GameObjects.Container; boxes: Phaser.GameObjects.NineSlice[]; mark: Phaser.GameObjects.Container; sel: number; opts: PickOpt[]; pick: (i: number) => void };

  constructor() {
    super('Menu');
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.controls = new Controls(this);
    this.events.off('readerAction');
    this.events.on('readerAction', () => this.performFormula());
    this.tab = 0;
    this.sel = 0;
    this.closing = false;
    this.picker = undefined;
    this.tabImgs = [];
    const dim = this.add.rectangle(0, 0, W, H, 0x02040c, 0.72).setOrigin(0);
    const root = this.add.container(0, 0);
    const p = panel(this, 70, 50, 1000, 620, 'page');
    root.add(p);
    TABS.forEach((t, i) => {
      const img = this.add.image(1150, 112 + i * 104, t.key).setScale(0.82);
      img.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (this.closing || this.picker || this.tab === i) return;
        this.tab = i;
        this.sel = 0;
        Sound.move();
        this.build();
      });
      this.tabImgs.push(img);
      root.add(img);
    });
    this.content = this.add.container(0, 0);
    root.add(this.content);
    const closeTxt = label(this, 1070, 650, 'X  close', 18, COLORS.ink, 0).setOrigin(1, 0.5).setStroke('#fff4dc', 3);
    closeTxt.setInteractive({ useHandCursor: true }).on('pointerup', () => !this.closing && (this.picker ? this.closePicker() : this.close()));
    root.add(closeTxt);
    root.setAlpha(0).setY(20);
    dim.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, y: 0, duration: 220, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: dim, alpha: 0.72, duration: 220 });
    this.build();
  }

  private refreshTabs() {
    this.tabImgs.forEach((img, i) => {
      const sel = i === this.tab;
      this.tweens.killTweensOf(img);
      this.tweens.add({ targets: img, x: sel ? 1128 : 1150, scale: sel ? 0.9 : 0.8, duration: 140 });
      img.setTint(sel ? 0xffffff : 0x8a9ab0);
    });
  }

  private build() {
    this.content.removeAll(true);
    this.cardObjs = [];
    this.itemTexts = [];
    this.detail = undefined;
    this.refreshTabs();
    const header = title(this, 120, 78, TABS[this.tab].name, 38, '#3a1f08').setStroke('#f6e3b8', 4).setShadow(0, 2, '#000', 2);
    if (this.tab === 1) header.setVisible(false); // the painted plaque already titles this page
    this.content.add(header);
    [() => this.buildParty(), () => this.buildBestiary(), () => this.buildItems(), () => this.buildQuests(), () => this.buildRecords()][this.tab]();
  }

  private ink(x: number, y: number, text: string, size = 24, wrap = 0) {
    const t = body(this, x, y, text, size, COLORS.ink, wrap).setStroke('#fff4dc', 0).setShadow(0, 0, '#000', 0);
    this.content.add(t);
    return t;
  }

  private buildParty() {
    const s = State.get();
    // Kael gives the commands; his monsters do the fighting.
    const frame = this.add.image(130, 132, 'ui_frame_portrait').setTint(0x7c848e).setOrigin(0).setDisplaySize(108, 112);
    const por = this.add.image(184, 182, 'hero_portrait');
    por.setScale(Math.min(92 / por.width, 82 / por.height));
    this.content.add([frame, por]);
    this.ink(262, 134, s.name, 32);
    this.ink(262, 178, `Dragon Tamer   ·   LV ${s.lv}`, 22);
    const bench = State.bench();
    const ready = bench.filter((m) => m.hp > 0).length;
    this.ink(262, 210, `Gold ${s.gold}   ·   Monsters owned ${s.monsters.length}${bench.length ? `   ·   Bench ${ready}${ready < bench.length ? ` of ${bench.length} ready` : ''}` : ''}`, 20);
    const team = State.partyMons();
    this.sel = Phaser.Math.Clamp(this.sel, 0, PARTY_SIZE - 1);
    for (let i = 0; i < PARTY_SIZE; i++) {
      const c = this.partySlot(128 + i * 302, 262, team[i], i);
      (c.getData('bg') as Phaser.GameObjects.NineSlice).setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (this.picker) return;
        if (this.sel === i) return this.partyConfirm();
        this.sel = i;
        Sound.move();
        this.refreshCards();
      });
      this.cardObjs.push(c);
      this.content.add(c);
    }
    const hint = !team.length
      ? 'Your hatchling waits at the Guild Hall.'
      : bench.length
        ? '← →  choose   ·   Z  manage in My Monsters   ·   the bench steps in, in team order, when one faints'
        : '← →  choose   ·   Z  manage in My Monsters';
    this.ink(130, 630, hint, 18);
    this.refreshCards();
  }

  /** One party slot: the monster standing on its own blue panel, with LV, HP, EXP and its DIB abilities. */
  private partySlot(x: number, y: number, mon: PartyMon | undefined, i: number) {
    const c = this.add.container(x, y);
    const bg = panel(this, 0, 0, 290, 360, 'blue');
    c.add(bg);
    c.setData('bg', bg);
    c.add(label(this, 22, 14, `${i + 1}`, 18, COLORS.gold, 3));
    if (!mon) {
      bg.setAlpha(0.6);
      c.add(label(this, 145, 150, 'Empty', 24, COLORS.cream, 4).setOrigin(0.5).setAlpha(0.8));
      c.add(body(this, 145, 186, 'Captured monsters can join from My Monsters.', 16, COLORS.cream, 230).setOrigin(0.5, 0).setAlign('center').setAlpha(0.75));
      return c;
    }
    const v = view(mon);
    const glow = this.add.image(145, 92, 'glow').setTint(ELEMENT_TINT[v.element] ?? 0xfff4dc).setAlpha(0.22).setScale(1.1).setBlendMode(Phaser.BlendModes.ADD);
    const sh = this.add.image(145, 128, 'shadow').setScale(0.7, 0.5).setAlpha(0.7);
    const art = fitArt(this.add.image(145, 128, v.art).setOrigin(0.5, 1), 200, 104);
    c.add([glow, sh, art]);
    if (v.hp <= 0) {
      art.setTint(0x4a4f58).setAlpha(0.75);
      c.add(label(this, 145, 76, 'FAINTED', 18, COLORS.red, 4).setOrigin(0.5));
    }
    const nm = label(this, 145, 132, v.name, 22, elementColor(v.element), 4).setOrigin(0.5, 0);
    if (nm.width > 266) nm.setScale(266 / nm.width);
    c.add(nm);
    c.add(body(this, 145, 162, `LV ${mon.lv}${v.element ? '   ·   ' + v.element : ''}`, 16, COLORS.cream).setOrigin(0.5, 0));
    c.add(label(this, 22, 188, 'HP', 14, COLORS.cream, 3));
    c.add(label(this, 268, 188, `${v.hp} / ${v.max}`, 14, COLORS.cream, 3).setOrigin(1, 0));
    const hp = new Bar(this, 20, 220, 250, 'red', 24);
    hp.set(v.hp / v.max, false);
    c.add(label(this, 22, 232, 'EXP', 12, COLORS.yellow, 3));
    c.add(label(this, 268, 232, `${mon.exp} / ${v.next}`, 12, COLORS.yellow, 3).setOrigin(1, 0));
    const xp = new Bar(this, 20, 258, 250, 'orange', 16);
    xp.set(mon.exp / Math.max(1, v.next), false);
    c.add([hp, xp]);
    const rows = v.abilities.slice(0, 5);
    rows.forEach((a, k) => {
      const ry = 270 + k * 17;
      c.add(body(this, 24, ry, a.name, 14, COLORS.cream));
      c.add(body(this, 266, ry, /^\d+$/.test(a.tu) ? `${a.tu} TU` : '—', 13, COLORS.blue).setOrigin(1, 0));
    });
    if (v.abilities.length > rows.length) c.add(body(this, 266, 270 + rows.length * 17 - 4, `+${v.abilities.length - rows.length}`, 12, COLORS.blue).setOrigin(1, 0));
    return c;
  }

  /** Z on a party slot: open My Monsters on that monster, where it can be swapped out. */
  private partyConfirm() {
    const uid = State.get().party[this.sel];
    if (!State.get().monsters.length) return Sound.cancel();
    Sound.confirm();
    this.tab = 1;
    this.ownedIds = this.ownedOrder();
    this.sel = Math.max(0, this.ownedIds.indexOf(uid ?? ''));
    this.build();
  }

  /** Owned monsters as My Monsters lists them: the party in slot order, then the bench in team order. */
  private ownedOrder() {
    return [...State.get().party, ...State.bench().map((m) => m.uid)];
  }

  /** My Monsters: Kael's own monsters on the first pages (Z places one in the party), then the bestiary. */
  private buildBestiary() {
    this.ownedIds = this.ownedOrder();
    const owned = this.ownedIds.length;
    const ownPages = Math.ceil(owned / PER_PAGE);
    const total = owned + BESTIARY_ORDER.length;
    this.sel = Phaser.Math.Clamp(this.sel, 0, total - 1);
    const seen = BESTIARY_ORDER.filter((id) => State.get().bestiary[id]?.seen).length;
    const pct = Math.round((seen / BESTIARY_ORDER.length) * 100);
    const plaque = this.add.image(560, 96, 'ui_plaque_monsters').setScale(0.9);
    const page = this.add.image(930, 100, 'ui_panel_page').setScale(0.62);
    const pages = ownPages + Math.ceil(BESTIARY_ORDER.length / PER_PAGE);
    const pageNo = this.pageOf(this.sel);
    const mine = pageNo < ownPages;
    const pg = label(this, 930, 86, `Pg ${pageNo + 1}/${pages}`, 22, COLORS.ink, 0).setOrigin(0.5).setStroke('#fff4dc', 2);
    const fd = label(this, 930, 114, mine ? `Owned ${owned}` : `Found ${pct}%`, 22, COLORS.ink, 0).setOrigin(0.5).setStroke('#fff4dc', 2);
    this.content.add([plaque, page, pg, fd]);
    this.ink(132, 84, mine ? 'Your team' : 'Bestiary', 26);
    if (mine && owned > this.ownedIds.filter((u) => State.get().party.includes(u)).length) this.ink(134, 124, 'Crowned: the party.  Blue numbers: the bench,\nin the order they step in when one faints.', 16);
    const first = mine ? pageNo * PER_PAGE : owned + (pageNo - ownPages) * PER_PAGE;
    const last = mine ? Math.min(owned, first + PER_PAGE) : Math.min(total, first + PER_PAGE);
    for (let n = first; n < last; n++) {
      const i = n - first;
      const c = this.add.container(200 + (i % 5) * 172, 262 + Math.floor(i / 5) * 196);
      const card = this.add.image(0, 0, 'ui_monster_card_blank').setScale(0.42).setTint(0xb4b8bc);
      c.add(card);
      if (mine) this.ownedCard(c, this.ownedIds[n]);
      else this.bestiaryCard(c, BESTIARY_ORDER[n - owned]);
      card.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (this.picker) return;
        if (this.sel === n) return this.monstersConfirm();
        this.sel = n;
        Sound.move();
        this.refreshCards();
      });
      this.content.add(c);
      this.cardObjs.push(c);
    }
    this.detail = this.ink(130, 580, '', 19, 860);
    this.refreshCards();
  }

  /** Page of an entry in My Monsters: owned monsters fill their own pages, the bestiary starts on a fresh one. */
  private pageOf(n: number) {
    const owned = this.ownedIds.length;
    return n < owned ? Math.floor(n / PER_PAGE) : Math.ceil(owned / PER_PAGE) + Math.floor((n - owned) / PER_PAGE);
  }

  private ownedCard(c: Phaser.GameObjects.Container, uid: string) {
    const mon = State.get().monsters.find((m) => m.uid === uid)!;
    const v = view(mon);
    const art = fitArt(this.add.image(0, -20, v.art), 118, 88);
    if (v.hp <= 0) art.setTint(0x4a4f58).setAlpha(0.8);
    c.add([art, cardName(this, 0.42, v.name, 15), starRow(this, -1, 36, v.stars, 60, 13)]);
    // party monsters light the crown and carry their slot number in the round seal; the rest are resting
    const slot = State.get().party.indexOf(uid);
    if (slot >= 0) {
      const crown = this.add.image(-46, 53, 'ui_crown').setScale(0.22);
      c.add([crown, label(this, 0, 54, `${slot + 1}`, 17, COLORS.yellow, 4).setOrigin(0.5)]);
      this.tweens.add({ targets: crown, scale: 0.27, yoyo: true, repeat: -1, duration: 700 });
    } else {
      // the bench: its place in team order (who steps in first when one faints) in the seal
      c.add(this.add.rectangle(-44, 55, 46, 33, 0x13202c, 0.6));
      const at = State.bench().findIndex((m) => m.uid === uid);
      c.add(label(this, 0, 54, `${at + 1}`, 15, v.hp > 0 ? '#8fcaff' : '#8a8f96', 4).setOrigin(0.5));
    }
    c.add(label(this, 44, 55, `LV ${mon.lv}`, 13, COLORS.cream, 3).setOrigin(0.5));
  }

  private bestiaryCard(c: Phaser.GameObjects.Container, id: string) {
    const m = MONSTERS[id];
    const rec = State.get().bestiary[id];
    const art = this.add.image(0, -20, m.art);
    art.setScale(Math.min(118 / art.width, 88 / art.height));
    if (!rec?.seen) art.setTintFill(0x0b1a2a).setAlpha(0.85);
    const nm = cardName(this, 0.42, rec?.seen ? m.name : '???', 15);
    c.add([art, nm]);
    if (rec?.seen) c.add(starRow(this, -1, 36, m.stars, 60, 13));
    if (rec?.bound) {
      const crown = this.add.image(-46, 53, 'ui_crown').setScale(0.22);
      c.add(crown);
      this.tweens.add({ targets: crown, scale: 0.27, yoyo: true, repeat: -1, duration: 700 });
    } else {
      // dim the painted crown slot on unbound monsters
      c.add(this.add.rectangle(-44, 55, 46, 33, 0x13202c, 0.6));
    }
    if (rec?.spared) c.add(this.add.image(44, 55, 'ui_fx_sparkle').setScale(0.27).setBlendMode(Phaser.BlendModes.ADD));
  }

  private refreshCards() {
    if (this.tab === 0) {
      // party slots: the chosen one lifts and brightens
      this.cardObjs.forEach((c, i) => {
        this.tweens.killTweensOf(c);
        this.tweens.add({ targets: c, y: i === this.sel ? 254 : 262, duration: 120 });
        (c.getData('bg') as Phaser.GameObjects.NineSlice).setTint(i === this.sel ? 0x8e9cad : 0x5e6874);
      });
      return;
    }
    const owned = this.ownedIds.length;
    const local = this.sel < owned ? this.sel % PER_PAGE : (this.sel - owned) % PER_PAGE;
    this.cardObjs.forEach((c, i) => {
      this.tweens.killTweensOf(c);
      this.tweens.add({ targets: c, scale: i === local ? 1.08 : 0.96, duration: 120 });
      c.setDepth(i === local ? 2 : 1);
    });
    if (!this.detail) return;
    if (this.sel < owned) {
      const uid = this.ownedIds[this.sel];
      const mon = State.get().monsters.find((m) => m.uid === uid)!;
      const v = view(mon);
      const slot = State.get().party.indexOf(uid);
      const at = State.bench().findIndex((m) => m.uid === uid);
      const next = State.bench().filter((m) => m.hp > 0).indexOf(mon) + 1; // fainted ones are skipped
      const where = slot >= 0 ? `Party slot ${slot + 1}` : v.hp > 0 ? `Bench ${at + 1} (steps in ${ordinal(next)})` : `Bench ${at + 1} (fainted: skipped)`;
      this.detail.setText(
        `${v.name} · LV ${mon.lv} · ${v.element || '—'} · HP ${v.hp}/${v.max} · EXP ${mon.exp}/${v.next} · ${where}\n` +
          `${v.abilities.map((a) => a.name).join(', ')}   ·   Z  ${slot >= 0 ? 'move or rest' : 'place in the party or reorder'}`,
      );
      return;
    }
    const id = BESTIARY_ORDER[this.sel - owned];
    const rec = State.get().bestiary[id];
    const m = MONSTERS[id];
    this.detail.setText(
      rec?.seen
        ? `No. ${m.number} ${m.name} · ${m.affinity} · ${m.stars}★   Spared ${rec.spared} · Defeated ${rec.defeated}${rec.bound ? ' · CAPTURED' : ''}\n${shortLore(m.lore)}`
        : 'Not yet encountered. Keep exploring the western roads.',
    );
  }

  /**
   * Z on an owned monster: choose the party slot it takes (swapping with whoever stands there, who
   * takes its place on the bench), send it to rest at the end of the bench, or move it along the bench.
   */
  private monstersConfirm() {
    const uid = this.ownedIds[this.sel];
    if (!uid) return Sound.cancel();
    const s = State.get();
    const mon = s.monsters.find((m) => m.uid === uid)!;
    const cur = s.party.indexOf(uid);
    const opts: PickOpt[] = [];
    for (let i = 0; i < PARTY_SIZE; i++) {
      const other = s.monsters.find((m) => m.uid === s.party[i]);
      if (!other) {
        opts.push({ name: `Slot ${i + 1}`, sub: 'Empty', disabled: cur >= 0 && cur === s.party.length - 1 });
        continue;
      }
      const v = view(other);
      opts.push({ name: v.name, art: v.art, color: elementColor(v.element), sub: `Slot ${i + 1} · LV ${other.lv}`, hp: [v.hp, v.max], disabled: i === cur });
    }
    const bench = State.bench();
    const at = bench.findIndex((m) => m.uid === uid);
    if (cur >= 0) opts.push({ name: 'Rest', sub: 'To the bench', disabled: s.party.length <= 1 });
    else {
      opts.push({ name: 'Earlier', arrow: -1, sub: 'Steps in sooner', disabled: at <= 0 });
      opts.push({ name: 'Later', arrow: 1, sub: 'Steps in later', disabled: at >= bench.length - 1 });
    }
    Sound.confirm();
    this.openPicker(`Where does ${view(mon).name} stand?`, opts, (i) => {
      const party = s.party;
      if (i >= PARTY_SIZE) {
        if (cur >= 0) State.toBenchEnd(uid);
        else State.moveOnBench(uid, i === PARTY_SIZE ? -1 : 1);
      } else if (cur >= 0) {
        if (party[i]) [party[cur], party[i]] = [party[i], party[cur]];
        else party.push(...party.splice(cur, 1));
      } else State.stepIn(uid, i);
      Sound.save();
      this.ownedIds = this.ownedOrder();
      this.sel = Math.max(0, this.ownedIds.indexOf(uid));
      this.build();
    });
  }

  // ---- a small chooser over the page (party slots, who drinks the Tonic) ----------------
  private openPicker(heading: string, opts: PickOpt[], pick: (i: number) => void) {
    const W = this.scale.width;
    const H = this.scale.height;
    const bw = opts.length > 4 ? 162 : 196;
    const gap = 14;
    const w = opts.length * bw + (opts.length - 1) * gap + 64;
    const h = 330;
    const x0 = Math.round((W - 120 - w) / 2 + 10);
    const y0 = 196;
    const root = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x02040c, 0.6).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.closePicker());
    root.add([dim, panel(this, x0, y0, w, h, 'blue'), label(this, x0 + w / 2, y0 + 22, heading, 22, COLORS.gold, 4).setOrigin(0.5, 0)]);
    const boxes: Phaser.GameObjects.NineSlice[] = [];
    opts.forEach((o, i) => {
      const bx = x0 + 32 + i * (bw + gap);
      const by = y0 + 70;
      const box = panel(this, bx, by, bw, 220, 'green');
      box.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (!this.picker) return;
        if (this.picker.sel === i) return this.pickerConfirm();
        this.picker.sel = i;
        Sound.move();
        this.refreshPicker();
      });
      boxes.push(box);
      const start = root.list.length;
      root.add(box);
      if (o.art) {
        root.add(this.add.image(bx + bw / 2, by + 110, 'shadow').setScale(0.55, 0.4).setAlpha(0.6));
        root.add(fitArt(this.add.image(bx + bw / 2, by + 112, o.art).setOrigin(0.5, 1), Math.min(150, bw - 20), 86));
      } else if (o.arrow) root.add(this.add.image(bx + bw / 2, by + 74, 'ui_cursor_arrow').setScale(0.7).setFlipX(o.arrow < 0).setAlpha(0.9));
      else root.add(this.add.image(bx + bw / 2, by + 74, o.name === 'Rest' ? 'ui_med_book' : 'ui_slot_round').setScale(o.name === 'Rest' ? 0.34 : 0.5).setAlpha(0.8));
      const nm = label(this, bx + bw / 2, by + 122, o.name, 18, o.color ?? COLORS.cream, 4).setOrigin(0.5, 0);
      if (nm.width > bw - 16) nm.setScale((bw - 16) / nm.width);
      root.add(nm);
      if (o.sub) root.add(body(this, bx + bw / 2, by + 150, o.sub, 15, COLORS.cream).setOrigin(0.5, 0));
      if (o.hp) {
        const bar = new Bar(this, bx + 16, by + 194, bw - 32, 'red', 20);
        bar.set(o.hp[0] / Math.max(1, o.hp[1]), false);
        root.add([bar, label(this, bx + bw - 16, by + 170, `${o.hp[0]}/${o.hp[1]}`, 12, COLORS.cream, 3).setOrigin(1, 0)]);
      }
      if (o.disabled) root.list.slice(start).forEach((g) => (g as Phaser.GameObjects.Image).setAlpha(0.42));
    });
    const mark = this.add.container(0, 0, [this.add.image(0, 0, 'ui_cursor_diamond').setScale(0.42)]);
    this.tweens.add({ targets: mark.list[0], y: -6, yoyo: true, repeat: -1, duration: 420, ease: 'Sine.easeInOut' });
    root.add(mark);
    root.add(body(this, x0 + w / 2, y0 + h - 34, '← →  choose   ·   Z  confirm   ·   X  back', 15, COLORS.cream).setOrigin(0.5, 0).setAlpha(0.85));
    const sel = Math.max(0, opts.findIndex((o) => !o.disabled));
    this.picker = { root, boxes, mark, sel, opts, pick };
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 140 });
    this.refreshPicker();
  }

  private refreshPicker() {
    const p = this.picker;
    if (!p) return;
    p.boxes.forEach((b, i) => b.setTint(i === p.sel ? 0xeef6e2 : 0x6c7668));
    const b = p.boxes[p.sel];
    p.mark.setPosition(b.x + b.width / 2, b.y - 8);
  }

  private pickerConfirm() {
    const p = this.picker;
    if (!p) return;
    if (p.opts[p.sel]?.disabled) return Sound.cancel();
    this.closePicker(false);
    p.pick(p.sel);
  }

  private closePicker(sound = true) {
    if (!this.picker) return;
    if (sound) Sound.cancel();
    this.picker.root.destroy();
    this.picker = undefined;
    this.controls.reset();
  }

  private buildItems() {
    const inv = State.get().inventory;
    this.itemIds = Object.keys(inv).filter((k) => inv[k] > 0);
    if (!this.itemIds.length) {
      this.ink(130, 170, 'Your satchel is empty.', 28);
      return;
    }
    const gap = Math.min(110, 380 / Math.max(1, this.itemIds.length - 1));
    this.itemIds.forEach((id, i) => {
      const y = 158 + i * gap;
      const k = Math.min(1, gap / 100);
      const cc = CAPTURE_CARDS.find((c) => c.item === id);
      const slot = this.add.image(170, y + 28 * k, 'ui_slot_round').setScale(0.7 * k);
      const icon = cc ? this.add.image(170, y + 28 * k, cc.tex).setScale(0.3 * k) : this.add.image(170, y + 28 * k, id === 'tart' ? 'ui_star' : ITEMS[id]?.key ? 'ui_med_book' : 'ui_fx_waterring').setScale((ITEMS[id]?.key ? 0.3 : 0.5) * k);
      this.content.add([slot, icon]);
      const t = this.ink(240, y, `${ITEMS[id].name}  ×${inv[id]}`, gap < 90 ? 24 : 28);
      t.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        if (this.picker) return;
        if (this.sel === i) return this.useSelected();
        this.sel = i;
        Sound.move();
        this.refreshItems();
      });
      this.ink(240, y + (gap < 90 ? 30 : 38), ITEMS[id].desc, gap < 90 ? 17 : 20, 760);
      this.itemTexts.push(t);
    });
    this.ink(130, 622, 'Z  use selected item', 20);
    this.sel = Phaser.Math.Clamp(this.sel, 0, this.itemIds.length - 1);
    this.refreshItems();
  }

  private refreshItems() {
    this.itemTexts.forEach((t, i) => t.setColor(i === this.sel ? '#a8410a' : COLORS.ink));
  }

  private readerFor(id: string): { title: string; pages: ReaderPage[]; action?: string } {
    const it = STORY.items;
    if (MISSIONS) {
      const fr = Object.entries(MISSIONS.fragments).find(([, f]) => f.item === id);
      if (fr) return { title: fr[1].item_name, pages: [{ heading: fr[1].item_name, text: fr[1].page, image: fr[0] === 'blood' ? 'mon_blood_rogue' : 'mon_cult_rogue' }] };
      const fo = MISSIONS.formula;
      if (id === fo.item)
        return {
          title: fo.item_name,
          pages: [
            { heading: 'Blood Rogue', text: 'The first half, in careful brown ink.', image: 'mon_blood_rogue' },
            { heading: 'Cult Rogue', text: 'The second half, in the same brown ink, the same hand.', image: 'mon_cult_rogue' },
            { heading: '= Bloodgale', text: fo.page, image: 'mon_bloodgale' },
            { heading: 'Bloodgale', text: 'Fire · 8★\n\nTwin Fang — 50 TU, 2 foes: 7-8 Physical Damage (Fire)\nGale Rite — 100 TU, all friends: speeds up actions by 38%, Attack +34\nSeverance — 130 TU, 1 foe: 20-24 Physical Damage (Air), +100% vs. Humanoid\nRed Requiem — 250 TU, all foes: 28-34 Physical Damage (Fire), +10% per friendly casualty' },
          ],
          action: canFuse() ? 'Perform the formula: Blood Rogue + Cult Rogue' : undefined,
        };
    }
    if (id === 'manual') return { title: it.manual.title, pages: it.manual.pages.map((p) => ({ heading: p.heading, text: p.text })) };
    if (id === 'guide') {
      const g = it.translation_guide;
      return {
        title: g.title,
        pages: [
          { heading: 'Foreword', text: g.intro },
          ...g.villages.map((v) => ({ heading: `${v.village} — ${v.region}`, text: v.phrases.map((p) => `"${p.phrase}"\n      ${p.meaning}`).join('\n\n') })),
        ],
      };
    }
    const m = it.map;
    return {
      title: m.title,
      pages: [
        { heading: 'Dragon Island', text: m.text, image: 'world_map' },
        { heading: 'The Nearest Villages', text: m.nearest.map((n) => `${n.name}  (${n.direction})\n      ${n.note}`).join('\n\n') },
        // Notes Kael pencils in once the roads past the Waystone open.
        ...(EXPANSION_STORY.map_text_addendum && State.get().flags.orochiDone ? [{ heading: 'Beyond the Waystone', text: EXPANSION_STORY.map_text_addendum }] : []),
        ...(REGION_STORY.map_text_addendum && State.get().flags.entered_dundean_square ? [{ heading: 'Past Dundean', text: REGION_STORY.map_text_addendum }] : []),
      ],
    };
  }

  /** Blood Rogue + Cult Rogue = Bloodgale. Like a DIB recipe, the two are used up; Bloodgale stands at their average LV. */
  private performFormula() {
    if (!canFuse()) return;
    const s = State.get();
    const a = s.monsters.find((m) => m.id === 'blood_rogue')!;
    const b = s.monsters.find((m) => m.id === 'cult_rogue')!;
    const slots = [s.party.indexOf(a.uid), s.party.indexOf(b.uid)].filter((i) => i >= 0);
    s.monsters = s.monsters.filter((m) => m !== a && m !== b);
    s.party = s.party.filter((u) => u !== a.uid && u !== b.uid);
    for (const id of ['blood_rogue', 'cult_rogue']) if (!s.monsters.some((m) => m.id === id)) State.record(id).bound = false;
    const gale = newPartyMon('bloodgale', Math.max(1, Math.round((a.lv + b.lv) / 2)));
    // Bloodgale takes the party slot the first rogue stood in
    if (State.addMonster(gale) === 'party' && slots.length) {
      s.party.pop();
      s.party.splice(Math.min(...slots), 0, gale.uid);
    }
    const r = State.record('bloodgale');
    r.seen = true;
    r.bound = true;
    State.setFlag('bloodgaleFormed');
    Sound.save();
    this.tab = 1;
    this.ownedIds = this.ownedOrder();
    this.sel = Math.max(0, this.ownedIds.indexOf(gale.uid));
    this.build();
    const W = this.scale.width;
    const t = title(this, W / 2 - 60, 360, 'Bloodgale joins you', 40, COLORS.gold).setOrigin(0.5).setDepth(50).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 1600, onComplete: () => t.destroy() });
  }

  private buildQuests() {
    const rows = Quests.log();
    if (!rows.length) {
      this.ink(130, 170, 'No quests yet. The people of Dundean may have need of a tamer.', 24, 860);
      return;
    }
    // open quests first; rows shrink to fit the page as the log grows
    const list = [...rows.filter((q) => !q.done), ...rows.filter((q) => q.done)].slice(0, 7);
    const gap = Math.min(128, 470 / list.length);
    const small = gap < 100;
    list.forEach((q, i) => {
      const y = 150 + i * gap;
      this.content.add(this.add.image(560, y + gap * 0.36, 'ui_panel_green').setDisplaySize(880, gap - 14).setAlpha(q.done ? 0.35 : 0.55));
      this.ink(150, y, (q.done ? '✓  ' : '') + q.title, small ? 21 : 26).setColor(q.done ? '#5a5a4a' : COLORS.ink);
      this.ink(150, y + (small ? 28 : 38), q.text, small ? 16 : 19, 800);
    });
    if (rows.length > list.length) this.ink(150, 628, `…and ${rows.length - list.length} more finished`, 16);
  }

  private buildRecords() {
    const s = State.get();
    const bound = Object.values(s.bestiary).filter((r) => r.bound).length;
    const mins = Math.floor(s.playSeconds / 60);
    const rows = [
      ['Monsters spared', `${s.spares}`],
      ['Monsters defeated', `${s.kills}`],
      ['Monsters captured', `${bound}`],
      ['Gold', `${s.gold}`],
      ['Time on the isle', `${mins} min`],
      ['Promise to Wren', State.flag('promisedMercy') ? (s.kills === 0 ? 'Kept' : 'Strained') : '—'],
    ];
    rows.forEach(([k, v], i) => {
      const y = 170 + i * 66;
      this.content.add(this.add.image(560, y + 18, 'ui_panel_green').setDisplaySize(860, 56).setAlpha(0.55));
      this.ink(150, y, k, 26);
      this.ink(900, y, v, 26).setOrigin(1, 0);
    });
  }

  update() {
    if (this.closing) return;
    const c = this.controls;
    if (this.picker) return this.updatePicker();
    if (c.pressed('cancel') || c.pressed('menu')) return this.close();
    const goU = c.pressed('up');
    const goD = c.pressed('down');
    const goL = c.pressed('left');
    const goR = c.pressed('right');
    if (goU || goD) {
      this.tab = (this.tab + (goU ? TABS.length - 1 : 1)) % TABS.length;
      this.sel = 0;
      Sound.move();
      this.build();
      return;
    }
    if (this.tab === 0) {
      if (goL || goR) {
        this.sel = (this.sel + (goL ? PARTY_SIZE - 1 : 1)) % PARTY_SIZE;
        Sound.move();
        this.refreshCards();
      }
      if (c.pressed('confirm')) this.partyConfirm();
    }
    if (this.tab === 1) {
      const total = this.ownedIds.length + BESTIARY_ORDER.length;
      if (goL || goR) {
        const before = this.pageOf(this.sel);
        this.sel = (this.sel + (goL ? total - 1 : 1)) % total;
        Sound.move();
        if (this.pageOf(this.sel) !== before) this.build();
        else this.refreshCards();
      }
      if (c.pressed('confirm')) {
        if (this.sel < this.ownedIds.length) this.monstersConfirm();
        else Sound.cancel();
      }
    }
    if (this.tab === 2 && this.itemIds.length) {
      if (goL || goR) {
        this.sel = (this.sel + (goL ? this.itemIds.length - 1 : 1)) % this.itemIds.length;
        Sound.move();
        this.refreshItems();
      }
      if (c.pressed('confirm')) this.useSelected();
    }
  }

  /** Z in the Satchel: read a key item, or give a Tonic / Tart to one of the party. */
  private useSelected() {
    const id = this.itemIds[this.sel];
    if (ITEMS[id]?.key) {
      Sound.confirm();
      this.scene.launch('Reader', this.readerFor(id));
      this.scene.pause();
      return;
    }
    if (id !== 'tonic' && id !== 'tart') return Sound.cancel();
    const team = State.partyMons();
    if (!team.length) return Sound.cancel();
    const opts: PickOpt[] = team.map((m) => {
      const v = view(m);
      const fainted = v.hp <= 0;
      return { name: v.name, art: v.art, color: elementColor(v.element), sub: fainted ? 'Fainted' : `LV ${m.lv}`, hp: [v.hp, v.max], disabled: v.hp >= v.max || (fainted && id === 'tonic') };
    });
    if (opts.every((o) => o.disabled)) return Sound.cancel();
    Sound.confirm();
    this.openPicker(`Give the ${ITEMS[id].name} to…`, opts, (i) => {
      const m = team[i];
      if (!State.useItem(id)) return Sound.cancel();
      m.hp = Math.min(view(m).max, Math.max(0, m.hp) + healAmount(id, m.lv));
      Sound.heal();
      this.build();
    });
  }

  private updatePicker() {
    const c = this.controls;
    const p = this.picker!;
    if (c.pressed('cancel') || c.pressed('menu')) return this.closePicker();
    const goL = c.pressed('left') || c.pressed('up');
    const goR = c.pressed('right') || c.pressed('down');
    if (goL || goR) {
      // step over the choices that cannot be taken
      const n = p.opts.length;
      let k = p.sel;
      do k = (k + (goL ? n - 1 : 1)) % n;
      while (p.opts[k].disabled && k !== p.sel);
      p.sel = k;
      Sound.move();
      this.refreshPicker();
    }
    if (c.pressed('confirm')) this.pickerConfirm();
  }

  private close() {
    this.closing = true;
    Sound.cancel();
    this.cameras.main.fadeOut(140, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop();
      this.scene.resume('World');
    });
  }
}
