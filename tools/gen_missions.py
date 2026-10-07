"""Turn the missions workflow output (graveyard blood rite + wind priests' cult) into game data.

usage: gen_missions.py <missions_result.json> <expansion_result.json>

Writes src/data/missions.ts, copies the painted rooms into public/assets/bg, and merges the
new creature kits (Blood Warrior, Blood Rogue, Cult Rogue) and room encounters into
tools/dib_kits.json. The expansion result is read to find which existing exit an entrance
replaces (e.g. Dundean's barred valley gate).
"""
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(sys.argv[1]))
exp = json.load(open(sys.argv[2]))
plan = d['plan']
plans = {r['id']: r for r in plan['rooms']}
camel = lambda s: ''.join(w[:1].upper() + w[1:] for w in s.split('_'))
snake = lambda n: n.lower().replace(' ', '_')
LATER = {'dark_mage', 'dark_priest'}

def color(h):
    try:
        return int(h.replace('#', ''), 16)
    except Exception:
        return 0xFFB35A

mission_of_room = {r['id']: r['mission'] for r in plan['rooms']}
fight_mission = {}
for f in plan['fights']:
    m = mission_of_room.get(f['room'])
    if m not in ('blood', 'wind'):
        m = 'blood' if any('Blood' in x['name'] for x in f['foes']) else 'wind'
    fight_mission[f['id']] = m

rooms = []
for rd in d['rooms']:
    rid = rd['id']
    p = plans.get(rid, {})
    shutil.copy(rd['image_path'], os.path.join(ROOT, 'public', 'assets', 'bg', rid + '.jpg'))
    exits = []
    for e in rd['exits']:
        ex = {'rect': [round(e['x']), round(e['y']), round(e['w']), round(e['h'])], 'to': e['to'], 'spawn': e['spawn']}
        if e.get('locked_text'):
            ex['locked'] = 'never'  # the frontier: opens in a future chapter
            ex['lockedText'] = e['locked_text']
        exits.append(ex)
    triggers = []
    for t in rd.get('triggers', []):
        fid = t['id']
        triggers.append({'id': 'm:' + fid, 'rect': [round(t['x']), round(t['y']), round(t['w']), round(t['h'])],
                         'once': 'fight_' + fid, 'requires': 'quest_' + fight_mission.get(fid, 'blood')})
    rooms.append({
        'id': rid,
        'name': p.get('name', rid),
        'bg': 'bg_' + rid,
        'size': [round(v) for v in rd['size']],
        'walk': [[[round(x), round(y)] for x, y in poly] for poly in rd['walk']],
        'block': [[[round(x), round(y)] for x, y in poly] for poly in rd['block']],
        'spawns': {s['name']: {'at': [round(s['x']), round(s['y'])], 'dir': s['dir']} for s in rd['spawns']},
        'exits': exits,
        'scale': rd['scale'][:2],
        'music': p.get('music', 'forest'),
        'fireflies': 18,
        'npcs': [],
        'things': [{'id': t['id'], 'at': [round(t['x']), round(t['y'])], 'r': round(t['r']), 'lines': t['lines']} for t in rd['things']],
        'candles': [{'id': rid, 'at': [round(rd['candle'][0]), round(rd['candle'][1])], 'kind': 'candle_tall'}] if rd.get('candle') else [],
        'lights': [{'at': [round(l['x']), round(l['y'])], 'r': round(l['r']), 'color': color(l['color']), 'flicker': bool(l['flicker'])} for l in rd['lights']],
        'triggers': triggers,
    })

# Entrances: new exits in rooms that already exist.
old_exits = {r['id']: r['exits'] for r in exp['rooms']}
def overlap(a, b):
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]
entrances = []
for e in plan['entrances']:
    rect = [round(e['x']), round(e['y']), round(e['w']), round(e['h'])]
    m = mission_of_room.get(e['to'], 'blood')
    ex = {'rect': rect, 'to': e['to'], 'spawn': 'from' + camel(e['existing_room'])}
    if e.get('locked_until'):
        ex['locked'] = 'quest_' + m  # opened when the mission is given
        if e.get('locked_text'):
            ex['lockedText'] = e['locked_text']
    replaces = None
    for oe in old_exits.get(e['existing_room'], []):
        if overlap(rect, [oe['x'], oe['y'], oe['w'], oe['h']]) and oe['to'] != e['to']:
            replaces = oe['to']
    sb = e['spawn_back']
    entrances.append({'room': e['existing_room'], 'exit': ex, 'spawnName': 'from' + camel(e['to']),
                      'spawn': {'at': [round(sb['x']), round(sb['y'])], 'dir': sb['dir']}, **({'replaces': replaces} if replaces else {})})

st = d['story']
lines = lambda arr: [{'speaker': l.get('speaker', ''), 'portrait': l.get('portrait', 'none') or 'none', 'text': l['text']} for l in arr]
sfights = {f['id']: f for f in st['fights']}
fights = []
for f in plan['fights']:
    foes = [snake(x['name']) for x in f['foes'] for _ in range(int(x['count']))]
    sf = sfights.get(f['id'], {'before': [], 'between': [], 'after': []})
    fights.append({'id': f['id'], 'mission': fight_mission[f['id']], 'room': f['room'], 'foes': foes,
                   'before': lines(sf['before']), 'between': sf['between'], 'after': lines(sf['after'])})
frag = lambda k, item: {'item': item, 'item_name': st[k]['item_name'], 'desc': st[k]['desc'], 'found': lines(st[k]['found']), 'page': st[k]['page']}
missions = {
    'fights': fights,
    'giver': {'blood': 'brann', 'wind': 'edda'},
    'offer': {'blood': lines(st['brann_offer']), 'wind': lines(st['edda_offer'])},
    'waiting': {'blood': st['brann_waiting'], 'wind': st['edda_waiting']},
    'done': {'blood': lines(st['brann_done']), 'wind': lines(st['edda_done'])},
    'fragments': {'blood': frag('fragment_blood', 'fragment_blood'), 'wind': frag('fragment_wind', 'fragment_wind')},
    'formula': {'item': 'rogue_formula', 'item_name': st['formula']['item_name'], 'desc': st['formula']['desc'],
                'joined': lines(st['formula']['joined']), 'page': st['formula']['page']},
    'quests': st['quests'],
    'room_entries': {e['room']: lines(e['lines']) for e in st['room_entries']},
}

ts = ('// GENERATED by tools/gen_missions.py: the Dundean missions (graveyard blood rite, wind priests\' cult).\n'
      "import type { RoomDef } from './rooms';\nimport type { MissionData } from './missionTypes';\n\n"
      f'export const MISSION_ROOMS: RoomDef[] = {json.dumps(rooms, indent=1, ensure_ascii=False)};\n\n'
      "export const MISSION_ENTRANCES: { room: string; exit: RoomDef['exits'][number]; spawnName: string; spawn: { at: [number, number]; dir: 'up' | 'down' | 'left' | 'right' }; replaces?: string }[] = "
      + json.dumps(entrances, indent=1, ensure_ascii=False) + ';\n\n'
      'export const MISSIONS: MissionData | null = ' + json.dumps(missions, indent=1, ensure_ascii=False) + ';\n')
open(os.path.join(ROOT, 'src', 'data', 'missions.ts'), 'w').write(ts)

# Creatures: the three new kits; the rogues lead their groups (mini-bosses).
kp = os.path.join(ROOT, 'tools', 'dib_kits.json')
kits = json.load(open(kp))
by_id = {k['kit']['id']: k for k in kits['kits']}
for r in d['kits']:
    k = r['kit']
    k.pop('notes', None)
    k['id'] = snake(k['name'])
    k['wiki']['number'] = str(k['wiki']['number']).lstrip('#').strip().zfill(3)
    k['wiki']['image_url'] = k['wiki']['image_url'].split('/revision')[0]
    if k['id'] in by_id:
        continue
    role = 'miniboss' if k['id'] in ('blood_rogue', 'cult_rogue') else 'encounter'
    e = {'kit': k, 'verdict': {'ok': True, 'issues': r.get('issues', [])}, 'role': role, 'rooms': []}
    kits['kits'].append(e)
    by_id[k['id']] = e
for r in plan['rooms']:
    for n in r['encounters']:
        e = by_id.get(snake(n))
        if e and e['role'] == 'encounter' and e['kit']['id'] not in LATER and r['id'] not in e['rooms']:
            e['rooms'].append(r['id'])
json.dump(kits, open(kp, 'w'), indent=1)
print(len(rooms), 'rooms;', len(fights), 'fights;', len(entrances), 'entrances;', 'kits', [r['kit']['name'] for r in d['kits']])
for f in fights:
    print(' ', f['id'], f['mission'], f['room'], len(f['foes']), 'foes')
