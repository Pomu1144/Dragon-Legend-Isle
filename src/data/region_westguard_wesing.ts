import type { Pt, RoomDef } from './rooms';
import type { RegionStory } from './regionTypes';
import { PAINTED_COLLISION, roadPolygon } from './paintedCollision';

/** Six hand-painted, navigable rooms expanding the broken Westguard and Wesing roads. */
interface PaintedRoom {
  id: string;
  name: string;
  music: string;
  fireflies: number;
  lights: NonNullable<RoomDef['lights']>;
  things: NonNullable<RoomDef['things']>;
  npcs?: RoomDef['npcs'];
}
const L = 0xffc179, M = 0x9bc8eb;
const P: PaintedRoom[][] = [
  [
    {
      id: 'azurelake_coast_road', name: 'Azurelake Coast — The Tidal Shelf',

      music: 'field', fireflies: 8,
      lights: [{at:[660,700],r:125,color:L,flicker:true},{at:[930,240],r:140,color:M}],
      things: [
        {id:'tide',at:[660,570],r:80,lines:['* The old coastal road lies beneath the collapsed cliff.','* White shell and lanterns mark a tidal path around the rockfall.']},
        {id:'mark',at:[900,280],r:80,lines:['* The letters WESTGUARD have been chiselled into a boundary stone.','* Beneath them: KEEP TO THE HIGH STONES AT NIGHT.']},
      ],
    },
    {
      id:'westguard_watchpath',name:'Westguard — The Beacon Approach',

      music:'town',fireflies:10,
      lights:[{at:[710,660],r:145,color:L,flicker:true},{at:[1020,420],r:130,color:L,flicker:true},{at:[850,130],r:130,color:M}],
      things:[
        {id:'watch',at:[760,350],r:85,lines:['* Westguard was built to watch the headland, not to keep anyone out.','* The beacon burns, but its pennant hangs at half-mast.']},
        {id:'rope',at:[990,590],r:70,lines:['* New rope and boards stacked by the path. Repair crews have worked here recently.']},
      ],
    },
    {
      id:'westguard_square',name:'Westguard — Beacon Square',

      music:'town',fireflies:8,
      npcs:[
        {id:'westguard_warden',at:[1020,510],sprite:'hunter_idle',name:'Beacon Warden Ivor',portrait:'hunter_portrait'},
        {id:'westguard_netmaker',at:[760,680],sprite:'innkeeper_idle',name:'Netmaker Mira',portrait:'innkeeper_portrait'},
      ],
      lights:[{at:[800,710],r:170,color:L,flicker:true},{at:[1100,575],r:150,color:L,flicker:true},{at:[795,330],r:140,color:L,flicker:true}],
      things:[
        {id:'ledger',at:[935,360],r:80,lines:['* Beacon log, three nights ago: NO SAIL. ASH IN THE WATER.','* THE LANTERN BURNED BLUE.']},
        {id:'nets',at:[690,600],r:80,lines:['* An old fishing net carefully stitched with red thread.']},
      ],
    },
  ],
  [
    {
      id:'wesing_long_road',name:'Wesing Road — The Upper Ford',

      music:'field',fireflies:25,
      lights:[{at:[645,720],r:110,color:L,flicker:true},{at:[840,225],r:125,color:M}],
      things:[
        {id:'ford',at:[760,690],r:85,lines:['* The long-road bridge is broken, but an old trail follows the river to a ford.','* Fresh wheel marks lead toward Wesing.']},
        {id:'waybill',at:[800,385],r:80,lines:['* A guild waybill caught on a thorn: AZURELAKE — WESING — LONGDALE.','* The recipient name has been washed away.']},
      ],
    },
    {
      id:'wesing_millbridge',name:'Wesing — The Old Millbridge',

      music:'town',fireflies:24,
      lights:[{at:[715,650],r:130,color:L,flicker:true},{at:[1015,575],r:135,color:L,flicker:true}],
      things:[
        {id:'wheel',at:[695,470],r:80,lines:['* The waterwheel turns slowly beneath the willow shadows.','* The old stones have held even as the newer long-road bridge fell.']},
        {id:'bridge',at:[895,390],r:80,lines:['* The millbridge is swept clean every evening. Merchants still use it at night.']},
      ],
    },
    {
      id:'wesing_square',name:'Wesing — Willow Market',

      music:'town',fireflies:18,
      npcs:[
        {id:'wesing_courier',at:[1040,520],sprite:'hunter_idle',name:'Courier Sela',portrait:'hunter_portrait'},
        {id:'wesing_miller',at:[770,690],sprite:'innkeeper_idle',name:'Miller Tomas',portrait:'innkeeper_portrait'},
      ],
      lights:[{at:[720,690],r:150,color:L,flicker:true},{at:[1075,580],r:160,color:L,flicker:true},{at:[900,280],r:120,color:M}],
      things:[
        {id:'board',at:[930,350],r:80,lines:['* Guild departures: Azurelake, Longdale, the south road. Every date is crossed through.','* A sender name has been cut from the paper.']},
        {id:'willow',at:[700,540],r:85,lines:['* Ribbons tied to the willow: some for journeys, others for those who never returned.']},
      ],
    },
  ],
];
const anchors = ['azurelake_harbor','azurelake_east_ford'];
const frontiers = ['westguard_cape','wesing_farmland'];
const frontierText = [
  ['* The headland bridge is apart for repairs.','* The cape road will open with the next supply cart.'],
  ['* The guild surveyors have not returned from the abandoned orchards.','* There is no safe marked road through the upper valley yet.'],
];
const pascal = (s: string) => s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
export const REGION_ROOMS: RoomDef[] = P.flatMap((route, region) => route.map((v, i): RoomDef => {
  const prev = route[i - 1]?.id ?? anchors[region];
  const next = route[i + 1]?.id ?? frontiers[region];
  const col = PAINTED_COLLISION[v.id];
  if (!col) throw new Error('No painted collision layer for ' + v.id);
  return {
    id: v.id, name: v.name, bg: 'bg_' + v.id, size: [1670, 944],
    walk: [roadPolygon(col.road)], block: col.block, occluders: col.occluders,
    spawns: {
      ['from' + pascal(prev)]: { at: col.bottom, dir: 'up' },
      ['from' + pascal(next)]: { at: col.top, dir: 'down' },
    },
    exits: [
      { rect: col.bottomExit, to: prev, spawn: 'from' + pascal(v.id) },
      { rect: col.topExit, to: next, spawn: 'from' + pascal(v.id),
        ...(i === route.length - 1 ? { locked: 'never', lockedText: frontierText[region] } : {}) },
    ],
    scale: [0.31, 0.49], music: v.music, fireflies: v.fireflies,
    lights: v.lights,
    things: v.things.map((t) => ({ ...t, ...(col.thingChanges?.[t.id] ?? {}) })),
    npcs: v.npcs?.map((n) => ({ ...n, at: col.npcChanges?.[n.id] ?? n.at })),
    ...(col.candle ? { candles: [{ id: v.id, at: col.candle, kind: 'candle_tall' as const }] } : {}),
  };
}));

export const REGION_UNLOCKS = [
  {exitTo:'azurelake_coast_road',requires:'orochiDone',lockedText:['* The coast cliff has fallen into the sea.','* Lanterns mark a lower route, but it is safer to wait until the Waystone falls quiet.']},
  {exitTo:'wesing_long_road',requires:'orochiDone',lockedText:['* The far half of the long-road bridge has collapsed.','* The upper ford may be passable once the roads are safe.']},
];
export const REGION_NPC_SHEETS = ['hunter','innkeeper'];
export const REGION_SPAWN_PATCHES: { room:string; name:string; spawn:{at:Pt;dir:'up'|'down'|'left'|'right'} }[] = [];
// Restore the West Gate's two barred side exits: they previously looped back to 'gate'
// instead of reaching the already-painted harbor and east roads.
export const REGION_ENTRANCES: { room:string;rect:[number,number,number,number];to:string;spawn:string }[] = [
  {room:'gate',rect:[0,352,12,73],to:'azurelake_harbor_road',spawn:'fromGate'},
  {room:'gate',rect:[1658,602,12,98],to:'azurelake_east_road',spawn:'fromGate'},
];
export const REGION_TABLES: Record<string,{id:string;w:number;depth?:[number,number];nocap?:boolean}[]> = {
  azurelake_coast_road:[{id:'giant_crab',w:22},{id:'piranha',w:14},{id:'bitewing',w:12}],
  wesing_long_road:[{id:'goblin',w:22},{id:'bitewing',w:17},{id:'sludge',w:15}],
};
const hero = (text:string) => ({speaker:'Kael',portrait:'hero_portrait',text});
const guard = (text:string) => ({speaker:'Beacon Warden Ivor',portrait:'hunter_portrait',text});
const net = (text:string) => ({speaker:'Netmaker Mira',portrait:'innkeeper_portrait',text});
const courier = (text:string) => ({speaker:'Courier Sela',portrait:'hunter_portrait',text});
const miller = (text:string) => ({speaker:'Miller Tomas',portrait:'innkeeper_portrait',text});
export const REGION_STORY: RegionStory = {
  room_entries:{
    azurelake_coast_road:[
      {speaker:'',portrait:'none',text:'* The fallen cliff hides the old road. Someone has marked a narrow shelf with shell and lanternlight.'},
      hero('The road is gone, not the village. Someone kept a way open.')],
    westguard_square:[
      {speaker:'',portrait:'none',text:'* Wind runs between the houses. High over the square, the beacon rings once.'},
      hero('If the watch saw who passed through Azurelake, they might know where to look.')],
    wesing_long_road:[
      {speaker:'',portrait:'none',text:'* Beneath the broken bridge the water runs black. Higher up, cart tracks cross at an older ford.'},
      hero('Wesing has not been cut off. Someone still uses this road.')],
    wesing_square:[
      {speaker:'',portrait:'none',text:'* Willow Market is quiet. A courier has not yet put away the night ledger.'},
      hero('The guild messages must have passed through here. I should ask.')],
  },
  npc_dialogue:{
    westguard_warden:{
      name:'Beacon Warden Ivor',portrait:'hunter_portrait',
      first:[guard('You came by the shelf road? Your boots know the tide better than most.'),
        hero('Did you see a stranger with two children?'),guard('No children at my gate. The night the Waystone failed, the beacon burned blue. Ash blew here against the wind.'),guard('I wrote it in the log. No one believes the sea can carry ash so far.')],
      repeat:['Keep to the shell markers below the cliff.','The beacon stays lit as long as anyone keeps watch.'],
    },
    westguard_netmaker:{
      name:'Netmaker Mira',portrait:'innkeeper_portrait',
      first:[net('The sea brings us strangers every season.'),net('That red thread came from a traveler going inland. Said it was a promise he could not keep.'),hero('Was he traveling with children?'),net('Not here. For names, try the guild waybills in Wesing.')],
      repeat:['The fishing boats leave before moonset.','You do not mend a net unless you plan to cast it again.'],
    },
    wesing_courier:{
      name:'Courier Sela',portrait:'hunter_portrait',
      first:[courier('Since the bridge fell, we carry deliveries by hand over the old millbridge.'),hero('Has anyone traveled with two children?'),courier('One sealed dispatch crossed just after the floods. Guild mark, no sender.'),courier('The rider would not stop for a receipt. He knew the back roads.')],
      repeat:['The sealed pages went north.','People disappear between mile markers, not at them.'],
    },
    wesing_miller:{
      name:'Miller Tomas',portrait:'innkeeper_portrait',
      first:[miller('Our old wheel survived the flood. The newer bridge did not.'),miller('We sweep the stones every night so travelers do not sleep among the river things.'),miller('If you are following someone, ask who kept the lanterns lit.')],
      repeat:['A road is worth as much as the hands that keep it open.','The willow was here before the guild road.'],
    },
  },
  bosses:{},unlock_lines:{},
  map_text_addendum:"Two routes lead farther: the tidal shelf beside Azurelake's ruined coast road reaches the beacon village of Westguard. The upper crossing beyond Ashfall Ford passes Wesing's millbridge and its Willow Market. The cape and the upper valley await surveyors.",
};
