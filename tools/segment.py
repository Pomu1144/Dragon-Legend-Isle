"""Segment a UI sheet into components and write a labelled contact image.

usage: segment.py <sheet> <out_prefix> [white]
"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

src, prefix = sys.argv[1], sys.argv[2]
white = len(sys.argv) > 3
im = Image.open(src).convert('RGBA')
a = np.array(im).astype(np.float32)
rgb = a[..., :3]

if white:
    # background = near-white region connected to border
    near = (rgb.min(axis=2) > 225)
    lab, n = ndi.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # unblend from white for bg-region pixels to keep soft edges
    mn = rgb.min(axis=2)
    alpha = np.where(bg, np.clip((255 - mn) / 255 * 3.0, 0, 1), 1.0)
    # pure-ish white -> 0
    alpha[bg & (mn > 247)] = 0
    out = a.copy()
    safe = np.maximum(alpha, 1e-3)[..., None]
    un = (rgb - (1 - alpha[..., None]) * 255) / safe
    out[..., :3] = np.where(bg[..., None], np.clip(un, 0, 255), rgb)
    out[..., 3] = alpha * 255
    a = out
fg = a[..., 3] > 20
fg = ndi.binary_dilation(fg, iterations=2)
lab, n = ndi.label(fg)
objs = ndi.find_objects(lab)
boxes = []
for i, sl in enumerate(objs):
    y0, y1 = sl[0].start, sl[0].stop
    x0, x1 = sl[1].start, sl[1].stop
    if (x1 - x0) * (y1 - y0) < 150:
        continue
    boxes.append((x0, y0, x1, y1))
boxes.sort(key=lambda b: (b[1] // 40, b[0]))
Image.fromarray(a.astype(np.uint8)).save(prefix + '_alpha.png')
vis = Image.new('RGB', im.size, (60, 60, 60))
vis.paste(Image.fromarray(a.astype(np.uint8)), (0, 0), Image.fromarray(a.astype(np.uint8)))
d = ImageDraw.Draw(vis)
for i, (x0, y0, x1, y1) in enumerate(boxes):
    d.rectangle([x0, y0, x1, y1], outline=(255, 0, 255))
    d.text((x0 + 2, y0 + 2), str(i), fill=(0, 255, 0))
vis.save(prefix + '_boxes.png')
with open(prefix + '_boxes.txt', 'w') as f:
    for i, b in enumerate(boxes):
        f.write(f'{i} {b[0]} {b[1]} {b[2]} {b[3]} {b[2]-b[0]}x{b[3]-b[1]}\n')
print(len(boxes))
