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
- **Story:** Kael's sister Lira and brother Tobin have been taken by the Ashen Stranger, who beat three Celestial Rank Hunters before fleeing west. Master Halvard tries to stop Kael, then lets him pick one of the four DIB hatchlings and gives him the Tamer's Manual, the Translation Guide and a Map. The map uses the real DIB world map. All three can be read from the Satchel (C menu).
- **Companion:** the chosen hatchling follows Kael and fights with its real DIB abilities. At LV 6 it evolves into its Dragonling, as in DIB, and gains new cards. Sparing a creature gives bond EXP.
- **The world past the Waystone (open-ended, no ending):** after Orochi, two roads open. The north road leads into Norwoods: the Scorched Road, Serpent's Hollow and the Roots of the Giant Mangal, with the first floor of the Giant Mangal dungeon. The east road leads through the Forest of Mangal (East Road, Crossroads, Abandoned Site) into the Safaris (Western Grassland, River House) and the town of Dundean (Well Square, Valley Gate). Region and creature placement follow the DIB wiki. Some roads still lead on, toward Giant Mangal's upper floors, Ringfeld and the valley to South Earlsome and Longdale; they are barred for now, as the next stretch of the hunt.
- **Dundean missions:** Brann asks Kael to break a blood rite in the old graveyard past the east gate: 14 Blood Priests, 3 Blood Warriors, then the Blood Rogue at the altar. Old Edda asks him to break up the Cult Priests on Wind Hill, across the river by rowboat: Cult Priests, Cult Warriors and their Cult Rogue. Each group is fought as a wave, one foe after another. Each mission gives half of a torn page. Joined, they become the Rogue Formula: Blood Rogue + Cult Rogue = **Bloodgale**, an original creature from the user's art. Capture both rogues to perform it. Missions are tracked in the Quests tab. The valley road to Longdale continues past the graveyard as the next frontier.
- **Through the old frontiers:** Giant Mangal's second and third floors (the floor-3 Waypoint is a rest point). The Ringfeld road, the keepers' shelter and the shore road toward the Lighthouse. The South Earlsome valley, the dragon's pass (Apalala, the region's Dragon Overlord) and Longdale. Each branch ends at a new barred road for later. The valley pass opens after the blood rite, and the Giant Mangal stair after the cult.
- **Shop:** the quartermaster at the Dundean hunters' lodge sells Capture Cards, Silver Cards and tonics.
- **Creatures:** 61 exact Dragon Island Blue creatures plus the 4 starter hatchlings. Each uses its original sprite and real number, stars, element, abilities and TU, verified against the DIB wiki. Lich is the Mosswood mini-boss and Orochi guards the Waystone.
- **The western forest, by depth:** the entrance holds Bitewings, Goblins, Sludges and Bat Squirrels, with a very rare Snow Cub or Fire Cub (about 1% each). Giant Wasps appear deeper in and take over Mosswood. Giant Ants hold the north of Mosswood and the Waystone Fork. Other regions use each creature's DIB location data.
- **Capturing:** DIB's three capture cards: Capture Card, Silver Card and Gold Card (guaranteed). Use them from MERCY > Capture. Each card shows its live capture chance, as on the DIB card face. As in DIB, the more damaged a monster is, the higher the chance. Higher-star creatures, rare sightings and guardians resist more, and Dragon Overlords cannot be captured. Cards you lack can be bought mid-fight.

## Asset pipeline (`tools/`)

- `segment.py` / `crop_ui.py`: cut the UI sheets into transparent sprites.
- `slice_sheet.py`: normalise the hero/NPC walk sheets into foot-aligned frames.
- `build_assets.py`: build `public/assets` (rooms, UI, characters, logo).
- `fetch_dib_sprites.py`: download the original DIB sprites, unaltered.
- `gen_creatures.py` + `dib_kits.json`: generate `src/data/dibCreatures.ts` from the wiki-verified creature kits.
- `gen_missions.py`: generates `src/data/missions.ts` from the missions workflow output.
- `blank_capture_cards.py`: removes the printed chance and price from DIB's capture-card art so the game can draw the live chance on it.
- `fetch_starters.py` / `gen_story.py`: download the starter hatchlings and Dragonlings plus the world map, and generate `src/data/story.ts` and `starters.ts`.

Creature art and data belong to the creators of Dragon Island Blue; this is a fan project.

## Spoiler warning

The story is meant to be discovered by playing. Everything under `tools/story/` and the story data in
`src/data/` (`story.ts`, `expansion.ts`, `missions.ts`, `regions.ts`, `landmarkText.ts`) contains the plot,
and `tools/story/BIBLE.SPOILERS.json` explains all of it. `tools/apply_story.py` re-applies the story text
after any generator re-runs.
