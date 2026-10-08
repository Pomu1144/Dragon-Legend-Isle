import Phaser from 'phaser';
import { Sound } from '../audio/Sound';
import { BESTIARY_ORDER, CAPTURE_CARDS, ITEMS, MONSTERS } from '../data/monsters';
import { STARTERS } from '../data/starters';
import { EXPANSION_STORY } from '../data/expansion';
import { REGION_STORY } from '../data/regions';
import { MISSIONS } from '../data/missions';
import { STORY } from '../data/story';
import type { ReaderPage } from './ReaderScene';

const PER_PAGE = 10;

/** First sentences of the bestiary entry that fit in the two lines under the cards. */
/** The Rogue Formula can be performed once a Blood Rogue and a Cult Rogue have both been captured. */
function canFuse() {
  const b = State.get().bestiary;
  return !!b.blood_rogue?.bound && !!b.cult_rogue?.bound && !b.bloodgale?.bound;
}

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
import { EXP_TABLE, State } from '../state';
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
    this.tabImgs = [];
    const dim = this.add.rectangle(0, 0, W, H, 0x02040c, 0.72).setOrigin(0);
    const root = this.add.container(0, 0);
    const p = panel(this, 70, 50, 1000, 620, 'page');
    root.add(p);
    TABS.forEach((t, i) => {
      const img = this.add.image(1150, 112 + i * 104, t.key).setScale(0.82);
      this.tabImgs.push(img);
      root.add(img);
    });
    this.content = this.add.container(0, 0);
    root.add(this.content);
    root.add(label(this, 1070, 650, 'X  close', 18, COLORS.ink, 0).setOrigin(1, 0.5).setStroke('#fff4dc', 3));
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
    const frame = this.add.image(130, 150, 'ui_frame_portrait').setTint(0x7c848e).setOrigin(0).setDisplaySize(250, 258);
    const por = this.add.image(255, 263, 'hero_portrait');
    por.setScale(Math.min(214 / por.width, 190 / por.height));
    const nm = label(this, 255, 383, s.name, 24, COLORS.cream, 5).setOrigin(0.5);
    this.content.add([frame, por, nm]);
    this.ink(420, 160, `LV ${s.lv}   ·   Dragon Tamer`, 30);
    this.ink(420, 214, 'HP', 26);
    const bar = new Bar(this, 470, 232, 300, 'orange', 34);
    bar.set(s.hp / s.maxHp, false);
    this.content.add(bar);
    this.ink(790, 214, `${s.hp} / ${s.maxHp}`, 26);
    const next = s.lv < EXP_TABLE.length ? EXP_TABLE[s.lv] - s.exp : 0;
    this.ink(420, 270, `ATK ${s.atk}     DEF ${s.def}`, 26);
    this.ink(420, 316, `EXP ${s.exp}     NEXT ${next > 0 ? next : '—'}`, 26);
    this.ink(420, 362, `GOLD ${s.gold}`, 26);
    const comp = STARTERS.find((x) => x.id === s.starter?.id);
    if (comp) {
      const evo = !!s.starter?.evolved;
      const key = 'starter_' + comp.id + (evo ? '_evo' : '');
      const art = this.add.image(900, 410, key).setOrigin(0.5, 1);
      art.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      art.setScale(Math.max(1, Math.floor(120 / art.height)));
      this.content.add(art);
      this.ink(900, 418, evo ? comp.evolution.next_name : comp.name, 22).setOrigin(0.5, 0);
      this.ink(900, 448, evo ? `${comp.element} · Dragonling` : `${comp.element} · still in its shell`, 18).setOrigin(0.5, 0);
    }
    const bound = BESTIARY_ORDER.filter((id) => State.get().bestiary[id]?.bound);
    this.ink(130, 440, 'Companions', 28);
    if (!bound.length) this.ink(130, 486, 'No monsters captured yet. Wear one down, then use a Capture Card (MERCY > Capture).', 22, 820);
    bound.forEach((id, i) => {
      const x = 150 + i * 150;
      const mc = this.add.image(x + 60, 560, 'ui_minicard').setScale(0.95);
      const art = this.add.image(x + 60, 540, MONSTERS[id].art);
      art.setScale(Math.min(110 / art.width, 80 / art.height));
      const n = label(this, x + 60, 618, MONSTERS[id].name, 16, COLORS.cream, 4).setOrigin(0.5);
      this.content.add([mc, art, n]);
    });
  }

  private buildBestiary() {
    const seen = BESTIARY_ORDER.filter((id) => State.get().bestiary[id]?.seen).length;
    const pct = Math.round((seen / BESTIARY_ORDER.length) * 100);
    const plaque = this.add.image(560, 96, 'ui_plaque_monsters').setScale(0.9);
    const page = this.add.image(930, 100, 'ui_panel_page').setScale(0.62);
    const pages = Math.ceil(BESTIARY_ORDER.length / PER_PAGE);
    const pageNo = Math.floor(this.sel / PER_PAGE);
    const pg = label(this, 930, 86, `Pg ${pageNo + 1}/${pages}`, 22, COLORS.ink, 0).setOrigin(0.5).setStroke('#fff4dc', 2);
    const fd = label(this, 930, 114, `Found ${pct}%`, 22, COLORS.ink, 0).setOrigin(0.5).setStroke('#fff4dc', 2);
    this.content.add([plaque, page, pg, fd]);
    BESTIARY_ORDER.slice(pageNo * PER_PAGE, pageNo * PER_PAGE + PER_PAGE).forEach((id, i) => {
      const m = MONSTERS[id];
      const rec = State.get().bestiary[id];
      const col = i % 5;
      const row = Math.floor(i / 5);
      const c = this.add.container(200 + col * 172, 262 + row * 196);
      const card = this.add.image(0, 0, 'ui_monster_card_blank').setScale(0.42).setTint(0xb4b8bc);
      const art = this.add.image(0, -20, m.art);
      art.setScale(Math.min(118 / art.width, 88 / art.height));
      if (!rec?.seen) art.setTintFill(0x0b1a2a).setAlpha(0.85);
      const nm = cardName(this, 0.42, rec?.seen ? m.name : '???', 15);
      c.add([card, art, nm]);
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
      this.content.add(c);
      this.cardObjs.push(c);
    });
    this.detail = this.ink(130, 580, '', 19, 860);
    this.sel = Phaser.Math.Clamp(this.sel, 0, BESTIARY_ORDER.length - 1);
    this.refreshCards();
  }

  private refreshCards() {
    const local = this.sel % PER_PAGE;
    this.cardObjs.forEach((c, i) => {
      this.tweens.killTweensOf(c);
      this.tweens.add({ targets: c, scale: i === local ? 1.08 : 0.96, duration: 120 });
      c.setDepth(i === local ? 2 : 1);
    });
    const id = BESTIARY_ORDER[this.sel];
    const rec = State.get().bestiary[id];
    const m = MONSTERS[id];
    if (this.detail) {
      this.detail.setText(
        rec?.seen
          ? `No. ${m.number} ${m.name} · ${m.affinity} · ${m.stars}★   Spared ${rec.spared} · Defeated ${rec.defeated}${rec.bound ? ' · CAPTURED' : ''}\n${shortLore(m.lore)}`
          : 'Not yet encountered. Keep exploring the western roads.',
      );
    }
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

  /** Blood Rogue + Cult Rogue = Bloodgale. Like a DIB recipe, the two are used up. */
  private performFormula() {
    if (!canFuse()) return;
    State.record('blood_rogue').bound = false;
    State.record('cult_rogue').bound = false;
    const r = State.record('bloodgale');
    r.seen = true;
    r.bound = true;
    State.setFlag('bloodgaleFormed');
    Sound.save();
    this.tab = 1;
    this.sel = BESTIARY_ORDER.indexOf('bloodgale');
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
    if (this.tab === 1 && (goL || goR)) {
      const before = Math.floor(this.sel / PER_PAGE);
      this.sel = (this.sel + (goL ? BESTIARY_ORDER.length - 1 : 1)) % BESTIARY_ORDER.length;
      Sound.move();
      if (Math.floor(this.sel / PER_PAGE) !== before) this.build();
      else this.refreshCards();
    }
    if (this.tab === 2 && this.itemIds.length) {
      if (goL || goR) {
        this.sel = (this.sel + (goL ? this.itemIds.length - 1 : 1)) % this.itemIds.length;
        Sound.move();
        this.refreshItems();
      }
      if (c.pressed('confirm')) {
        const id = this.itemIds[this.sel];
        const s = State.get();
        if (ITEMS[id]?.key) {
          Sound.confirm();
          this.scene.launch('Reader', this.readerFor(id));
          this.scene.pause();
          return;
        }
        if (id === 'tonic' || id === 'tart') {
          if (s.hp >= s.maxHp) {
            Sound.cancel();
            return;
          }
          State.useItem(id);
          s.hp = Math.min(s.maxHp, s.hp + (id === 'tart' ? 30 : 15));
          Sound.heal();
          this.build();
        } else {
          Sound.cancel();
        }
      }
    }
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
