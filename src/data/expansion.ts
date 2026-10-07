// Placeholder until tools/gen_expansion.py writes the generated world expansion.
import type { RoomDef } from './rooms';
import type { StoryLine } from './storyTypes';

export const EXPANSION_ROOMS: RoomDef[] = [];
export const WAYSTONE_EXITS: { topLeft: string; topRight: string; topLeftSpawn: string; topRightSpawn: string } | null = null;
export const EXPANSION_STORY: {
  after_orochi_peace: StoryLine[];
  after_orochi_won: StoryLine[];
  room_entries: Record<string, StoryLine[]>;
  npc_dialogue: Record<string, { first: StoryLine[]; repeat: string[]; name: string; portrait: string }>;
  frontier_lines: string[];
  map_text_addendum: string;
} = { after_orochi_peace: [], after_orochi_won: [], room_entries: {}, npc_dialogue: {}, frontier_lines: [], map_text_addendum: '' };
export const EXPANSION_NPC_SHEETS: string[] = [];
