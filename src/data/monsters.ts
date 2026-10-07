// Monster roster. Names and the Divine come from Dragon Island Blue; the
// battle model is Undertale's: talk (ACT) until they can be spared, or fight.

export interface Act {
  name: string;
  text: string[];
  mercy: number; // mercy points gained (100 = can be spared)
  once?: boolean; // only counts the first time
  calm?: number; // shortens the next attack (seconds)
  heal?: number;
}

export interface AttackDef {
  ability: string; // real DIB ability name
  tu: number; // real DIB Time Units
  pattern: string;
  projectile: string;
  tint?: string;
  twist: string;
  box?: [number, number];
  intensity?: number;
  flavor?: string;
}

export interface MonsterDef {
  attacks?: AttackDef[];
  faces?: 'left' | 'right' | 'front';
  id: string;
  name: string;
  color: string;
  art: string;
  height: number; // on-screen height in battle
  hp: number;
  atk: number;
  def: number;
  exp: number;
  gold: number;
  stars: number;
  affinity: string;
  boss?: boolean;
  music: string;
  bindChance: number;
  check: string;
  intro: string;
  idle: string[];
  talk: string[]; // speech bubble lines, cycled each turn
  spareText: string;
  acts: Act[];
  patterns: string[];
  lore: string;
}

export const MONSTERS: Record<string, MonsterDef> = {
  bat_fiend: {
    id: 'bat_fiend',
    name: 'Bat Fiend',
    color: '#8f8cff',
    art: 'mon_bat_fiend',
    height: 300,
    hp: 30,
    atk: 4,
    def: 0,
    exp: 6,
    gold: 8,
    stars: 1,
    affinity: 'Shadow',
    music: 'battle',
    bindChance: 0.7,
    check: 'BAT FIEND — ATK 4 DEF 0\n* Hangs upside down to think. Thinks about snacks.',
    intro: '* Bat Fiend swoops down from the dark!',
    idle: ['* Bat Fiend flaps menacingly. Mostly flaps.', '* Bat Fiend is counting your fingers. For fun.', '* The air smells like night-blooming fruit.'],
    talk: ['Skree!', 'Your hair looks\nchewable.', 'I am VERY\nscary. Right?', 'Do you have\n... figs?'],
    spareText: '* Bat Fiend does a little loop and flutters off, humming.',
    acts: [
      { name: 'Check', text: [], mercy: 0 },
      { name: 'Hum', text: ['* You hum the lullaby Wren taught you.', '* Bat Fiend\'s eyelids droop. It sways along.'], mercy: 55, once: true, calm: 1.5 },
      { name: 'Offer Fig', text: ['* You offer a dried fig from your satchel.', '* Bat Fiend inhales it. It looks at you with new respect.'], mercy: 60, once: true },
      { name: 'Flap Arms', text: ['* You flap your arms with conviction.', '* Bat Fiend is not sure if you are a threat or a friend.', '* It decides: friend.'], mercy: 35 },
    ],
    patterns: ['bat_rings', 'bat_swoop', 'bat_sparkle'],
    lore: 'Night-loving fiends that roost under the West Gate. Harmless unless you have fruit. Then, extremely harmful to the fruit.',
  },
  bones: {
    id: 'bones',
    name: 'Bones',
    color: '#6fe07a',
    art: 'mon_bones',
    height: 330,
    hp: 44,
    atk: 5,
    def: 1,
    exp: 9,
    gold: 11,
    stars: 1,
    affinity: 'Undead',
    music: 'battle',
    bindChance: 0.6,
    check: 'BONES — ATK 5 DEF 1\n* Has been guarding this road since before the road.',
    intro: '* Bones rattles out of the moss!',
    idle: ['* Bones creaks. A mushroom falls off its shoulder.', '* Bones is trying very hard to look intimidating.', '* Somewhere, a stick lies unthrown.'],
    talk: ['RATTLE.', 'I was a knight\nonce. I think.', 'My posture is\nimmaculate.', 'Is that... a\nstick?'],
    spareText: '* Bones bows with a clatter and wanders off to guard something else.',
    acts: [
      { name: 'Check', text: [], mercy: 0 },
      { name: 'Compliment', text: ['* You tell Bones its posture is immaculate.', '* Bones stands even straighter. Something pops.'], mercy: 45, once: true },
      { name: 'Play Fetch', text: ['* You throw a stick down the trail.', '* Bones sprints after it, then remembers it is a skeleton knight.', '* It brings the stick back anyway.'], mercy: 60, once: true, calm: 2 },
      { name: 'Rattle', text: ['* You rattle your satchel buckles at Bones.', '* Bones rattles back. You are having a conversation.'], mercy: 30 },
    ],
    patterns: ['bones_bounce', 'bones_webs', 'bones_spiral'],
    lore: 'Moss-cloaked guardians of the Western Forest. They have forgotten what they guard, but they guard it with great enthusiasm.',
  },
  blood_priest: {
    id: 'blood_priest',
    name: 'Blood Priest',
    color: '#ff6b6b',
    art: 'mon_blood_priest',
    height: 360,
    hp: 58,
    atk: 6,
    def: 2,
    exp: 14,
    gold: 18,
    stars: 2,
    affinity: 'Infernal',
    music: 'battle',
    bindChance: 0.45,
    check: 'BLOOD PRIEST — ATK 6 DEF 2\n* Preaches the Sermon of the Endless Night. Nobody has stayed till the end.',
    intro: '* Blood Priest glides from the trees, censer swinging.',
    idle: ['* Blood Priest intones a verse. It rhymes, badly.', '* Red mist curls around your ankles.', '* The censer smells like cinnamon. Unsettling.'],
    talk: ['Kneel, child\nof the tide.', 'The Night\nwill have\nits sermon.', 'Chapter\nfour hundred...', '...you\'re still\nlistening?'],
    spareText: '* Blood Priest closes its book, deeply moved, and drifts away to write chapter one thousand.',
    acts: [
      { name: 'Check', text: [], mercy: 0 },
      { name: 'Listen', text: ['* You listen to the sermon. All of it.', '* Blood Priest has never had an audience this patient.'], mercy: 40, calm: 1 },
      { name: 'Pray', text: ['* You fold your hands and pray for a short sermon.', '* Blood Priest seems touched. And a little offended.'], mercy: 30 },
      { name: 'Clap', text: ['* You applaud enthusiastically.', '* Blood Priest bows. The mask almost smiles.'], mercy: 45, once: true },
    ],
    patterns: ['priest_orbit', 'priest_rain', 'priest_homing'],
    lore: 'Cultists of the Endless Night who wandered west when the Waystone dimmed. They only want someone to listen.',
  },
  nocturne: {
    id: 'nocturne',
    name: 'Nocturne',
    color: '#9fd8ff',
    art: 'mon_nocturne',
    height: 330,
    hp: 80,
    atk: 7,
    def: 3,
    exp: 30,
    gold: 40,
    stars: 2,
    affinity: 'Shadow',
    boss: true,
    music: 'boss',
    bindChance: 0.3,
    check: 'NOCTURNE — ATK 7 DEF 3\n* An assassin made of night. Afraid of being seen.',
    intro: '* Nocturne drops from the canopy without a sound!',
    idle: ['* Nocturne flickers between shadows.', '* Stars glitter inside Nocturne\'s smoke.', '* Nocturne watches the Waystone road. It looks... lonely.'],
    talk: ['Turn back,\nlittle tamer.', 'The Drake\nsleeps. Let\nit sleep.', 'You... see\nme?', 'Nobody ever\nsees me.'],
    spareText: '* Nocturne bows once, and melts into the starlight. You feel watched over.',
    acts: [
      { name: 'Check', text: [], mercy: 0 },
      { name: 'Look Closely', text: ['* You look right at Nocturne. Really look.', '* Nocturne freezes. Nobody has ever done that.'], mercy: 40, once: true },
      { name: 'Stay Still', text: ['* You stand perfectly still and let it circle you.', '* Nocturne relaxes a little.'], mercy: 25, calm: 1.5 },
      { name: 'Wave', text: ['* You wave hello.', '* After a long moment, a smoky hand waves back.'], mercy: 45, once: true },
    ],
    patterns: ['noct_lines', 'noct_crescent', 'noct_stars'],
    lore: 'A shadow assassin that guards the Waystone road. It has been invisible for so long it forgot what being seen feels like.',
  },
  rift_drake: {
    id: 'rift_drake',
    name: 'Rift Drake',
    color: '#5fd0ff',
    art: 'mon_rift_drake',
    height: 400,
    hp: 160,
    atk: 8,
    def: 4,
    exp: 80,
    gold: 100,
    stars: 3,
    affinity: 'Void',
    boss: true,
    music: 'boss',
    bindChance: 0.2,
    check: 'RIFT DRAKE — ATK 8 DEF 4\n* Guardian of the Waystone. The rift in its scales is spreading. It is in pain.',
    intro: '* The Waystone splits the dark — RIFT DRAKE rises!',
    idle: ['* The rift-cracks along Rift Drake\'s scales pulse cyan.', '* The Waystone flickers in time with its heartbeat.', '* Rift Drake\'s roar shakes blossoms from the trees.', '* Rift Drake is breathing slower now.'],
    talk: ['LEAVE.', 'THE STONE\nIS BROKEN.\nSO AM I.', 'WHY DO YOU\nNOT FIGHT?', '...it hurts,\ntamer.', 'Stay with me.'],
    spareText: '* Rift Drake lowers its great head to yours. The rift in its scales begins to close.',
    acts: [
      { name: 'Check', text: [], mercy: 0 },
      { name: 'Calm', text: ['* You speak softly. "You don\'t have to hurt anymore."', '* Rift Drake\'s roar falters.'], mercy: 25, calm: 1 },
      { name: 'Endure', text: ['* You plant your feet and refuse to raise a hand.', '* Rift Drake sees you will not fight back.'], mercy: 20, calm: 0.5, heal: 4 },
      { name: 'Touch Stone', text: ['* You press your palm to the Waystone.', '* It is warm. Just barely. Rift Drake notices.'], mercy: 30, once: true },
    ],
    patterns: ['drake_tornado', 'drake_burst', 'drake_rift', 'drake_storm'],
    lore: 'The ancient guardian of the western Waystone, cracked by a rift from beyond the isle. Calmed, it remembers how to keep the light.',
  },
  divine: {
    id: 'divine',
    name: 'Divine',
    color: '#fff4dc',
    art: 'mon_divine',
    height: 420,
    hp: 920,
    atk: 12,
    def: 9,
    exp: 0,
    gold: 0,
    stars: 3,
    affinity: 'Radiance',
    music: 'ending',
    bindChance: 0,
    check: 'DIVINE — ???',
    intro: '',
    idle: [],
    talk: [],
    spareText: '',
    acts: [],
    patterns: [],
    lore: 'A celestial of the Empyrean, keeper of the Waystones. It appears only to those who choose mercy when fighting would be easier.',
  },
};

export const BESTIARY_ORDER = ['bat_fiend', 'bones', 'blood_priest', 'nocturne', 'rift_drake', 'divine'];

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = {
  tonic: { id: 'tonic', name: 'Restoration Tonic', desc: 'Restores 15 HP. Tastes like blue.' },
  orb: { id: 'orb', name: 'Binding Orb', desc: 'Binds a calm or weakened monster as your companion.' },
  tart: { id: 'tart', name: 'Dragonfruit Tart', desc: 'Restores 30 HP. Half-eaten. Still delicious.' },
};

export interface SkillDef {
  id: string;
  name: string;
  card: string;
  tu: number;
  power: number;
  minLv: number;
  desc: string;
}

// The FIGHT cards come straight from the UI sheet. TU ("time units") is the
// Dragon Island Blue cost of the move: here it sets how long the enemy's
// counter-attack lasts, so stronger moves leave you dodging longer.
export const SKILLS: SkillDef[] = [
  { id: 'tail', name: 'Tail', card: 'ui_card_tail', tu: 70, power: 1, minLv: 1, desc: 'A quick tail sweep. Short counter-attack.' },
  { id: 'outrage', name: 'Outrage', card: 'ui_card_outrage', tu: 160, power: 2.1, minLv: 1, desc: 'A furious charge. Long counter-attack.' },
  { id: 'flame', name: 'Flame', card: 'ui_card_flame', tu: 130, power: 1.6, minLv: 1, desc: 'Dragonfire burst. Medium counter-attack.' },
  { id: 'wyrm', name: 'Wyrmsong', card: 'ui_card_unknown', tu: 200, power: 2.8, minLv: 3, desc: 'Unlocks at LV 3. A song that shakes the rift.' },
];
