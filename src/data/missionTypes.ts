import type { StoryLine } from './storyTypes';

export type MissionId = 'blood' | 'wind';

export interface MissionFight {
  id: string;
  mission: MissionId;
  room: string;
  foes: string[]; // monster ids in the order they step in
  before: StoryLine[];
  between: string[]; // shown as each next foe steps in ({N} = foes remaining)
  after: StoryLine[];
}

export interface Fragment {
  item: string;
  item_name: string;
  desc: string;
  found: StoryLine[];
  page: string;
}

export interface MissionData {
  fights: MissionFight[];
  giver: Record<MissionId, string>; // npc id who gives / closes the mission
  offer: Record<MissionId, StoryLine[]>;
  waiting: Record<MissionId, string[]>;
  done: Record<MissionId, StoryLine[]>;
  fragments: Record<MissionId, Fragment>;
  formula: { item: string; item_name: string; desc: string; joined: StoryLine[]; page: string };
  quests: { id: MissionId | 'formula'; title: string; stages: string[] }[];
  room_entries: Record<string, StoryLine[]>;
}
