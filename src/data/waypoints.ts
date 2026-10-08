// Waypoints: the candles Kael has lit. A beaten team wakes at the nearest lit one, counted in rooms walked.
import { ROOMS, type Pt, type RoomDef } from './rooms';
import { State } from '../state';

function inPoly(x: number, y: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Somewhere Kael can stand beside a room's candle: its 'candle' spawn, or the nearest open ground around it. */
function besideCandle(r: RoomDef): Pt {
  const sp = r.spawns.candle;
  if (sp) return [sp.at[0], sp.at[1]];
  const [cx, cy] = r.candles![0].at;
  const inRect = (x: number, y: number, [rx, ry, rw, rh]: number[]) => x >= rx - 20 && x <= rx + rw + 20 && y >= ry - 20 && y <= ry + rh + 20;
  // standing room for his feet and shoulders, clear of exits and story triggers
  const open = (x: number, y: number) =>
    [[0, 0], [-14, 0], [14, 0], [0, -4]].every(([dx, dy]) => r.walk.some((p) => inPoly(x + dx, y + dy, p)) && !r.block.some((p) => inPoly(x + dx, y + dy, p))) &&
    !r.exits.some((e) => inRect(x, y, e.rect)) &&
    !(r.triggers ?? []).some((t) => inRect(x, y, t.rect));
  for (let rad = 40; rad < 400; rad += 8) {
    for (let k = 0; k < 24; k++) {
      const a = Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12); // try below the candle first
      const x = Math.round(cx + rad * Math.cos(a));
      const y = Math.round(cy + rad * Math.sin(a));
      if (open(x, y)) return [x, y];
    }
  }
  return [cx, cy + 40];
}

/** The lit candle nearest to a room by the roads Kael can actually take (locked roads do not count). */
export function nearestWaypoint(from: string): { room: string; at: Pt } {
  const start = ROOMS[from] ? from : 'plaza';
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    const r = ROOMS[id];
    if (r.candles?.some((c) => State.flag('candle_' + c.id))) return { room: id, at: besideCandle(r) };
    for (const e of r.exits) {
      if (e.locked && (e.locked === 'never' || !State.flag(e.locked))) continue;
      if (!ROOMS[e.to] || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  // none lit yet: home, by the plaza candle
  return { room: 'plaza', at: besideCandle(ROOMS.plaza) };
}
