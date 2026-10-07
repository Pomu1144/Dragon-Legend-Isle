"""Download the four DIB starter hatchlings, their Dragonlings and the DIB world map (unaltered).
usage: fetch_starters.py <workflow_result.json> <public/assets>"""
import json, os, sys, urllib.request
d = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(os.path.join(out, 'starters'), exist_ok=True)
def get(url, path):
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read()
    open(path, 'wb').write(data)
    print(os.path.basename(path), len(data))
for s in d['starters']['starters']:
    get(s['image_url'], os.path.join(out, 'starters', s['id'] + '.png'))
    get(s['evolution']['next_image_url'], os.path.join(out, 'starters', s['id'] + '_evo.png'))
m = (d.get('story') or d.get('research:story'))['items']['map']['world_map_image_url']
if m:
    get(m.split('/revision')[0], os.path.join(out, 'ui', 'world_map.png'))
