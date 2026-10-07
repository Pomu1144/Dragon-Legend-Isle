# Dragon Legend Isle

An Undertale-style RPG set in Azurelake, using the creatures of **Dragon Island Blue**.

```bash
npm install
npm run dev      # play at the printed URL
npm run build    # typecheck + production build
```

**Controls:** arrows/WASD move · Z/Enter confirm · X/Shift cancel (hold to run, or to slow the soul) · C/Esc menu · F3 collision overlay.

Debug URLs: `?room=forest`, `?battle=orochi&room=waystone`.

## What's in it

- **Overworld:** six rooms built on the Azurelake night paintings (plaza → west gate → outskirts → forest → Mosswood → Waystone fork). Each room has walkable-area polygons, perspective scaling, lamp lighting, candle save points and random encounters.
- **Battles:** FIGHT, ACT, ITEM and MERCY. FIGHT uses the skill cards from the UI sheet plus a timing bar. Each enemy turn is a bullet-board dodge driven by that creature's real DIB ability and its TU (time-unit) cost. Ability effects carry over: Confusion reverses your controls, Venom poisons you over time, Feed-type moves heal the attacker.
- **UI:** every frame, bar, medallion, card, tab and FX sprite is cut from the supplied UI sheets.
- **Creatures:** exact Dragon Island Blue creatures with their original sprites, numbers, stars, elements, abilities and TU costs, verified against the DIB wiki. Bat Fiend, Blood Priest, Bones, Dark Priest, Scale Knight and Devil Worm are encounters. Lich is the mini-boss, Orochi (the Overlord of Norwoods) is the final boss, and Divine appears in the ending.

## Asset pipeline (`tools/`)

- `segment.py` / `crop_ui.py`: cut the UI sheets into transparent sprites.
- `slice_sheet.py`: normalise the hero/NPC walk sheets into foot-aligned frames.
- `build_assets.py`: build `public/assets` (rooms, UI, characters, logo).
- `fetch_dib_sprites.py`: download the original DIB sprites, unaltered.
- `gen_creatures.py` + `dib_kits.json`: generate `src/data/dibCreatures.ts` from the wiki-verified creature kits.

Creature art and data belong to the creators of Dragon Island Blue; this is a fan project.
