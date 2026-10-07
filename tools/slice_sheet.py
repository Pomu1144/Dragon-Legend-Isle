"""Slice an AI-generated character grid into normalized, foot-aligned frames.

usage: slice_sheet.py <sheet.png> <rows> <cols> <cell_w> <cell_h> <out.png> [contact.png]
Frames are placed on a uniform grid; each figure is scaled by one global factor
(so relative size is preserved) and bottom-centred on a common baseline.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, rows, cols, cw, ch, outp = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
im = Image.open(src).convert('RGBA')
A = np.array(im)
alpha = A[..., 3]
W, H = im.size
mask = alpha > 24
lab, n = ndi.label(ndi.binary_dilation(mask, iterations=6))
objs = ndi.find_objects(lab)
sizes = ndi.sum(mask, lab, range(1, n + 1))
cells = {}
for i, sl in enumerate(objs):
    if sizes[i] < 2000:
        continue
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    r, c = int(cy / (H / rows)), int(cx / (W / cols))
    key = (r, c)
    # merge fragments that fall in the same grid cell
    if key in cells:
        a0, b0, a1, b1 = cells[key]
        cells[key] = (min(a0, x0), min(b0, y0), max(a1, x1), max(b1, y1))
    else:
        cells[key] = (x0, y0, x1, y1)
missing = [(r, c) for r in range(rows) for c in range(cols) if (r, c) not in cells]
if missing:
    print('missing cells', missing)
maxh = max(b[3] - b[1] for b in cells.values())
maxw = max(b[2] - b[0] for b in cells.values())
pad = 4
scale = min((ch - pad * 2) / maxh, (cw - pad * 2) / maxw)
print('scale', scale, 'max', maxw, maxh)
sheet = Image.new('RGBA', (cw * cols, ch * rows), (0, 0, 0, 0))
for (r, c), (x0, y0, x1, y1) in cells.items():
    # keep only this cell's figure pixels
    crop = im.crop((x0, y0, x1, y1))
    sub = lab[y0:y1, x0:x1]
    ids = [v for v in np.unique(sub) if v]
    keep = np.isin(sub, ids)
    ca = np.array(crop)
    ca[..., 3] = np.where(keep, ca[..., 3], 0)
    crop = Image.fromarray(ca)
    w, h = crop.size
    crop = crop.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    ox = c * cw + (cw - crop.width) // 2
    oy = r * ch + ch - pad - crop.height
    sheet.alpha_composite(crop, (ox, oy))
sheet.save(outp)
if len(sys.argv) > 7:
    bg = Image.new('RGBA', sheet.size, (40, 40, 60, 255))
    bg.alpha_composite(sheet)
    from PIL import ImageDraw
    d = ImageDraw.Draw(bg)
    for r in range(rows):
        d.line([(0, r * ch + ch - pad), (sheet.width, r * ch + ch - pad)], fill=(255, 0, 0))
    bg.convert('RGB').save(sys.argv[7])
print('ok', sheet.size)
