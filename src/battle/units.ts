// The DIB team-battle unit model: who a creature is (base stats and abilities), how its
// level grows, and the battle math (ability text parsing, Time Units, damage, elements).
import { MONSTERS, type Ability, type Stats } from '../data/monsters';
import { STARTERS } from '../data/starters';
import { State, type PartyMon } from '../state';

export interface UnitBase {
  id: string;
  name: string;
  lv1: Stats;
  abilities: Ability[];
  element: string;
  art: string;
  stars: number;
  role?: string;
  color: string;
}

// The DIB wiki lists the Dragonlings' own Lv1 stats on their pages (3.5 stars each).
const DRAGONLING_LV1: Record<string, Stats> = {
  gold_hatchling: { hp: 35, attack: 12, magic: 12, speed: 22, defense: 22, resist: 22 },
  spark_hatchling: { hp: 35, attack: 12, magic: 12, speed: 22, defense: 22, resist: 22 },
  water_hatchling: { hp: 35, attack: 12, magic: 12, speed: 22, defense: 22, resist: 22 },
  fire_hatchling: { hp: 34, attack: 12, magic: 12, speed: 22, defense: 21, resist: 21 },
};

/** Name tint per DIB element (Water blue, Fire red, Earth green...). */
export const ELEMENT_COLORS: Record<string, string> = {
  Water: '#7fb2ff',
  Fire: '#ff7a5e',
  Earth: '#9ee07c',
  Air: '#d6f1ff',
  Life: '#ffe9a0',
  Death: '#c79bff',
  Arcane: '#f2a6ff',
};

/** Spark / glow tint per element. */
export const ELEMENT_TINT: Record<string, number> = {
  Water: 0x4aa8ff,
  Fire: 0xff6a2a,
  Earth: 0xd0a24e,
  Air: 0xc8f0ff,
  Life: 0xfff0a0,
  Death: 0x9a5aff,
  Arcane: 0xff8aff,
};

export function elementColor(el: string) {
  return ELEMENT_COLORS[el] ?? '#e9e1cf';
}

// A few wiki stat blocks were recorded at the creature's natural (high) level rather than Lv1
// (HP in the hundreds or thousands). Bring them back to a Lv1 budget, keeping their ratios.
function lv1Of(s: Stats): Stats {
  if (s.hp <= 100) return { ...s };
  const k = 50 / s.hp;
  const f = (v: number) => Math.max(1, Math.round(v * k));
  return { hp: 50, attack: f(s.attack), magic: f(s.magic), speed: f(s.speed), defense: f(s.defense), resist: f(s.resist) };
}

/** Battle tier of a role: deities (and the ending's creature) outrank Dragon Overlords. */
export function tierOf(role?: string): 'deity' | 'boss' | 'miniboss' | undefined {
  if (role === 'deity' || role === 'ending') return 'deity';
  if (role === 'boss') return 'boss';
  if (role === 'miniboss') return 'miniboss';
  return undefined;
}

/** A MONSTERS id or a STARTERS id (evolved: the Dragonling's name, art and abilities). */
export function baseOf(id: string, evolved = false): UnitBase | undefined {
  const m = MONSTERS[id];
  if (m) {
    return { id, name: m.name, lv1: lv1Of(m.lv1), abilities: m.abilities, element: m.affinity, art: m.art, stars: m.stars, role: m.role, color: elementColor(m.affinity) };
  }
  const st = STARTERS.find((s) => s.id === id);
  if (!st) return undefined;
  if (!evolved) return { id, name: st.name, lv1: { ...st.lv1 }, abilities: st.abilities, element: st.element, art: 'starter_' + id, stars: st.stars, color: elementColor(st.element) };
  const extra = st.evolution.next_abilities.filter((a) => !st.abilities.some((b) => b.name === a.name));
  return {
    id,
    name: st.evolution.next_name,
    lv1: { ...(DRAGONLING_LV1[id] ?? st.lv1) },
    abilities: [...st.abilities, ...extra],
    element: st.element,
    art: 'starter_' + id + '_evo',
    stars: 3.5,
    color: elementColor(st.element),
  };
}

/** Whether an owned monster shows its evolved form (only the Guild hatchling evolves here). */
export function evolvedOf(mon: PartyMon) {
  return !!mon.starter && !!State.get().starter?.evolved;
}

export function hpAt(lv1hp: number, lv: number) {
  return Math.max(1, Math.round(lv1hp * (1 + 0.18 * (lv - 1))));
}

/** Party-side max HP (owned monsters get no role scaling). */
export function maxHpOf(id: string, lv: number, evolved = false): number {
  const b = baseOf(id, evolved);
  return hpAt(b?.lv1.hp ?? 20, lv);
}

export function expToNext(lv: number): number {
  return Math.round(8 * Math.pow(lv, 1.55)) + 6;
}

let uidSeq = 0;

export function newPartyMon(id: string, lv: number, starter = false): PartyMon {
  const uid = `${id}_${Date.now().toString(36)}${(uidSeq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const evolved = starter && !!State.get().starter?.evolved;
  const mon: PartyMon = { uid, id, lv: Math.max(1, lv), exp: 0, hp: maxHpOf(id, Math.max(1, lv), evolved) };
  if (starter) mon.starter = true;
  return mon;
}

/** Add EXP; levels up (HP refilled), evolves the hatchling at its DIB level. Returns "* ..." lines. */
export function grantExp(mon: PartyMon, n: number): string[] {
  const lines: string[] = [];
  const s = State.get();
  mon.exp += Math.max(0, Math.round(n));
  let grew = false;
  while (mon.lv < 99 && mon.exp >= expToNext(mon.lv)) {
    mon.exp -= expToNext(mon.lv);
    mon.lv++;
    grew = true;
    lines.push(`* ${baseOf(mon.id, evolvedOf(mon))?.name ?? mon.id} grew to LV ${mon.lv}.`);
  }
  const st = mon.starter ? STARTERS.find((x) => x.id === mon.id) : undefined;
  if (st && s.starter && !s.starter.evolved && mon.lv >= st.evolution.at_level) {
    s.starter.evolved = true;
    lines.push(`* ${st.name} is glowing...`, `* ${st.name} evolved into ${st.evolution.next_name}!`);
    const fresh = st.evolution.next_abilities.filter((a) => a.tu !== '-' && !st.abilities.some((b) => b.name === a.name)).map((a) => a.name);
    if (fresh.length) lines.push(`* New techniques: ${fresh.join(', ')}.`);
    grew = true;
  }
  if (grew) {
    mon.hp = maxHpOf(mon.id, mon.lv, evolvedOf(mon));
    // Kael's own LV follows his strongest fighter, so older LV checks keep working.
    const party = s.monsters.filter((m) => s.party.includes(m.uid)).map((m) => m.lv);
    s.lv = Math.max(s.lv, mon.lv, ...party);
  }
  return lines;
}

// ---- abilities --------------------------------------------------------------

export type TargetKind = 'foe' | 'foes2' | 'allFoes' | 'self' | 'allAllies' | 'none';
export type MoveKind = 'damage' | 'status' | 'buff' | 'debuff' | 'cleanse' | 'taunt' | 'stealth' | 'escape' | 'analyze' | 'generic';
export type StatusKind = 'confuse' | 'sleep' | 'stun' | 'poison' | 'slow' | 'haste';
export type StatKey = 'attack' | 'magic' | 'defense' | 'resist';

export interface StatusFx {
  kind: StatusKind;
  tu: number;
  dmg?: [number, number]; // poison: total damage over the duration
  element?: string;
}

/** A DIB ability parsed into something the battle can run. */
export interface Move {
  name: string;
  tu: number;
  target: TargetKind;
  kind: MoveKind;
  dmg?: [number, number];
  magical: boolean;
  element?: string;
  drain: number; // fraction of damage dealt healed back
  statuses: StatusFx[];
  stats: Partial<Record<StatKey, number>>;
  cleanse: StatusKind[] | 'all' | null;
  desc: string; // one line for the menu
  full: string; // the whole effect text (the card's info panel)
  targetText: string;
}

const TARGET_TEXT: Record<TargetKind, string> = { foe: '1 Foe', foes2: '2 Foes', allFoes: 'All Foes', self: 'Self', allAllies: 'All Allies', none: '—' };
const ELEMENTS = ['Water', 'Fire', 'Air', 'Earth', 'Life', 'Death', 'Arcane'];

function elementIn(text: string): string | undefined {
  const m = text.match(/\((\w+)\)/) ?? text.match(/\b(water|fire|air|earth|life|death|arcane)\b/i);
  if (!m) return undefined;
  const e = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return ELEMENTS.includes(e) ? e : undefined;
}

function rangeIn(text: string): [number, number] | undefined {
  const r = text.match(/(\d+)\s*-\s*(\d+)/);
  if (r) return [Number(r[1]), Number(r[2])];
  const one = text.match(/(\d+)\s+(?:\w+\s+)?damage/i);
  if (one) return [Number(one[1]), Number(one[1])];
  return undefined;
}

function tuIn(text: string, fallback: number): number {
  const m = text.match(/(\d+)\s*TUs?/i) ?? text.match(/duration:?\s*(\d+)/i);
  return m ? Number(m[1]) : fallback;
}

// Late-game wiki ranges (hundreds or thousands) are rescaled to a Lv1 budget by the move's TU.
function lv1Range(r: [number, number], tu: number): [number, number] {
  if (r[1] <= 60) return [Math.max(1, Math.min(r[0], r[1])), Math.max(1, r[1])];
  const hi = Math.round(8 + tu * 0.13);
  return [Math.max(1, Math.round((hi * r[0]) / r[1])), hi];
}

function parseTarget(t: string): TargetKind | undefined {
  const s = t.toLowerCase().trim();
  if (/all/.test(s) && /(all(y|ies)|friend|fiend)/.test(s)) return 'allAllies';
  if (/enem/.test(s) || (/all/.test(s) && /foe/.test(s))) return 'allFoes';
  if (/(^2|two)\b/.test(s) || /^2/.test(s)) return 'foes2';
  if (/self|this monster/.test(s)) return 'self';
  if (/foe/.test(s) || s === '1') return 'foe';
  return undefined;
}

/** Parse a wiki ability ("5-6 Physical Damage (Earth)", "Confuses the target for 437 TUs"...). Never throws. */
export function parseAbility(a: Ability): Move | undefined {
  const tu = Number(a.tu);
  if (!a.name || !Number.isFinite(tu) || tu <= 0) return undefined; // passives ([Aura], Immunity...) are not actions
  const full = (a.effect ?? '').replace(/\s+/g, ' ').trim();
  // Anything after "The wiki..." is research notes, not part of the effect.
  const effect = full.split(/\.\s+(?=The wiki|Note)/)[0] || full;
  const desc = effect.replace(/\.$/, '').slice(0, 64) || 'No listed effect';
  const mv: Move = { name: a.name, tu, target: 'foe', kind: 'generic', magical: false, drain: 0, statuses: [], stats: {}, cleanse: null, desc, full: effect.replace(/\.$/, '') || 'No listed effect', targetText: '' };
  const low = effect.toLowerCase();
  try {
    for (const clause of effect.split(/,\s*|\.\s+/)) {
      const c = clause.toLowerCase();
      if (!c.trim()) continue;
      if (/poison|over the duration|over \d+ tu|damage over/.test(c)) {
        const r = rangeIn(clause);
        const prev = mv.statuses.find((x) => x.kind === 'poison');
        if (prev) {
          if (r && !prev.dmg) prev.dmg = lv1Range(r, tu);
        } else mv.statuses.push({ kind: 'poison', tu: tuIn(effect, 500), dmg: r ? lv1Range(r, tu) : undefined, element: elementIn(clause) });
        continue;
      }
      // ("any damage will wake it" and "+200% Damage vs. Dragon" are riders, not hits)
      if (/damage/.test(c) && !mv.dmg && !/wake/.test(c) && !/^\+?\d+(\.\d+)?%/.test(c.trim())) {
        const r = rangeIn(clause);
        mv.dmg = r ? lv1Range(r, tu) : [Math.max(1, Math.round(tu / 12)), Math.max(2, Math.round(tu / 10))];
        mv.magical = /magic/.test(c);
        mv.element = elementIn(clause);
        continue;
      }
    }
    if (/heals? for (\d+)%/.test(low)) mv.drain = Number(low.match(/heals? for (\d+)%/)![1]) / 100;
    if (/confus/.test(low)) mv.statuses.push({ kind: 'confuse', tu: tuIn(effect, 400) });
    if (/sleep/.test(low) && !/removes/.test(low) && !/vs\.? sleep/.test(low)) mv.statuses.push({ kind: 'sleep', tu: tuIn(effect, 180) });
    if (/stun|paraly/.test(low)) mv.statuses.push({ kind: 'stun', tu: tuIn(effect, 100) });
    if (/slow/.test(low) && !/when attacked/.test(low)) mv.statuses.push({ kind: 'slow', tu: tuIn(effect, 500) });
    if (/speeds? up/.test(low)) mv.statuses.push({ kind: 'haste', tu: tuIn(effect, 500) });
    // stat changes: "+2 Defense", "Increases Attack", "Increase magic by 16", "Decreases Defense by 2"
    for (const m of effect.matchAll(/(?:^|[\s,(])([+-]\d+)\s*(attack|magic|defense|resist)\b/gi)) mv.stats[m[2].toLowerCase() as StatKey] = Number(m[1]);
    for (const m of effect.matchAll(/(increase|decrease)s?\s+(attack|magic|defense|resist)(?:\s+by\s+(\d+))?/gi)) {
      const n = m[3] ? Number(m[3]) : 2;
      mv.stats[m[2].toLowerCase() as StatKey] = (m[1].toLowerCase() === 'increase' ? 1 : -1) * n;
    }
    for (const k of Object.keys(mv.stats) as StatKey[]) mv.stats[k] = Math.max(-6, Math.min(6, mv.stats[k]!));
    if (/removes all effects/.test(low)) mv.cleanse = 'all';
    else if (/removes/.test(low) && /sleep|poison/.test(low)) mv.cleanse = [...(/sleep/.test(low) ? ['sleep' as const] : []), ...(/poison/.test(low) ? ['poison' as const] : [])];
    if (mv.cleanse) mv.statuses = mv.statuses.filter((x) => x.kind !== 'sleep' && x.kind !== 'poison');
  } catch {
    /* odd wiki text: keep whatever was parsed */
  }

  const statSum = Object.values(mv.stats).reduce((p, v) => p + (v ?? 0), 0);
  if (/escape from the battle/.test(low)) mv.kind = 'escape';
  else if (/see enemy stats/.test(low)) mv.kind = 'analyze';
  else if (/taunt|more likely to attack this/.test(low)) mv.kind = 'taunt';
  else if (/less likely to attack/.test(low)) mv.kind = 'stealth';
  else if (mv.dmg) mv.kind = 'damage';
  else if (mv.cleanse) mv.kind = 'cleanse';
  else if (mv.statuses.some((x) => x.kind !== 'haste')) mv.kind = 'status';
  else if (statSum < 0) mv.kind = 'debuff';
  else if (statSum > 0 || mv.statuses.length) mv.kind = 'buff';

  const given = parseTarget(a.target ?? '');
  if (mv.kind === 'taunt' || mv.kind === 'stealth' || mv.kind === 'generic') mv.target = 'self';
  else if (mv.kind === 'escape' || mv.kind === 'analyze') mv.target = 'none';
  else if (mv.kind === 'cleanse') mv.target = given === 'allFoes' ? 'allFoes' : 'allAllies';
  else if (given) mv.target = given;
  else mv.target = mv.kind === 'buff' ? 'self' : 'foe';
  // A buff aimed at "foes" in the wiki text is still a buff for the user's side (and vice versa).
  if (mv.kind === 'buff' && (mv.target === 'foe' || mv.target === 'foes2' || mv.target === 'allFoes')) mv.target = 'self';
  if ((mv.kind === 'debuff' || mv.kind === 'status' || mv.kind === 'damage') && (mv.target === 'self' || mv.target === 'allAllies')) mv.target = 'foe';
  mv.targetText = TARGET_TEXT[mv.target];
  return mv;
}

/** Every usable ability of a unit (passives dropped); never empty. */
export function movesOf(b: UnitBase): Move[] {
  const out: Move[] = [];
  for (const a of b.abilities) {
    const m = parseAbility(a);
    if (m && !out.some((x) => x.name === m.name)) out.push(m);
  }
  if (!out.length) out.push(parseAbility({ name: 'Attack', tu: '100', target: '1 Foe', effect: '4-5 Physical Damage' })!);
  // fights first, cheapest first; leaving the battle and reading stats go last
  const late = (m: Move) => (m.kind === 'escape' || m.kind === 'analyze' ? 1 : 0);
  return out.sort((x, y) => late(x) - late(y) || x.tu - y.tu);
}

// ---- time units and damage ----------------------------------------------------

/** TU an action costs at a given speed (faster creatures act sooner). */
export function tuCost(tu: number, speed: number, slowed = false, hasted = false) {
  const k = (slowed ? 1.3 : 1) * (hasted ? 0.62 : 1);
  return Math.round(Math.max(15, Math.min(700, (tu * 22) / (Math.max(1, speed) + 2))) * k);
}

/** First TU at battle start: random-ish, sooner for fast creatures. */
export function startTu(speed: number) {
  return Math.round(((15 + Math.random() * 70) * 22) / (Math.max(1, speed) + 2));
}

const CYCLE = ['Water', 'Fire', 'Air', 'Earth']; // each beats the next; Earth beats Water
const LIGHT = new Set(['Life', 'Light']);
const DARK = new Set(['Death', 'Dark']);

/** DIB-style element matchup multiplier, attack element vs defender element. */
export function elementMult(atk?: string, def?: string) {
  if (!atk || !def) return 1;
  if (atk === def) return 0.9;
  if ((LIGHT.has(atk) && DARK.has(def)) || (DARK.has(atk) && LIGHT.has(def))) return 1.5;
  const a = CYCLE.indexOf(atk);
  const d = CYCLE.indexOf(def);
  if (a < 0 || d < 0) return 1;
  if ((a + 1) % 4 === d) return 1.5;
  if ((d + 1) % 4 === a) return 0.75;
  return 1;
}

export interface Fighter {
  lv: number;
  stats: Stats; // with buffs applied
  element: string;
  dmgMul: number; // deities hit 1.3x harder
}

export function levelMul(lv: number) {
  return 1 + 0.15 * (lv - 1);
}

/** One hit of a damaging move: wiki range at Lv1, scaled by level, stats, element and variance. */
export function rollDamage(att: Fighter, def: Fighter, mv: Move, range = mv.dmg) {
  if (!range) return 0;
  const base = range[0] + Math.random() * (range[1] - range[0]);
  const off = Math.max(1, mv.magical ? att.stats.magic : att.stats.attack);
  const guard = Math.max(1, mv.magical ? def.stats.resist : def.stats.defense);
  const ratio = Math.max(0.5, Math.min(2, Math.sqrt(off / guard)));
  const el = elementMult(mv.element ?? att.element, def.element);
  const n = base * levelMul(att.lv) * ratio * el * (0.9 + Math.random() * 0.2) * att.dmgMul;
  return Math.max(1, Math.round(n));
}
