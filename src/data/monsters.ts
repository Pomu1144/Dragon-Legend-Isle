// Monster roster: the exact creatures from Dragon Island Blue (see dibCreatures.ts).
// The battle model is Undertale's: talk (ACT) until they can be spared, or fight.
import { DIB_KITS } from './dibCreatures';
import { MISSIONS } from './missions';

export interface Act {
  name: string;
  text: string[];
  mercy: number; // mercy points gained (100 = can be spared)
  once?: boolean; // only counts the first time
  calm?: number; // shortens the next attack (seconds)
  heal?: number;
}

export interface AttackDef {
  ability: string; // real DIB ability name
  tu: number; // real DIB Time Units
  pattern: string;
  projectile: string;
  tint?: string;
  twist: string;
  box?: [number, number];
  intensity?: number;
  flavor?: string;
}

/** A real DIB ability as listed on the wiki: TU cost, target text ("1 Foe", "All Allies", "Self"...) and effect text. */
export interface Ability {
  name: string;
  tu: string;
  target: string;
  effect: string;
}

/** Real DIB level-1 stats. */
export interface Stats {
  hp: number;
  attack: number;
  magic: number;
  speed: number;
  defense: number;
  resist: number;
}

export interface MonsterDef {
  lv1: Stats; // real DIB Lv1 stats (team battles)
  abilities: Ability[]; // real DIB abilities (team battles)
  attacks?: AttackDef[];
  faces?: 'left' | 'right' | 'front';
  flier?: boolean;
  number?: string;
  role?: string;
  rooms?: string[];
  id: string;
  name: string;
  color: string;
  art: string;
  height: number; // on-screen height in battle
  hp: number;
  atk: number;
  def: number;
  exp: number;
  gold: number;
  stars: number;
  affinity: string;
  boss?: boolean;
  music: string;
  capture: number; // base capture rate with a regular Capture Card at 0 HP (0 = cannot be captured)
  rare?: boolean; // a rare sighting: harder to capture
  captureFail?: string[];
  check: string;
  intro: string;
  idle: string[];
  talk: string[]; // speech bubble lines, cycled each turn
  spareText: string;
  acts: Act[];
  patterns: string[];
  lore: string;
}

interface Kit {
  id: string;
  name: string;
  role: string;
  rarity?: string;
  rooms: readonly string[];
  wiki: { number: string; stars: number; element: string; lv1: Stats; abilities: readonly Ability[] };
  sprite: { dominant_color_hex: string; faces: string; flier: boolean };
  battle: {
    check: string;
    intro: string;
    idle: readonly string[];
    talk: readonly string[];
    spare_text: string;
    lore: string;
    capture_fail?: readonly string[];
    acts: readonly { name: string; text: readonly string[]; mercy: number; once: boolean; calm: number }[];
    attacks: readonly { ability: string; tu: number; base_pattern: string; projectile: string; tint_hex: string; twist: string; box: readonly number[]; intensity: number; flavor: string }[];
  };
}

/** Lighten a DIB sprite colour so names stay readable on dark panels. */
function nameColor(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * 0.55);
  const [r, g, b] = [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)];
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// DIB: "The more damaged a monster is, the higher the capture chance." Rarer (higher-star)
// creatures resist more; rare sightings and guardians resist far more; Dragon Overlords never yield.
function baseCapture(k: Kit) {
  if (k.role === 'boss' || k.role === 'ending' || k.role === 'deity') return 0;
  let c = Math.max(0.12, Math.min(0.65, 0.78 - 0.11 * k.wiki.stars));
  if (k.role === 'miniboss') c *= 0.35;
  if (k.rarity === 'rare') c *= 0.45;
  return c;
}

// Real DIB level-1 stats are converted into Undertale-scale numbers, keeping their ratios.
function fromKit(k: Kit): MonsterDef {
  const boss = k.role === 'boss' || k.role === 'miniboss' || k.role === 'deity';
  const s = k.wiki.lv1;
  const offense = Math.max(s.attack, s.magic);
  // Deities outrank Dragon Overlords.
  const hp = k.role === 'deity' ? 260 : k.role === 'boss' ? 170 : k.role === 'miniboss' ? 110 : Math.round(s.hp * 1.1);
  const atk = k.role === 'deity' ? 8 : k.role === 'boss' ? 7 : k.role === 'miniboss' ? 6 : Math.max(3, Math.min(5, Math.round(offense / 2.2)));
  const def = boss ? 3 : Math.round(s.defense / 5);
  return {
    id: k.id,
    name: k.name,
    color: nameColor(k.sprite.dominant_color_hex),
    art: k.id === 'divine' ? 'mon_divine' : 'mon_' + k.id,
    height: k.role === 'deity' ? 420 : k.role === 'boss' ? 380 : k.role === 'miniboss' || k.role === 'formula' ? 340 : 280,
    hp,
    atk,
    def,
    exp: Math.round(k.wiki.stars * (boss ? 14 : 4)),
    gold: Math.round(k.wiki.stars * (boss ? 20 : 6)),
    stars: k.wiki.stars,
    affinity: k.wiki.element,
    boss,
    music: boss ? 'boss' : 'battle',
    capture: baseCapture(k),
    rare: k.rarity === 'rare',
    captureFail: k.battle.capture_fail ? [...k.battle.capture_fail] : undefined,
    check: k.battle.check,
    intro: k.battle.intro,
    idle: [...k.battle.idle],
    talk: [...k.battle.talk],
    spareText: k.battle.spare_text,
    acts: [{ name: 'Check', text: [], mercy: 0 }, ...k.battle.acts.map((a) => ({ name: a.name, text: [...a.text], mercy: a.mercy, once: a.once, calm: a.calm }))],
    patterns: [],
    attacks: k.battle.attacks.map((a) => ({
      ability: a.ability,
      tu: a.tu,
      pattern: a.base_pattern,
      projectile: a.projectile,
      tint: a.tint_hex,
      twist: a.twist,
      box: [a.box[0], a.box[1]] as [number, number],
      intensity: a.intensity,
      flavor: a.flavor,
    })),
    lv1: { ...s },
    abilities: k.wiki.abilities.map((a) => ({ ...a })),
    faces: k.sprite.faces as MonsterDef['faces'],
    flier: k.sprite.flier,
    number: k.wiki.number,
    role: k.role,
    rooms: [...k.rooms],
    lore: k.battle.lore,
  };
}

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(DIB_KITS.map((k) => [k.id, fromKit(k as unknown as Kit)]));

/** Bestiary order follows the original DIB monster numbers. */
export const BESTIARY_ORDER = Object.values(MONSTERS)
  .sort((a, b) => (Number(a.number) || 9999) - (Number(b.number) || 9999)) // formula creatures (F01...) last
  .map((m) => m.id);

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  key?: boolean; // key items are read from the Satchel and never consumed
  capture?: boolean; // capture cards are thrown from MERCY > Capture
}

export interface CaptureCard {
  item: string;
  tex: string;
  mult: number; // multiplies the capture chance; Infinity = guaranteed
  price: number; // DIB lets you buy cards mid-fight
}

export const CAPTURE_CARDS: CaptureCard[] = [
  { item: 'orb', tex: 'ui_capture_normal', mult: 1, price: 25 },
  { item: 'silver_card', tex: 'ui_capture_silver', mult: 1.75, price: 120 },
  { item: 'gold_card', tex: 'ui_capture_gold', mult: Infinity, price: 480 },
];

/** Chance (0-1) that a card holds the monster: at full HP a card rarely works, near 0 HP it nears the base rate. */
export function captureChance(m: MonsterDef, hpFrac: number, calm: boolean, card: CaptureCard) {
  if (m.capture <= 0) return 0;
  if (card.mult === Infinity) return 1;
  const worn = 1 - Math.max(0, Math.min(1, hpFrac));
  const p = m.capture * (0.3 + 0.7 * Math.pow(worn, 0.9)) + (calm ? 0.15 * (m.capture / 0.5) : 0);
  return Math.max(0.03, Math.min(0.95, p * card.mult));
}

export const ITEMS: Record<string, ItemDef> = {
  tonic: { id: 'tonic', name: 'Restoration Tonic', desc: 'Restores 15 HP. Tastes like blue.' },
  // The three DIB capture cards. ('orb' keeps old saves working.)
  orb: { id: 'orb', name: 'Capture Card', desc: 'Captures a wild monster. Weaken it first: the more damaged it is, the higher the chance.', capture: true },
  silver_card: { id: 'silver_card', name: 'Silver Card', desc: 'A capture card with a much higher capture chance than a regular card.', capture: true },
  gold_card: { id: 'gold_card', name: 'Gold Card', desc: 'A capture card with a guaranteed capture chance.', capture: true },
  manual: { id: 'manual', name: "Tamer's Manual", desc: 'Training, capturing and the old ways of the Guild.', key: true },
  guide: { id: 'guide', name: 'Translation Guide', desc: 'Greetings and warnings in the tongues of the villages.', key: true },
  map: { id: 'map', name: 'Map of the Near Villages', desc: 'The roads beyond Azurelake.', key: true },
  tart: { id: 'tart', name: 'Dragonfruit Tart', desc: 'Restores 30 HP. Half-eaten. Still delicious.' },
};

export interface SkillDef {
  id: string;
  name: string;
  card: string;
  tu: number;
  power: number;
  minLv: number;
  desc: string;
  support?: boolean; // non-damaging ability (e.g. Mother): steadies the tamer instead
}

// FIGHT cards are the chosen hatchling's real DIB abilities (TU from the wiki).
// TU sets how long the enemy's counter-attack lasts: heavier moves leave you open longer.
// Cards use the painted art from the UI sheet (Tail, Outrage, Flame; anything else shows "???").
export function cardFor(name: string) {
  const n = name.toLowerCase();
  if (n.includes('tail')) return 'ui_card_tail';
  if (n.includes('flame') || n.includes('fire') || n.includes('inferno')) return 'ui_card_flame';
  if (n.includes('rage') || n.includes('outrage') || n.includes('charge')) return 'ui_card_outrage';
  return 'ui_card_unknown';
}

export function skillFrom(a: { name: string; tu: string; effect: string }, minLv = 1): SkillDef {
  const tu = Number(a.tu) || 100;
  const dmg = /damage/i.test(a.effect);
  return {
    id: a.name.toLowerCase().replace(/\W+/g, '_'),
    name: a.name,
    card: cardFor(a.name),
    tu,
    power: dmg ? 0.55 + tu / 110 : 0,
    minLv,
    desc: a.effect.split(/\.\s|:\s/)[0].replace(/\.$/, ''), // the wiki effect, without research notes
    support: !dmg,
  };
}

// The two halves of the torn formula, and the formula once joined (the Dundean missions).
if (MISSIONS) {
  for (const f of Object.values(MISSIONS.fragments)) ITEMS[f.item] = { id: f.item, name: f.item_name, desc: f.desc, key: true };
  const fo = MISSIONS.formula;
  ITEMS[fo.item] = { id: fo.item, name: fo.item_name, desc: fo.desc, key: true };
}
