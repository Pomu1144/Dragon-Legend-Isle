# usage: blank_capture_cards.py <DIB X_Card.png (wiki, format=original)> <out.png>
"""Remove the printed '100% Chance' and price from the DIB capture cards: rebuild each
panel interior from clean texture columns of the same card, keeping the frame and the
corner ornaments untouched."""
import sys, numpy as np
from PIL import Image
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB')).astype(int)
o = a.copy()
mx, mn = a.max(2), a.min(2)
rng = np.random.default_rng(11)

def rebuild(y0, y1, x0, x1, bad, corner=0, pad=4, band=None):
    b0, b1 = band or (y0, y1)
    badc = bad[b0:b1, x0:x1].any(0)
    badc = ndimage.binary_dilation(badc, iterations=pad)
    pool = [x0 + i for i in range(x1 - x0) if not badc[i]]
    assert len(pool) >= 6, (src, len(pool))
    def orn(sx, y):  # inside a corner ornament of the window frame
        return min(sx - 10 + y - 29, 150 - sx + y - 29, sx - 10 + 126 - y, 150 - sx + 126 - y) < 17
    g = 0
    for x in range(x0, x1):
        if (x - x0) % 3 == 0:
            g = int(rng.integers(len(pool)))
        for y in range(y0, y1):
            d = min(x - x0 + y - y0, x1 - 1 - x + y - y0, x - x0 + y1 - 1 - y, x1 - 1 - x + y1 - 1 - y)
            if d < corner:
                continue
            for t in range(len(pool)):
                sx = pool[(g + (x - x0) % 3 + t) % len(pool)]
                if not orn(sx, y):
                    o[y, x] = a[y, sx]
                    break
            else:
                sx = pool[(g + (x - x0) % 3) % len(pool)]
                o[y, x] = a[y + 18 if y < 77 else y - 18, sx]

white = (mn > 165) & (mx - mn < 60)
rebuild(33, 104, 11, 149, white, corner=14)
# price plate: rebuild the digit band from clean rows above / below it, blending
# top to bottom; the coin columns borrow texture from the clean left part of the plate.
top, bot = list(range(141, 146)), list(range(181, 185))
for y in range(139, 188):
    t = min(1, max(0, (y - 147) / 33))
    st, sb = top[int(rng.integers(len(top)))], bot[int(rng.integers(len(bot)))]
    for x in range(16, 145):
        if min(x - 14, 145 - x) < 4 and (y < 151 or y > 175):
            continue
        sx = x - 58 if 76 <= x < 130 else x
        if y < 147 or y > 180:
            if not (76 <= x < 130) or y < 140 or y > 185:
                continue
            o[y, x] = a[y, sx]
            continue
        o[y, x] = (1 - t) * a[st, sx] + t * a[sb, sx]
Image.fromarray(o.astype(np.uint8)).save(out)
