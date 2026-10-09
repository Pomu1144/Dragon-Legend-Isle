/** Standalone validation of new world geometry and bidirectional exits. */
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const code = fs.readFileSync('src/data/region_westguard_wesing.ts', 'utf8');
const transpiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObj = {};
new Function('exports','require',transpiled)(exportsObj,require);
const rooms = exportsObj.REGION_ROOMS;
const ids = new Map(rooms.map(r=>[r.id,r]));
assert.equal(rooms.length,6);
function inside(x,y,poly) {
  let yes = false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,yi]=poly[i],[xj,yj]=poly[j];
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;
  }
  return yes;
}
function walk(r,x,y) { return r.walk.some(p=>inside(x,y,p))&&!r.block.some(p=>inside(x,y,p)); }
function reachable(r,a,b){
  const S=22, maxX=Math.ceil(r.size[0]/S), maxY=Math.ceil(r.size[1]/S);
  const key=(x,y)=>y*maxX+x;
  const sx=Math.round(a[0]/S),sy=Math.round(a[1]/S);
  const tx=Math.round(b[0]/S),ty=Math.round(b[1]/S);
  const frontier=[[sx,sy]], seen=new Set([key(sx,sy)]);
  let head=0;
  while(head<frontier.length){
    const [x,y]=frontier[head++];
    if(Math.abs(x-tx)<=1&&Math.abs(y-ty)<=1)return true;
    for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const u=x+dx,v=y+dy,k=key(u,v);
      if(u<0||v<0||u>=maxX||v>=maxY||seen.has(k)||!walk(r,u*S,v*S))continue;
      seen.add(k);frontier.push([u,v]);
    }
  }
  return false;
}
for(const room of rooms){
  assert.deepEqual(room.size,[1670,944]);
  const [prev,next]=Object.entries(room.spawns);
  assert.equal(room.exits.length,2);
  for(const [name,s] of Object.entries(room.spawns)){
    assert(walk(room,...s.at),room.id+' spawn outside walk: '+name);
    assert(walk(room,s.at[0]-9,s.at[1])&&walk(room,s.at[0]+9,s.at[1]-4),room.id+' unsafe spawn: '+name);
  }
  assert(reachable(room,prev[1].at,next[1].at),room.id+' lacks traversable route');
  for(const e of room.exits){
    const target=ids.get(e.to);
    if(target)assert(target.spawns[e.spawn],room.id+' missing reciprocal spawn in '+e.to);
    assert([...Array(15)].some((_,i)=>walk(room,e.rect[0]+(i+0.5)*e.rect[2]/15,e.rect[1]+e.rect[3]/2)),room.id+' exit outside walk to '+e.to);
    if(!target)assert(['azurelake_harbor','azurelake_east_ford','westguard_cape','wesing_farmland'].includes(e.to));
  }
  const p='public/assets/bg/'+room.id+'.avif';
  assert(fs.existsSync(p),room.id+' painted background missing');
  console.log('PASS',room.id,'walk + linked exits + background');
}
const gateEntries=exportsObj.REGION_ENTRANCES;
assert.equal(gateEntries.length,2);
console.log('PASS',rooms.length,'regions;',gateEntries.length,'reconnected legacy gate exits');
