import { DIB_KITS } from './dibCreatures';
import { EXPANSION_ROOMS, WAYSTONE_EXITS, WAYSTONE_SPAWNS } from './expansion';

// Overworld rooms. Every coordinate is in the source painting's pixel space,
// so the painting is drawn 1:1 and these polygons describe where feet can go.

export type Pt = [number, number];
export type Dir = 'down' | 'left' | 'right' | 'up';

export interface Exit {
  rect: [number, number, number, number]; // x, y, w, h
  to: string;
  spawn: string;
  locked?: string; // flag that must be set, otherwise `lockedText` is shown
  lockedText?: string[];
}

export interface Interactable {
  id: string;
  at: Pt;
  r: number;
  lines: string[];
  speaker?: string;
  portrait?: string;
}

export interface Npc {
  id: string;
  at: Pt;
  sprite: string;
  name: string;
  portrait: string;
}

export interface Light {
  at: Pt;
  r: number;
  color: number;
  flicker?: boolean;
}

export interface Trigger {
  id: string;
  rect: [number, number, number, number];
  once: string; // flag set after it fires
  requires?: string;
}

/** One encounter-table entry. depth is how far into the room (0 = the south edge you enter by, 1 = the far north edge) it can appear. */
export interface Encounter {
  id: string;
  w: number;
  depth?: [number, number];
}

export interface RoomDef {
  id: string;
  name: string;
  bg: string;
  size: [number, number];
  walk: Pt[][];
  block: Pt[][];
  spawns: Record<string, { at: Pt; dir: Dir }>;
  exits: Exit[];
  scale: [number, number]; // character scale at top / bottom edge of the room
  npcs?: Npc[];
  things?: Interactable[];
  candles?: { id: string; at: Pt; kind: 'candle_double' | 'candle_tall' | 'candle_small' }[];
  lights?: Light[];
  encounters?: { table: Encounter[]; budget: number };
  triggers?: Trigger[];
  music: string;
  fireflies?: number;
  tint?: number;
}

const warm = 0xffb35a;

export const ROOMS: Record<string, RoomDef> = {
  plaza: {
    id: 'plaza',
    name: 'Azurelake — Spawn Plaza',
    bg: 'bg_plaza',
    size: [1533, 1026],
    scale: [0.48, 0.5],
    music: 'town',
    fireflies: 14,
    walk: [
      [
        [105, 600], [105, 470], [205, 452], [300, 490], [560, 495], [578, 420], [578, 205],
        [688, 205], [688, 400], [780, 405], [880, 398], [1000, 412], [1130, 388], [1330, 388],
        [1533, 398], [1533, 645], [1060, 652], [1000, 632], [856, 672], [862, 848],
        [1000, 840], [1533, 850], [1533, 905], [1300, 925], [1000, 940], [760, 946], [500, 940],
        [200, 925], [0, 905], [0, 858], [200, 850], [640, 850], [640, 672], [560, 682], [450, 652],
      ],
    ],
    block: [
      [[600, 520], [640, 468], [700, 450], [800, 450], [862, 480], [882, 530], [822, 578], [700, 584], [622, 562]],
      [[1052, 470], [1100, 446], [1460, 446], [1462, 612], [1060, 612]],
      [[1015, 590], [1045, 590], [1045, 612], [1015, 612]],
    ],
    spawns: {
      start: { at: [420, 560], dir: 'down' },
      fromGate: { at: [50, 882], dir: 'right' },
      candle: { at: [330, 590], dir: 'down' },
    },
    exits: [{ rect: [0, 850, 18, 70], to: 'gate', spawn: 'fromPlaza', locked: 'hasStarter' }],
    triggers: [{ id: 'gm_stop', rect: [600, 610, 300, 90], once: 'briefed' }],
    npcs: [
      { id: 'wren', at: [560, 590], sprite: 'wren_idle', name: 'Wren', portrait: 'wren_portrait' },
      { id: 'halvard', at: [1236, 432], sprite: 'guildmaster_idle', name: 'Master Halvard', portrait: 'guildmaster_portrait' },
    ],
    things: [
      { id: 'inn', at: [262, 450], r: 50, lines: ['* The Tankard Inn.', '* The shutters are barred. A notice nailed to the door: "Closed until the western road is safe."'] },
      { id: 'shop', at: [840, 404], r: 55, lines: ['* Azure Provisions. Rows of tonics glow faintly behind the glass.', '* The lamps inside are out. Whoever keeps this shop left in a hurry.'] },
      { id: 'guild', at: [1230, 392], r: 70, lines: ['* The Tamers\' Guild Hall. Wounded hunters are being carried inside.', '* The anchor banners hang heavy and still.'] },
      { id: 'fountain', at: [740, 590], r: 60, lines: ['* The white blossoms around the fountain glow faintly.', '* Beneath the water\'s murmur, you hear the sea grinding against the harbor wall.'] },
      { id: 'stalls', at: [1250, 630], r: 120, lines: ['* Night market stalls, abandoned mid-trade. Coins still sit on the counters.', '* Nobody stayed to collect them.'] },
    ],
    candles: [{ id: 'plaza', at: [330, 560], kind: 'candle_double' }],
    lights: [
      { at: [85, 400], r: 140, color: warm, flicker: true }, { at: [135, 510], r: 120, color: warm, flicker: true },
      { at: [540, 590], r: 120, color: warm, flicker: true }, { at: [955, 590], r: 120, color: warm, flicker: true },
      { at: [1030, 530], r: 140, color: warm, flicker: true }, { at: [1465, 410], r: 120, color: warm, flicker: true },
      { at: [410, 770], r: 110, color: warm, flicker: true }, { at: [600, 740], r: 110, color: warm, flicker: true },
      { at: [890, 740], r: 110, color: warm, flicker: true }, { at: [1080, 770], r: 110, color: warm, flicker: true },
      { at: [80, 750], r: 110, color: warm, flicker: true }, { at: [1460, 740], r: 110, color: warm, flicker: true },
      { at: [1250, 540], r: 220, color: 0xffc070 }, { at: [745, 420], r: 160, color: 0xbfe8ff },
    ],
  },

  gate: {
    id: 'gate',
    name: 'Azurelake — West Gate',
    bg: 'bg_gate',
    size: [1670, 941],
    scale: [0.47, 0.5],
    music: 'town',
    fireflies: 10,
    walk: [
      [
        [0, 352], [170, 384], [330, 424], [470, 478], [600, 540], [690, 590], [770, 560], [776, 430], [820, 380],
        [950, 250], [1050, 140], [1095, 30], [1110, 0], [1290, 0], [1250, 90], [1120, 200],
        [1000, 320], [905, 420], [905, 572], [1000, 610], [1100, 602], [1670, 602], [1670, 700],
        [1500, 690], [1280, 730], [1010, 790], [900, 800], [1000, 870], [1080, 941], [420, 941],
        [470, 850], [560, 790], [520, 700], [560, 640], [560, 578], [330, 500], [150, 455], [0, 425],
      ],
    ],
    block: [
      [[560, 680], [640, 680], [640, 750], [560, 750]],
      [[355, 445], [390, 445], [390, 472], [355, 472]],
      [[1280, 670], [1312, 670], [1312, 700], [1280, 700]],
    ],
    spawns: {
      fromPlaza: { at: [760, 900], dir: 'up' },
      fromOutskirts: { at: [1195, 40], dir: 'down' },
    },
    triggers: [{ id: 'gate_sign', rect: [520, 760, 460, 160], once: 'gateSign' }],
    exits: [
      { rect: [420, 925, 660, 16], to: 'plaza', spawn: 'fromGate' },
      { rect: [1110, 0, 180, 12], to: 'outskirts', spawn: 'fromGate' },
      { rect: [0, 352, 12, 73], to: 'gate', spawn: 'fromPlaza', lockedText: ['* The old harbor road. Boarded shut, the planks scored by something with claws.'], locked: 'never' },
      { rect: [1658, 602, 12, 98], to: 'gate', spawn: 'fromPlaza', lockedText: ['* The east road lies under black floodwater.'], locked: 'never' },
    ],
    things: [
      { id: 'banner', at: [985, 790], r: 60, lines: ['* The anchor of Azurelake.', '* Stitched beneath it: "Every tide returns."'] },
      { id: 'bench', at: [1170, 650], r: 60, lines: ['* A cold stone bench, slick with dew.'] },
      { id: 'gatehouse', at: [840, 560], r: 70, lines: ['* The West Gate stands open.', '* Beyond the bridge, the forest road waits in the dark.'] },
    ],
    lights: [
      { at: [85, 320], r: 120, color: warm, flicker: true }, { at: [370, 390], r: 120, color: warm, flicker: true },
      { at: [580, 610], r: 130, color: warm, flicker: true }, { at: [678, 505], r: 110, color: warm, flicker: true },
      { at: [720, 410], r: 110, color: warm, flicker: true }, { at: [945, 460], r: 110, color: warm, flicker: true },
      { at: [980, 565], r: 110, color: warm, flicker: true }, { at: [932, 690], r: 120, color: warm, flicker: true },
      { at: [1295, 595], r: 120, color: warm, flicker: true }, { at: [932, 180], r: 100, color: warm, flicker: true },
      { at: [1125, 205], r: 100, color: warm, flicker: true }, { at: [1035, 80], r: 90, color: warm, flicker: true },
    ],
  },

  outskirts: {
    id: 'outskirts',
    name: 'Western Outskirts',
    bg: 'bg_outskirts',
    size: [1670, 942],
    scale: [0.34, 0.48],
    music: 'field',
    fireflies: 34,
    walk: [
      [
        [820, 0], [840, 80], [740, 180], [690, 280], [680, 400], [690, 520], [640, 620], [600, 720],
        [590, 830], [570, 942], [1010, 942], [1000, 830], [990, 740], [990, 620], [1010, 520],
        [980, 420], [950, 320], [980, 230], [1060, 150], [1060, 90], [960, 30], [910, 0],
      ],
    ],
    block: [],
    spawns: {
      fromGate: { at: [790, 890], dir: 'up' },
      fromForest: { at: [865, 40], dir: 'down' },
      candle: { at: [940, 600], dir: 'up' },
    },
    exits: [
      { rect: [570, 930, 440, 12], to: 'gate', spawn: 'fromOutskirts' },
      { rect: [820, 0, 90, 10], to: 'forest', spawn: 'fromOutskirts' },
    ],
    things: [
      { id: 'lamp', at: [600, 715], r: 45, lines: ['* A trail lamp. Its oil is nearly spent.', '* Someone has kept these burning, night after night. For now.'] },
      { id: 'fence', at: [1040, 210], r: 50, lines: ['* A split-rail fence. Beyond it, the grass has been flattened in long, dragging lines.'] },
    ],
    candles: [{ id: 'outskirts', at: [968, 572], kind: 'candle_small' }],
    lights: [{ at: [585, 670], r: 170, color: warm, flicker: true }, { at: [1010, 712], r: 170, color: warm, flicker: true }],
    encounters: { table: [], budget: 4 },
  },

  forest: {
    id: 'forest',
    name: 'Western Forest — Entrance',
    bg: 'bg_forest',
    size: [1669, 942],
    scale: [0.22, 0.5],
    music: 'forest',
    fireflies: 40,
    walk: [
      [
        [900, 90], [870, 200], [800, 300], [720, 420], [650, 520], [610, 640], [600, 760], [570, 942],
        [1010, 942], [1000, 800], [980, 650], [990, 540], [960, 420], [960, 300], [980, 200], [990, 90],
      ],
      [[420, 505], [720, 470], [660, 585], [430, 585]],
      [[930, 480], [1300, 472], [1320, 565], [990, 565]],
    ],
    block: [],
    spawns: {
      fromOutskirts: { at: [790, 900], dir: 'up' },
      fromMosswood: { at: [945, 110], dir: 'down' },
    },
    exits: [
      { rect: [570, 930, 440, 12], to: 'outskirts', spawn: 'fromForest' },
      { rect: [900, 85, 90, 10], to: 'mosswood', spawn: 'fromForest' },
    ],
    things: [
      { id: 'stoneL', at: [480, 520], r: 70, lines: ['* A waystone carved with a sun.', '* "When the Waystones sleep, the island forgets itself."'] },
      { id: 'stoneR', at: [1225, 515], r: 70, lines: ['* Another sun-carved waystone. Its glow is weak, like a candle in wind.', '* Deeper in the forest, something bigger has gone dark.'] },
    ],
    lights: [{ at: [480, 430], r: 120, color: 0xffe08a, flicker: true }, { at: [1225, 420], r: 120, color: 0xffe08a, flicker: true }, { at: [800, 760], r: 260, color: 0xff9a4a }],
    encounters: { table: [], budget: 4 },
  },

  mosswood: {
    id: 'mosswood',
    name: 'Mosswood Trail',
    bg: 'bg_mosswood',
    size: [1670, 942],
    scale: [0.3, 0.5],
    music: 'forest',
    fireflies: 40,
    walk: [
      [
        [220, 40], [300, 110], [380, 180], [470, 260], [560, 320], [680, 400], [730, 480], [730, 600],
        [680, 760], [640, 942], [1010, 942], [980, 800], [960, 650], [950, 520], [930, 420],
        [860, 360], [720, 280], [560, 190], [430, 110], [330, 40],
      ],
    ],
    block: [],
    spawns: {
      fromForest: { at: [820, 890], dir: 'up' },
      fromWaystone: { at: [285, 70], dir: 'down' },
      candle: { at: [830, 700], dir: 'up' },
    },
    exits: [
      { rect: [640, 930, 370, 12], to: 'forest', spawn: 'fromMosswood' },
      { rect: [220, 30, 110, 10], to: 'waystone', spawn: 'fromMosswood' },
    ],
    candles: [{ id: 'mosswood', at: [905, 690], kind: 'candle_tall' }],
    things: [{ id: 'log', at: [700, 330], r: 60, lines: ['* Moss has swallowed an old cart. Bones, picked clean, lie beneath the wheel.'] }],
    lights: [{ at: [820, 800], r: 240, color: 0xff9a4a }],
    encounters: { table: [], budget: 4 },
    triggers: [{ id: 'lich', rect: [560, 300, 400, 120], once: 'metLich' }],
  },

  waystone: {
    id: 'waystone',
    name: 'The Waystone Fork',
    bg: 'bg_waystone',
    size: [1669, 942],
    scale: [0.3, 0.5],
    music: 'waystone',
    fireflies: 30,
    walk: [
      [
        [640, 942], [660, 800], [700, 650], [690, 540], [600, 440], [470, 360], [350, 260], [250, 170],
        [130, 90], [100, 60], [250, 60], [320, 130], [440, 230], [560, 330], [680, 380], [760, 396],
        [900, 396], [1000, 380], [1150, 320], [1300, 230], [1400, 150], [1450, 70], [1560, 70],
        [1520, 140], [1420, 240], [1260, 340], [1100, 420], [980, 480], [960, 600], [980, 750], [1000, 942],
      ],
    ],
    block: [],
    spawns: { fromMosswood: { at: [820, 890], dir: 'up' } },
    exits: [
      { rect: [640, 930, 360, 12], to: 'mosswood', spawn: 'fromWaystone' },
      { rect: [100, 50, 150, 12], to: 'waystone', spawn: 'fromMosswood', locked: 'never', lockedText: ['* The northern road is swallowed by a wall of rift-mist.', '* Not yet.'] },
      { rect: [1450, 60, 110, 12], to: 'waystone', spawn: 'fromMosswood', locked: 'never', lockedText: ['* The eastern road shimmers and folds back on itself.', '* Not yet.'] },
    ],
    things: [{ id: 'waystone', at: [830, 410], r: 70, lines: ['* The great Waystone. Its four-pointed star is cold and dark.'] }],
    lights: [{ at: [830, 300], r: 200, color: 0x9fd8ff }, { at: [820, 820], r: 240, color: 0xff9a4a }],
    triggers: [{ id: 'orochi', rect: [640, 420, 380, 120], once: 'orochiDone' }],
  },
};

// The world beyond the Waystone (generated rooms; see tools/gen_expansion.py).
for (const r of EXPANSION_ROOMS) ROOMS[r.id] = r;
Object.assign(ROOMS.waystone.spawns, WAYSTONE_SPAWNS);
if (WAYSTONE_EXITS) {
  const ex = ROOMS.waystone.exits;
  ex[1] = { rect: [100, 50, 150, 12], to: WAYSTONE_EXITS.topLeft, spawn: WAYSTONE_EXITS.topLeftSpawn, locked: 'orochiDone', lockedText: ['* The northern road is choked with grey ash and the coils of something vast.', '* Not while the Waystone is guarded.'] };
  ex[2] = { rect: [1450, 60, 110, 12], to: WAYSTONE_EXITS.topRight, spawn: WAYSTONE_EXITS.topRightSpawn, locked: 'orochiDone', lockedText: ['* The eastern road is blocked by eight great coils of scale.', '* Not while the Waystone is guarded.'] };
}

// The western forest, by depth: the entrance holds Bitewings, Goblins, Sludges and Bat
// Squirrels (with a very rare Snow Cub or Fire Cub); Giant Wasps take over deeper in,
// and Giant Ants hold the deepest woods. Depth counts rooms and how far north you are.
const FOREST: Record<string, Encounter[]> = {
  forest: [
    { id: 'bitewing', w: 26 }, { id: 'goblin', w: 24 }, { id: 'sludge', w: 24 }, { id: 'bat_squirrel', w: 24 },
    { id: 'snow_cub', w: 1 }, { id: 'fire_cub', w: 1 },
    { id: 'giant_wasp', w: 14, depth: [0.6, 1] },
  ],
  mosswood: [
    { id: 'bitewing', w: 10 }, { id: 'goblin', w: 10 }, { id: 'sludge', w: 8 }, { id: 'bat_squirrel', w: 10 },
    { id: 'snow_cub', w: 0.6 }, { id: 'fire_cub', w: 0.6 },
    { id: 'giant_wasp', w: 34 },
    { id: 'giant_ant', w: 30, depth: [0.45, 1] },
  ],
  waystone: [{ id: 'giant_ant', w: 60 }, { id: 'giant_wasp', w: 30 }],
};

// Everywhere else, encounter tables come from the roster: each DIB creature appears in
// the rooms its wiki location data places it in (see tools/dib_kits.json).
const BUDGET: Record<string, number> = { outskirts: 4, forest: 5, mosswood: 5, waystone: 2 };
const KIT_IDS = new Set(DIB_KITS.map((k) => k.id as string));
for (const [room, table] of Object.entries(FOREST)) {
  const t = table.filter((e) => KIT_IDS.has(e.id));
  if (t.length && ROOMS[room]) ROOMS[room].encounters = { table: t, budget: BUDGET[room] };
}
for (const k of DIB_KITS) {
  if (k.role !== 'encounter') continue;
  for (const room of k.rooms) {
    const r = ROOMS[room];
    if (!r || FOREST[room]) continue;
    r.encounters ??= { table: [], budget: BUDGET[room] ?? 3 };
    r.encounters.budget = BUDGET[room] ?? r.encounters.budget;
    if (!r.encounters.table.some((e) => e.id === k.id)) r.encounters.table.push({ id: k.id, w: 10 });
  }
}

/** Weighted pick from a room's table, given how deep (0-1) into the room the player is. */
export function rollEncounter(table: Encounter[], depth: number, r = Math.random()) {
  const ok = table.filter((e) => !e.depth || (depth >= e.depth[0] && depth <= e.depth[1]));
  const total = ok.reduce((a, e) => a + e.w, 0);
  let x = r * total;
  for (const e of ok) {
    x -= e.w;
    if (x < 0) return e.id;
  }
  return ok[ok.length - 1]?.id;
}
