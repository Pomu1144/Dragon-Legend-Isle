"""Turn the second world-expansion workflow output (the old frontiers: Giant Mangal's upper
floors, Ringfeld, South Earlsome) into game data.

usage: gen_regions.py <regions_result.json>

Writes src/data/regions.ts, copies the painted rooms into public/assets/bg, and merges the
new creature kits and room encounters into tools/dib_kits.json.
"""
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(sys.argv[1]))
plan = d['plan']
plans = {r['id']: r for r in plan['rooms']}
snake = lambda n: n.lower().replace(' ', '_').replace("'", '')
LATER = {'dark_mage', 'dark_priest'}


def color(h):
    try:
        return int(h.replace('#', ''), 16)
    except Exception:
        return 0xFFB35A


rooms, npc_info = [], {}
for rd in d['rooms']:
    rid = rd['id']
    p = plans.get(rid, {})
    shutil.copy(rd['image_path'], os.path.join(ROOT, 'public', 'assets', 'bg', rid + '.jpg'))
    npcs = []
    for n in rd.get('npcs', []):
        meta = next((x for x in p.get('npcs', []) if x['id'] == n['id']), {'name': n['id'].title(), 'sheet': 'innkeeper'})
        sheet = meta.get('sheet', 'innkeeper')
        npcs.append({'id': n['id'], 'at': [round(n['x']), round(n['y'])], 'sprite': sheet + '_idle', 'name': meta['name'], 'portrait': sheet + '_portrait'})
        npc_info[n['id']] = {'name': meta['name'], 'portrait': sheet + '_portrait'}
    exits = []
    for e in rd['exits']:
        ex = {'rect': [round(e['x']), round(e['y']), round(e['w']), round(e['h'])], 'to': e['to'], 'spawn': e['spawn']}
        if e.get('locked_text'):
            ex['locked'] = 'never'  # the next frontier
            ex['lockedText'] = e['locked_text']
        exits.append(ex)
    triggers = []
    for t in rd.get('triggers', []):
        cid = snake(t['id'].split(':', 1)[-1])
        if cid:
            triggers.append({'id': 'b:' + cid, 'rect': [round(t['x']), round(t['y']), round(t['w']), round(t['h'])], 'once': 'boss_' + cid})
    rooms.append({
        'id': rid, 'name': p.get('name', rid), 'bg': 'bg_' + rid,
        'size': [round(v) for v in rd['size']],
        'walk': [[[round(x), round(y)] for x, y in poly] for poly in rd['walk']],
        'block': [[[round(x), round(y)] for x, y in poly] for poly in rd['block']],
        'spawns': {s['name']: {'at': [round(s['x']), round(s['y'])], 'dir': s['dir']} for s in rd['spawns']},
        'exits': exits, 'scale': rd['scale'][:2], 'music': p.get('music', 'forest'),
        'fireflies': 12 if p.get('kind') == 'village' else 26, 'npcs': npcs,
        'things': [{'id': t['id'], 'at': [round(t['x']), round(t['y'])], 'r': round(t['r']), 'lines': t['lines']} for t in rd['things']],
        'candles': [{'id': rid, 'at': [round(rd['candle'][0]), round(rd['candle'][1])], 'kind': 'candle_tall'}] if rd.get('candle') else [],
        'lights': [{'at': [round(l['x']), round(l['y'])], 'r': round(l['r']), 'color': color(l['color']), 'flicker': bool(l['flicker'])} for l in rd['lights']],
        'triggers': triggers,
    })

# Return spawns: an older room may lack the spawn a region room sends players back to.
# Put it just inside that older room's exit toward the region (src/data/missions.ts / expansion.ts).
import re
def room_json(path, var):
    src = open(os.path.join(ROOT, 'src', 'data', path)).read()
    i = src.index('export const ' + var)
    j = src.index('= ', i) + 2
    return json.JSONDecoder().raw_decode(src[j:])[0]
older = {r['id']: r for r in room_json('expansion.ts', 'EXPANSION_ROOMS') + room_json('missions.ts', 'MISSION_ROOMS')}
patches = []
for r in rooms:
    for e in r['exits']:
        o = older.get(e['to'])
        if not o or e['spawn'] in o['spawns']:
            continue
        ex = next((x for x in o['exits'] if x['to'] == r['id']), None)
        if not ex:
            continue
        x, y, w, h = ex['rect']
        cx, cy = x + w / 2, y + h / 2
        def inpoly(px, py, poly):
            c = False
            for i in range(len(poly)):
                (x1, y1), (x2, y2) = poly[i], poly[i - 1]
                if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
                    c = not c
            return c
        def ok(px, py):
            inside_exit = any(q['rect'][0] <= px <= q['rect'][0] + q['rect'][2] and q['rect'][1] <= py <= q['rect'][1] + q['rect'][3] for q in o['exits'])
            return any(inpoly(px, py, w_) for w_ in o['walk']) and not any(inpoly(px, py, b) for b in o['block']) and not inside_exit
        best = None
        for rad in range(30, 220, 6):  # nearest walkable ring point, outside every exit
            for k in range(36):
                import math
                px, py = cx + rad * math.cos(k * math.pi / 18), cy + rad * math.sin(k * math.pi / 18)
                if ok(px, py):
                    best = (px, py)
                    break
            if best:
                break
        if not best:
            continue
        cx, cy = best
        dx, dy = cx - (x + w / 2), cy - (y + h / 2)
        dr = ('right' if dx > 0 else 'left') if abs(dx) > abs(dy) else ('down' if dy > 0 else 'up')
        patches.append({'room': o['id'], 'name': e['spawn'], 'spawn': {'at': [round(cx), round(cy)], 'dir': dr}})

st = d['story']
lines = lambda arr: [{'speaker': l.get('speaker', ''), 'portrait': l.get('portrait', 'none') or 'none', 'text': l['text']} for l in arr]
npc_dialogue = {}
for n in st['npc_dialogue']:
    info = npc_info.get(n['npc'], {'name': n['npc'].title(), 'portrait': 'innkeeper_portrait'})
    first = []
    for l in n['first']:
        por = l.get('portrait', 'none') or 'none'
        if por == 'none' and l.get('speaker') and l['speaker'] not in ('Kael', ''):
            por = info['portrait']
        first.append({'speaker': l.get('speaker', ''), 'portrait': por, 'text': l['text']})
    npc_dialogue[n['npc']] = {'first': first, 'repeat': n['repeat'], 'name': info['name'], 'portrait': info['portrait']}
story = {
    'room_entries': {e['room']: lines(e['lines']) for e in st['room_entries']},
    'npc_dialogue': npc_dialogue,
    'bosses': {snake(b['creature']): {'before': lines(b['before']), 'after_peace': lines(b['after_peace']), 'after_won': lines(b['after_won'])} for b in st['bosses']},
    'unlock_lines': {u['exit_to']: lines(u['lines']) for u in st['unlock_lines']},
    'map_text_addendum': st['map_text_addendum'],
}
unlocks = [{'exitTo': u['exit_to'], 'requires': u['requires'], 'lockedText': u['locked_text'] if u['requires'] else []} for u in plan['unlocks']]
sheets = sorted({n['sprite'][:-5] for r in rooms for n in r['npcs']})

ts = ('// GENERATED by tools/gen_regions.py: the regions through the old frontiers.\n'
      "import type { RoomDef } from './rooms';\nimport type { RegionStory } from './regionTypes';\n\n"
      f'export const REGION_ROOMS: RoomDef[] = {json.dumps(rooms, indent=1, ensure_ascii=False)};\n\n'
      f'export const REGION_UNLOCKS: {{ exitTo: string; requires: string; lockedText: string[] }}[] = {json.dumps(unlocks, indent=1, ensure_ascii=False)};\n\n'
      f'export const REGION_STORY: RegionStory = {json.dumps(story, indent=1, ensure_ascii=False)};\n\n'
      f'export const REGION_NPC_SHEETS: string[] = {json.dumps(sheets)};\n\n'
      "export const REGION_SPAWN_PATCHES: { room: string; name: string; spawn: { at: [number, number]; dir: 'up' | 'down' | 'left' | 'right' } }[] = "
      + json.dumps(patches) + ';\n')
open(os.path.join(ROOT, 'src', 'data', 'regions.ts'), 'w').write(ts)

kp = os.path.join(ROOT, 'tools', 'dib_kits.json')
kits = json.load(open(kp))
by_id = {k['kit']['id']: k for k in kits['kits']}
bosses = {snake(r['boss']['creature']) for r in plan['rooms'] if r['boss'].get('creature')}
for r in d['kits']:
    k = r['kit']
    k.pop('notes', None)
    k['id'] = snake(k['name'])
    k['wiki']['number'] = str(k['wiki']['number']).lstrip('#').strip().zfill(3)
    k['wiki']['image_url'] = k['wiki']['image_url'].split('/revision')[0]
    if k['id'] in by_id:
        continue
    e = {'kit': k, 'verdict': {'ok': True, 'issues': r.get('issues', [])}, 'role': 'boss' if k['id'] in bosses else 'encounter', 'rooms': []}
    kits['kits'].append(e)
    by_id[k['id']] = e
for r in plan['rooms']:
    for n in r['encounters']:
        e = by_id.get(snake(n))
        if e and e['role'] == 'encounter' and e['kit']['id'] not in LATER and r['id'] not in e['rooms']:
            e['rooms'].append(r['id'])
json.dump(kits, open(kp, 'w'), indent=1)
print(len(rooms), 'rooms;', 'kits', [r['kit']['name'] for r in d['kits']], 'bosses', sorted(bosses), 'unlocks', unlocks)
