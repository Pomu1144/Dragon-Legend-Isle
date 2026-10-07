"""Build runtime game assets from source art.

Usage:
    python3 tools/build_assets.py --ui <ui_out_dir> --gen <generated_dir> \
        --scenes <azurelake scenes/final dir> --divine <divine.png> --out public/assets

Inputs
  ui_out_dir   named UI sprites cut from the two UI reference sheets
  generated_dir  g0..g9 PNGs (hero sheet, monsters, portraits, logo, NPC sheet)
  scenes       Azurelake night scene paintings used as overworld rooms
"""
import argparse
import os
import shutil
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))


def clean_specks(img: Image.Image, frac: float = 0.01) -> Image.Image:
    """Drop disconnected alpha islands smaller than frac of the largest island."""
    a = np.array(img)
    mask = a[..., 3] > 8
    lab, n = ndi.label(mask)
    if n <= 1:
        return img
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= sizes.max() * frac
    a[..., 3] = np.where(keep[lab] | ~mask, a[..., 3], 0)
    out = Image.fromarray(a)
    bb = out.getbbox()
    return out.crop(bb) if bb else out


def erase_text(img: Image.Image, box_frac=(0.12, 0.12, 0.88, 0.88), dark=110) -> Image.Image:
    """Inpaint dark lettering inside the inner area of a parchment panel."""
    a = np.array(img)
    h, w = a.shape[:2]
    x0, y0, x1, y1 = int(w * box_frac[0]), int(h * box_frac[1]), int(w * box_frac[2]), int(h * box_frac[3])
    rgb = np.ascontiguousarray(a[..., :3])
    mask = np.zeros((h, w), np.uint8)
    region = rgb[y0:y1, x0:x1].astype(int).sum(axis=2) < dark * 3
    mask[y0:y1, x0:x1] = region.astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
    fixed = cv2.inpaint(rgb, mask, 7, cv2.INPAINT_TELEA)
    a[..., :3] = fixed
    return Image.fromarray(a)


def fit(img: Image.Image, max_side: int) -> Image.Image:
    img = img.copy()
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return img


def save_webp(img: Image.Image, path: str, q: int = 90):
    img.save(path, 'WEBP', quality=q, method=6)


def luminance_alpha(img: Image.Image) -> Image.Image:
    """Turn art painted on black into straight alpha (for the Divine sprite)."""
    a = np.array(img.convert('RGB')).astype(np.float32)
    mx = a.max(axis=2)
    alpha = np.clip((mx - 16) / 70.0, 0, 1)
    rgb = np.where(alpha[..., None] > 0, np.clip(a / np.maximum(alpha[..., None], 1e-3), 0, 255), 0)
    rgb = np.minimum(rgb, 255)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    return im.crop(im.getbbox())


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--ui', required=True)
    p.add_argument('--gen', required=True)
    p.add_argument('--scenes', required=True)
    p.add_argument('--divine', required=True)
    p.add_argument('--out', required=True)
    args = p.parse_args()
    out = args.out
    for d in ('ui', 'bg', 'chars', 'monsters'):
        os.makedirs(os.path.join(out, d), exist_ok=True)

    # UI sprites ------------------------------------------------------------
    for f in sorted(os.listdir(args.ui)):
        if not f.endswith('.png'):
            continue
        name = f[:-4]
        im = Image.open(os.path.join(args.ui, f)).convert('RGBA')
        if name.startswith(('card_', 'candle_', 'frame_', 'fx_', 'orb_', 'med_', 'soul')):
            im = clean_specks(im)
        if name.startswith('card_'):
            a = np.array(im)[..., 3] > 128
            rows = np.where(a.sum(axis=1) > a.shape[1] * 0.5)[0]
            im = im.crop((0, rows.min(), im.width, rows.max() + 1))
        if name == 'panel_page':
            im = erase_text(im)
        im.save(os.path.join(out, 'ui', f), optimize=True)
        if name == 'monster_card':
            # The card art has two stars painted in; ship a blank copy so each card can show the creature's real rating.
            arr = np.array(im)
            arr[273:297, 132:186] = arr[273:297, 196:250]  # patch with the neighbouring green panel texture
            Image.fromarray(arr).save(os.path.join(out, 'ui', 'monster_card_blank.png'), optimize=True)

    # Rooms -------------------------------------------------------------------
    rooms = {
        'plaza': 'azurelake__spawn-plaza__scene__background__night.png',
        'gate': 'azurelake__west-gate-bridge__scene__background__night.png',
        'outskirts': 'azurelake__western-outskirts__scene__road__night.png',
        'forest': 'azurelake__western-forest__scene__entrance__night.png',
        'mosswood': 'azurelake__western-forest__scene__mosswood-trail__night.png',
        'waystone': 'azurelake__western-forest__scene__waystone-fork__night.png',
        'gate_talk': 'azurelake__west-gate-bridge__scene__dialogue-background__night.png',
    }
    for key, fn in rooms.items():
        im = Image.open(os.path.join(args.scenes, fn)).convert('RGB')
        im.save(os.path.join(out, 'bg', key + '.jpg'), 'JPEG', quality=88, optimize=True, progressive=True)

    g = lambda i: Image.open(os.path.join(args.gen, f'g{i}.png')).convert('RGBA')

    # Hero walk sheet: 4 rows (down, left, right, up) x 4 frames, 128x176 cells
    subprocess.check_call([sys.executable, '-I', os.path.join(HERE, 'slice_sheet.py'),
                           os.path.join(args.gen, 'g0.png'), '4', '4', '128', '176',
                           os.path.join(out, 'chars', 'hero_walk.png')])
    # NPC sheet: 1 row x 3 frames, same cell size and scale family
    subprocess.check_call([sys.executable, '-I', os.path.join(HERE, 'slice_sheet.py'),
                           os.path.join(args.gen, 'g9.png'), '1', '3', '128', '176',
                           os.path.join(out, 'chars', 'wren_idle.png')])

    # Guild master: idle sheet (1x3) and portrait
    subprocess.check_call([sys.executable, '-I', os.path.join(HERE, 'slice_sheet.py'),
                           os.path.join(args.gen, 'gm_sheet.png'), '1', '3', '128', '176',
                           os.path.join(out, 'chars', 'guildmaster_idle.png')])
    gm = Image.open(os.path.join(args.gen, 'gm_portrait.png')).convert('RGBA')
    save_webp(fit(gm.crop(gm.getbbox()), 640), os.path.join(out, 'chars', 'guildmaster_portrait.webp'))
    save_webp(fit(g(8).crop(g(8).getbbox()), 640), os.path.join(out, 'chars', 'hero_portrait.webp'))
    save_webp(fit(g(6).crop(g(6).getbbox()), 640), os.path.join(out, 'chars', 'wren_portrait.webp'))
    save_webp(fit(g(7).crop(g(7).getbbox()), 1400), os.path.join(out, 'ui', 'logo.webp'))

    # Creatures are the original Dragon Island Blue sprites (tools/fetch_dib_sprites.py), never generated.
    save_webp(fit(luminance_alpha(Image.open(args.divine)), 900), os.path.join(out, 'monsters', 'divine.webp'))
    print('assets built ->', out)


if __name__ == '__main__':
    main()
