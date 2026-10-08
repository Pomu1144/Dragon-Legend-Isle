// Persistent run state. One save slot in localStorage, kept up to date as you play (WorldScene.autosave)
// and on resting at candles.
import { baseOf, maxHpOf, newPartyMon } from './battle/units';

export interface Inventory {
  [itemId: string]: number;
}

export interface MonsterRecord {
  seen: boolean;
  spared: number;
  defeated: number;
  bound: boolean;
}

/** One monster Kael owns: the hatchling or a captured creature. Fights in DIB-style team battles. */
export interface PartyMon {
  uid: string; // unique per owned monster
  id: string; // MONSTERS id, or a STARTERS id for the hatchling
  lv: number;
  exp: number; // EXP toward the next level (resets on level-up)
  hp: number; // current HP (0 = fainted); max HP comes from the battle unit model
  starter?: boolean; // the Guild hatchling
}

export const PARTY_SIZE = 3;

export interface GameState {
  name: string;
  lv: number;
  exp: number;
  gold: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  room: string;
  x: number;
  y: number;
  flags: Record<string, boolean>;
  inventory: Inventory;
  bestiary: Record<string, MonsterRecord>;
  encountersLeft: Record<string, number>;
  kills: number;
  spares: number;
  starter?: { id: string; evolved: boolean };
  monsters: PartyMon[]; // every monster Kael owns, in team order (the bench steps in in this order)
  party: string[]; // uids of the (up to PARTY_SIZE) monsters that fight, in slot order
  playSeconds: number;
}

const KEY = 'dragon-legend-isle.save.v1';

export function newState(): GameState {
  return {
    name: 'Kael',
    lv: 1,
    exp: 0,
    gold: 0,
    hp: 24,
    maxHp: 24,
    atk: 6,
    def: 1,
    room: 'plaza',
    x: 420,
    y: 560,
    flags: {},
    inventory: { tonic: 2, orb: 0 },
    starter: undefined,
    monsters: [],
    party: [],
    bestiary: {},
    encountersLeft: {},
    kills: 0,
    spares: 0,
    playSeconds: 0,
  };
}

let current: GameState = newState();

export const State = {
  get(): GameState {
    return current;
  },
  reset() {
    current = newState();
  },
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* storage unavailable — the run continues unsaved */
    }
  },
  hasSave(): boolean {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  },
  load(): boolean {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw) as Partial<GameState>;
      current = { ...newState(), ...saved };
      if (!Array.isArray(saved.monsters)) migrateToTeams();
      current.party = (current.party ?? []).filter((uid) => current.monsters.some((m) => m.uid === uid)).slice(0, PARTY_SIZE);
      return true;
    } catch {
      return false;
    }
  },
  /** The monsters that fight, in slot order. */
  partyMons(): PartyMon[] {
    return current.party.map((uid) => current.monsters.find((m) => m.uid === uid)).filter((m): m is PartyMon => !!m);
  },
  /** The bench: every owned monster outside the party, in team order. When an ally faints in battle the next living one steps in. */
  bench(): PartyMon[] {
    return current.monsters.filter((m) => !current.party.includes(m.uid));
  },
  /** Move a benched monster one place earlier (-1) or later (+1) in team order. */
  moveOnBench(uid: string, dir: -1 | 1): boolean {
    const bench = State.bench();
    const i = bench.findIndex((m) => m.uid === uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= bench.length) return false;
    swapInTeam(bench[i], bench[j]);
    return true;
  },
  /** A benched monster takes party slot `slot`; whoever stood there takes its place on the bench. */
  stepIn(uid: string, slot: number) {
    const mon = current.monsters.find((m) => m.uid === uid);
    if (!mon || current.party.includes(uid)) return;
    const out = current.monsters.find((m) => m.uid === current.party[slot]);
    if (!out) {
      current.party.push(uid);
      return;
    }
    current.party[slot] = uid;
    swapInTeam(mon, out);
  },
  /** Send a monster to the end of the bench (leaving the party if it stood there). */
  toBenchEnd(uid: string) {
    const i = current.monsters.findIndex((m) => m.uid === uid);
    if (i < 0) return;
    current.party = current.party.filter((u) => u !== uid);
    current.monsters.push(...current.monsters.splice(i, 1));
  },
  /** Add a newly owned monster: it joins the party when a slot is free, otherwise it waits in storage. */
  addMonster(mon: PartyMon): 'party' | 'stored' {
    current.monsters.push(mon);
    syncLv();
    if (current.party.length < PARTY_SIZE) {
      current.party.push(mon.uid);
      return 'party';
    }
    return 'stored';
  },
  /** Every owned monster back to full HP (candles, waking after a defeat). */
  healParty() {
    for (const m of current.monsters) m.hp = maxHpOf(m.id, m.lv, isEvolved(m));
  },
  /** Whether this monster is the hatchling in its evolved (Dragonling) form. */
  evolved(mon: PartyMon): boolean {
    return isEvolved(mon);
  },
  flag(name: string): boolean {
    return !!current.flags[name];
  },
  setFlag(name: string, v = true) {
    current.flags[name] = v;
  },
  record(id: string): MonsterRecord {
    if (!current.bestiary[id]) current.bestiary[id] = { seen: false, spared: 0, defeated: 0, bound: false };
    return current.bestiary[id];
  },
  addItem(id: string, n = 1) {
    current.inventory[id] = (current.inventory[id] ?? 0) + n;
  },
  useItem(id: string): boolean {
    if ((current.inventory[id] ?? 0) <= 0) return false;
    current.inventory[id] -= 1;
    return true;
  },
};

/** Two owned monsters trade places in team order. */
function swapInTeam(a: PartyMon, b: PartyMon) {
  const list = current.monsters;
  const i = list.indexOf(a);
  const j = list.indexOf(b);
  if (i >= 0 && j >= 0) [list[i], list[j]] = [list[j], list[i]];
}

function isEvolved(mon: PartyMon) {
  return !!mon.starter && !!current.starter?.evolved;
}

/** Kael's LV follows his strongest monster, so older LV checks keep working. It never drops. */
function syncLv() {
  current.lv = Math.max(current.lv, ...current.monsters.map((m) => m.lv));
}

// Saves from before team battles had the hatchling and captured monsters only as flags:
// the hatchling becomes a monster at Kael's LV, and every captured species one LV below him.
function migrateToTeams() {
  const s = current;
  s.monsters = [];
  s.party = [];
  const add = (mon: PartyMon) => {
    mon.hp = maxHpOf(mon.id, mon.lv, isEvolved(mon));
    s.monsters.push(mon);
    if (s.party.length < PARTY_SIZE) s.party.push(mon.uid);
  };
  if (s.starter) add(newPartyMon(s.starter.id, Math.max(1, s.lv), true));
  for (const [id, rec] of Object.entries(s.bestiary)) {
    if (!rec.bound || id === s.starter?.id || !baseOf(id) || s.monsters.some((m) => m.id === id)) continue;
    add(newPartyMon(id, Math.max(1, s.lv - 1)));
  }
}
