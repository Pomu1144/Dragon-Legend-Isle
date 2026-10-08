// Persistent run state. One save slot in localStorage, kept up to date as you play (WorldScene.autosave)
// and on resting at candles.

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
  monsters: PartyMon[]; // every monster Kael owns
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
      current = { ...newState(), ...JSON.parse(raw) };
      return true;
    } catch {
      return false;
    }
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

// LV 6 matters: that is when DIB hatchlings evolve into Dragonlings.
export const EXP_TABLE = [0, 10, 26, 48, 76, 110, 160, 220];

/** Apply EXP and return the number of level-ups gained. */
export function gainExp(n: number): number {
  const s = current;
  s.exp += n;
  let ups = 0;
  while (s.lv < EXP_TABLE.length && s.exp >= EXP_TABLE[s.lv]) {
    s.lv += 1;
    s.maxHp += 6;
    s.atk += 2;
    s.def += 1;
    s.hp = s.maxHp;
    ups++;
  }
  return ups;
}
