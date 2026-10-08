// Placeholder until tools/gen_regions.py writes this batch.
import type { RoomDef } from './rooms';
import type { RegionStory } from './regionTypes';

export const REGION_ROOMS: RoomDef[] = [];
export const REGION_UNLOCKS: { exitTo: string; requires: string; lockedText: string[] }[] = [];
export const REGION_STORY: RegionStory = { room_entries: {}, npc_dialogue: {}, bosses: {}, unlock_lines: {}, map_text_addendum: '' };
export const REGION_NPC_SHEETS: string[] = [];
export const REGION_SPAWN_PATCHES: { room: string; name: string; spawn: { at: [number, number]; dir: 'up' | 'down' | 'left' | 'right' } }[] = [];
export const REGION_ENTRANCES: { room: string; rect: [number, number, number, number]; to: string; spawn: string }[] = [];
export const REGION_TABLES: Record<string, { id: string; w: number; depth?: [number, number]; nocap?: boolean }[]> = {};
