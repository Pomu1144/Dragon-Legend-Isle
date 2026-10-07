// Monster roster: the exact creatures from Dragon Island Blue (see dibCreatures.ts).
// The battle model is Undertale's: talk (ACT) until they can be spared, or fight.
import { DIB_KITS } from './dibCreatures';

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

export interface MonsterDef {
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
  bindChance: number;
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
  rooms: readonly string[];
  wiki: { number: string; stars: number; element: string; lv1: { hp: number; attack: number; magic: number; defense: number } };
  sprite: { dominant_color_hex: string; faces: string; flier: boolean };
  battle: {
    check: string;
    intro: string;
    idle: readonly string[];
    talk: readonly string[];
    spare_text: string;
    lore: string;
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

// Real DIB level-1 stats are converted into Undertale-scale numbers, keeping their ratios.
function fromKit(k: Kit): MonsterDef {
  const boss = k.role === 'boss' || k.role === 'miniboss';
  const s = k.wiki.lv1;
  const offense = Math.max(s.attack, s.magic);
  const hp = k.role === 'boss' ? 170 : k.role === 'miniboss' ? 110 : Math.round(s.hp * 1.1);
  const atk = k.role === 'boss' ? 7 : k.role === 'miniboss' ? 6 : Math.max(3, Math.min(5, Math.round(offense / 2.2)));
  const def = boss ? 3 : Math.round(s.defense / 5);
  return {
    id: k.id,
    name: k.name,
    color: nameColor(k.sprite.dominant_color_hex),
    art: k.id === 'divine' ? 'mon_divine' : 'mon_' + k.id,
    height: k.role === 'boss' ? 380 : k.role === 'miniboss' ? 330 : 280,
    hp,
    atk,
    def,
    exp: Math.round(k.wiki.stars * (boss ? 14 : 4)),
    gold: Math.round(k.wiki.stars * (boss ? 20 : 6)),
    stars: k.wiki.stars,
    affinity: k.wiki.element,
    boss,
    music: boss ? 'boss' : 'battle',
    bindChance: k.role === 'boss' ? 0 : boss ? 0.3 : 0.65,
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
  .sort((a, b) => Number(a.number) - Number(b.number))
  .map((m) => m.id);

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = {
  tonic: { id: 'tonic', name: 'Restoration Tonic', desc: 'Restores 15 HP. Tastes like blue.' },
  orb: { id: 'orb', name: 'Binding Orb', desc: 'Binds a calm or weakened monster as your companion.' },
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
}

// The FIGHT cards come straight from the UI sheet. TU ("time units") is the
// Dragon Island Blue cost of the move: here it sets how long the enemy's
// counter-attack lasts, so stronger moves leave you dodging longer.
export const SKILLS: SkillDef[] = [
  { id: 'tail', name: 'Tail', card: 'ui_card_tail', tu: 70, power: 1, minLv: 1, desc: 'A quick tail sweep. Short counter-attack.' },
  { id: 'outrage', name: 'Outrage', card: 'ui_card_outrage', tu: 160, power: 2.1, minLv: 1, desc: 'A furious charge. Long counter-attack.' },
  { id: 'flame', name: 'Flame', card: 'ui_card_flame', tu: 130, power: 1.6, minLv: 1, desc: 'Dragonfire burst. Medium counter-attack.' },
  { id: 'wyrm', name: 'Wyrmsong', card: 'ui_card_unknown', tu: 200, power: 2.8, minLv: 3, desc: 'Unlocks at LV 3. A song that shakes the rift.' },
];
