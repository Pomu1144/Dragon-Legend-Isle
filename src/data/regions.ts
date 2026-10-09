// Every generated region batch (tools/gen_regions.py writes src/data/region_<batch>.ts), merged.
import type { RoomDef } from './rooms';
import type { RegionStory } from './regionTypes';
import * as frontiers1 from './region_frontiers1';
import * as frontiers2 from './region_frontiers2';
import * as westguardWesing from './region_westguard_wesing';

const BATCHES = [frontiers1, frontiers2, westguardWesing];

export const REGION_ROOMS: RoomDef[] = BATCHES.flatMap((b) => b.REGION_ROOMS);
export const REGION_UNLOCKS: { exitTo: string; requires: string; lockedText: string[] }[] = BATCHES.flatMap((b) => b.REGION_UNLOCKS);
export const REGION_SPAWN_PATCHES = BATCHES.flatMap((b) => b.REGION_SPAWN_PATCHES);
export const REGION_ENTRANCES: { room: string; rect: [number, number, number, number]; to: string; spawn: string }[] = BATCHES.flatMap((b) => ('REGION_ENTRANCES' in b ? (b as { REGION_ENTRANCES: { room: string; rect: [number, number, number, number]; to: string; spawn: string }[] }).REGION_ENTRANCES : []));
export const REGION_TABLES: Record<string, { id: string; w: number; depth?: [number, number]; nocap?: boolean }[]> = Object.assign({}, ...BATCHES.map((b) => ('REGION_TABLES' in b ? (b as { REGION_TABLES: object }).REGION_TABLES : {})));
export const REGION_NPC_SHEETS: string[] = [...new Set(BATCHES.flatMap((b) => b.REGION_NPC_SHEETS))];
const merge = <K extends keyof RegionStory>(k: K) => Object.assign({}, ...BATCHES.map((b) => b.REGION_STORY[k])) as RegionStory[K];
export const REGION_STORY: RegionStory = {
  room_entries: merge('room_entries'),
  npc_dialogue: merge('npc_dialogue'),
  bosses: merge('bosses'),
  unlock_lines: merge('unlock_lines'),
  map_text_addendum: BATCHES.map((b) => b.REGION_STORY.map_text_addendum).filter(Boolean).join('\n\n'),
};
