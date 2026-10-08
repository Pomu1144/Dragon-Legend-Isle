"""Download the original Dragon Island Blue creature sprites (unaltered) from the DIB wiki.
usage: fetch_dib_sprites.py <kits.json> <out_dir>"""
import json, sys, urllib.request, os
kits = json.load(open(sys.argv[1]))['kits']
os.makedirs(sys.argv[2], exist_ok=True)
for k in kits:
    kit = k['kit']
    if kit['id'] == 'divine' or kit.get('original') or not kit['wiki'].get('image_url'):
        continue  # the user's own art is used instead (Divine, Bloodgale)
    url = kit['wiki']['image_url'].split('/revision')[0] + '/revision/latest?format=original'  # the CDN re-encodes to WebP otherwise
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read()
    open(os.path.join(sys.argv[2], kit['id'] + '.png'), 'wb').write(data)
    print(kit['id'], len(data), url)
