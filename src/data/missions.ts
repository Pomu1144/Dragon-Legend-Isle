// Placeholder until tools/gen_missions.py writes the generated missions.
import type { RoomDef } from './rooms';
import type { MissionData } from './missionTypes';

export const MISSION_ROOMS: RoomDef[] = [];
export const MISSION_ENTRANCES: { room: string; exit: RoomDef['exits'][number]; spawnName: string; spawn: { at: [number, number]; dir: 'up' | 'down' | 'left' | 'right' }; replaces?: string }[] = [];
export const MISSIONS: MissionData | null = null;
