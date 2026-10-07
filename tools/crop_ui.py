"""Crop named UI sprites out of the alpha-cleaned sheets.

usage: crop_ui.py <s1_alpha.png> <s2_alpha.png> <outdir>
"""
import os
import sys
import numpy as np
from PIL import Image

s1 = Image.open(sys.argv[1]).convert('RGBA')
s2 = Image.open(sys.argv[2]).convert('RGBA')
out = sys.argv[3]
os.makedirs(out, exist_ok=True)

# name: (sheet, x0, y0, x1, y1) search region; result is tightened to alpha.
S1 = {
    'nameplate_bat': (242, 21, 548, 126),
    'minicard': (1203, 22, 1338, 178),
    'frame_portrait': (233, 229, 488, 498),
    'card_tail': (489, 229, 677, 392),
    'card_outrage': (680, 229, 871, 392),
    'card_flame': (873, 229, 1064, 392),
    'card_unknown': (1066, 229, 1262, 392),
    'frame_corner': (1265, 229, 1504, 498),
    'btn_info': (630, 430, 686, 482),
    'med_mercy': (233, 537, 363, 674),
    'med_monster': (363, 537, 493, 674),
    'med_scroll': (492, 537, 623, 674),
    'med_book': (623, 537, 755, 674),
    'med_bag': (758, 537, 892, 674),
    'med_gear': (892, 537, 1026, 674),
    'fx_tornado': (1061, 543, 1194, 680),
    'fx_sparkle': (1323, 556, 1404, 638),
    'fx_waterring': (1202, 560, 1321, 659),
    'fx_silverring': (1406, 563, 1509, 620),
    'candle_tall': (1317, 655, 1370, 858),
    'candle_double': (1378, 654, 1495, 859),
    'candle_small': (1240, 690, 1291, 846),
    'bar_red': (45, 726, 269, 779),
    'bar_orange': (278, 725, 499, 779),
    'bar_empty': (504, 726, 730, 779),
    'panel_blue': (734, 722, 954, 822),
    'panel_parchment': (962, 723, 1207, 822),
    'btn_pause': (130, 869, 226, 965),
    'btn_play': (254, 878, 326, 958),
    'btn_ff': (350, 878, 462, 956),
    'btn_fff': (486, 879, 598, 954),
    'orb_web': (874, 846, 1014, 988),
    'orb_blood': (1031, 849, 1166, 990),
    'orb_moss': (1182, 854, 1313, 994),
    'soul': (1325, 847, 1470, 994),
    'cursor_diamond': (634, 890, 671, 956),
    'cursor_arrow': (686, 871, 754, 972),
    'btn_x': (762, 886, 842, 969),
}
S2 = {
    'monster_card': (15, 15, 339, 418),
    'panel_page': (1286, 30, 1526, 184),
    'plaque_monsters': (1267, 256, 1527, 354),
    'btn_hex': (1291, 398, 1507, 476),
    'arrow_up': (1340, 497, 1443, 566),
    'arrow_down': (1340, 643, 1444, 712),
    'banner_header': (700, 836, 1076, 1005),
    'tag_blue': (1338, 860, 1520, 960),
    'crown': (16, 880, 164, 997),
    'slot_round': (173, 894, 276, 997),
    'chain': (286, 894, 353, 965),
    'chip_blue': (349, 916, 493, 993),
    'star': (509, 916, 578, 984),
    'panel_green': (1080, 893, 1333, 994),
}


def tight_save(img, name, box):
    reg = img.crop(box)
    a = np.array(reg)[..., 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        print('EMPTY', name)
        return
    t = reg.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    t.save(os.path.join(out, name + '.png'))
    print(name, t.size)


for k, b in S1.items():
    tight_save(s1, k, b)
for k, b in S2.items():
    tight_save(s2, k, b)

# tab column on sheet 2: split by row gaps
reg = s2.crop((1037, 35, 1260, 705))
a = np.array(reg)[..., 3] > 200
rows = a.sum(axis=1) > 3
runs, inr = [], False
for i, v in enumerate(rows):
    if v and not inr:
        st, inr = i, True
    if not v and inr:
        runs.append((st, i))
        inr = False
if inr:
    runs.append((st, len(rows)))
names = ['tab_quests', 'tab_trophy', 'tab_crest', 'tab_party', 'tab_bestiary', 'tab_world']
print('tab runs', runs)
for n, (y0, y1) in zip(names, [r for r in runs if r[1] - r[0] > 40]):
    tight_save(s2, n, (1037, 35 + y0, 1260, 35 + y1))
