// Placeholder until tools/gen_regions.py writes the generated regions.
import type { RoomDef } from './rooms';
import type { RegionStory } from './regionTypes';

export const REGION_ROOMS: RoomDef[] = [];
export const REGION_UNLOCKS: { exitTo: string; requires: string; lockedText: string[] }[] = [];
export const REGION_STORY: RegionStory = { room_entries: {}, npc_dialogue: {}, bosses: {}, unlock_lines: {}, map_text_addendum: '' };
export const REGION_NPC_SHEETS: string[] = [];
