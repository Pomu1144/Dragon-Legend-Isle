export interface StoryLine {
  speaker: string;
  portrait: 'none' | 'hero_portrait' | 'wren_portrait' | 'guildmaster_portrait' | 'mon_divine';
  text: string;
  choices?: string[];
}

export interface StoryData {
  names: { sister: string; brother: string; guild_master: string; guild: string; kidnapper_epithet: string };
  intro_pages: { bg: string; tint: string; text: string }[];
  scenes: Record<string, StoryLine[]>;
  items: {
    manual: { title: string; pages: { heading: string; text: string }[] };
    translation_guide: { title: string; intro: string; villages: { village: string; region: string; phrases: { phrase: string; meaning: string }[] }[] };
    map: { title: string; text: string; nearest: { name: string; direction: string; note: string }[]; world_map_image_url: string };
  };
}

export interface Ability {
  name: string;
  tu: string;
  target: string;
  effect: string;
}

export interface StarterData {
  choice: 'earth' | 'wind' | 'water' | 'fire';
  name: string;
  id: string;
  number: string;
  element: string;
  stars: number;
  image_url: string;
  image_size: number[];
  sprite_description: string;
  lv1: { hp: number; attack: number; magic: number; speed: number; defense: number; resist: number };
  abilities: Ability[];
  evolution: { next_name: string; at_level: number; next_image_url: string; next_number?: string; next_abilities: Ability[]; chain: string };
  guild_blurb: string;
  notes: string;
}
