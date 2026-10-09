/**
 * Geometry regression for painted overworld rooms.
 * Run: node tools/validate_westguard_wesing.cjs
 *
 * Uses exactly the same room definitions and swept-movement function as Phaser.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute only the typed, pure-data modules; no Phaser or browser required.
require.extensions['.ts'] = (mod, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  mod._compile(js, filename);
};
const { REGION_ROOMS: rooms, REGION_ENTRANCES } = require('../src/data/region_westguard_wesing.ts');
const { PAINTED_COLLISION } = require('../src/data/paintedCollision.ts');
const { sweptMove } = require('../src/world/sweptMove.ts');
assert.equal(rooms.length, 6, 'Exactly six expansion rooms expected');
const ids = new Map(rooms.map(r => [r.id, r]));

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function floor(r, x, y) {
  return r.walk.some(poly => inPoly(x, y, poly)) && !r.block.some(poly => inPoly(x, y, poly));
}
function canStand(r, x, y) {
  const sc = (r.scale[0] + (r.scale[1] - r.scale[0]) * Math.max(0, Math.min(y / r.size[1], 1))) / 0.45;
  const hw = 10 * sc, hd = 6 * sc;
  for (const n of r.npcs ?? []) {
    const dx = (x - n.at[0]) / 34, dy = (y - n.at[1]) / 17;
    if (dx * dx + dy * dy < 1) return false;
  }
  for (const c of r.candles ?? []) {
    if (Math.abs(x - c.at[0]) < 15 * sc && Math.abs(y - c.at[1]) < 10 * sc) return false;
  }
  return [[0,0],[-hw,0],[hw,0],[0,-hd],[0,hd],[-hw*.65,-hd*.65],[hw*.65,-hd*.65]]
    .every(([ox,oy]) => floor(r, x + ox, y + oy));
}
function flood(r, a) {
  const S = 12, W = Math.ceil(r.size[0] / S), H = Math.ceil(r.size[1] / S);
  const key = (x, y) => x + y * W;
  const sx = Math.round(a[0] / S), sy = Math.round(a[1] / S);
  assert(canStand(r, ...a), r.id + ' has unsafe spawn ' + a);
  const open = [[sx, sy]], seen = new Set([key(sx,sy)]);
  for (let i = 0; i < open.length; i++) {
    const [x, y] = open[i];
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const xx = x + dx, yy = y + dy, k = key(xx,yy);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || seen.has(k)) continue;
      if (!canStand(r,xx*S,yy*S)) continue;
      seen.add(k);open.push([xx,yy]);
    }
  }
  return open.map(([x,y])=>[x*S,y*S]);
}
const forbidden = {
  azurelake_coast_road: [[1450,580],[235,565],[800,289]],
  westguard_watchpath: [[500,480],[1110,530],[940,387],[695,532]],
  westguard_square: [[660,520],[955,384],[655,760],[967,765],[1460,650]],
  wesing_long_road: [[1250,700],[150,630],[995,517],[580,655]],
  wesing_millbridge: [[1250,650],[440,400],[720,430],[940,435]],
  wesing_square: [[580,540],[1110,453],[650,760],[1057,772],[1400,500]],
};
let forbiddenCount=0, npcCount=0, propCount=0, reachableCount=0;
for (const r of rooms) {
  assert.deepEqual(r.size, [1670,944]);
  assert(PAINTED_COLLISION[r.id], 'Missing source collision layer');
  assert(r.block.length >= 2, r.id + ' needs solid prop geometry');
  assert(r.walk.every(p => p.length >= 8));
  const file = path.join('public/assets/bg',r.id+'.avif');
  assert(fs.existsSync(file), r.id + ' missing painted background');
  assert.equal(Object.keys(r.spawns).length,2);
  assert.equal(r.exits.length,2);
  const starts = Object.values(r.spawns);
  const visited = flood(r,starts[0].at);
  const canReach = (x,y,dist=18) => visited.some(([xx,yy])=>Math.hypot(x-xx,y-yy)<dist);
  assert(canStand(r,...starts[1].at),r.id+' return spawn is inside scenery');
  assert(canReach(...starts[1].at),r.id+' main road does not connect its exits');
  for(const e of r.exits) {
    const target=ids.get(e.to);
    if(target) assert(target.spawns[e.spawn],r.id+' missing reciprocal landing in '+e.to);
    else assert(['azurelake_harbor','azurelake_east_ford','westguard_cape','wesing_farmland'].includes(e.to));
    const [x,y,w,h]=e.rect;
    assert(visited.some(([xx,yy])=>xx>=x&&xx<=x+w&&yy>=y&&yy<=y+h),
       r.id+' exit is hidden behind a wall: '+e.to);
  }
  for(const point of forbidden[r.id]){
    assert(!canStand(r,...point),r.id+' player can walk on a forbidden prop: '+point);
    forbiddenCount++;
  }
  for(const n of r.npcs??[]) {
    assert(floor(r,...n.at),r.id+' NPC stands in painted scenery: '+n.id);
    assert(visited.some(([x,y])=>Math.hypot(x-n.at[0],y-n.at[1])<60),
       r.id+' NPC is unreachable for dialogue: '+n.id);
    npcCount++;
  }
  for(const t of r.things??[]) {
    assert(visited.some(([x,y])=>Math.hypot(x-t.at[0],y-t.at[1])<t.r-6),
       r.id+' interactable cannot be examined: '+t.id);
    propCount++;
  }
  for(const c of r.candles??[]){
    assert(!canStand(r,...c.at),r.id+' player can step directly onto a candle');
    assert(visited.some(([x,y])=>Math.hypot(x-c.at[0],y-c.at[1])<55),
       r.id+' cannot use its save candle');
  }
  reachableCount++;
  console.log('PASS',r.id,'collision paths + exits + props + interactive NPCs');
}
// High-speed movement must stop at solid objects, not tunnel through them.
for(const [id,at,delta,axis,min,max] of [
 ['westguard_square',[850,526],[-300,0],0,751,850],     // stone well
 ['wesing_square',[922,480],[310,0],0,900,1012],       // merchant stalls
 ['wesing_millbridge',[850,443],[300,0],0,845,921],    // bridge parapet
]){
 const r = ids.get(id);
 assert(canStand(r,...at),id+' high-speed test start outside roadway');
 const result = sweptMove(...at,...delta,(x,y)=>canStand(r,x,y));
 assert(canStand(r,...result),id+' sweep ended in a solid object');
 assert(result[axis]>=min && result[axis]<=max,id+' tunneled into/across scenery: '+result);
 console.log('PASS',id,'high-speed swept collision',result.map(x=>x.toFixed(1)).join(','));
}
assert.equal(REGION_ENTRANCES.length,2);
console.log('PASS',reachableCount,'connected rooms,',forbiddenCount,'blocked scenery fixtures,',
  npcCount,'talkable NPCs,',propCount,'reachable landmarks');
