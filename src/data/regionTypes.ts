import type { StoryLine } from './storyTypes';

export interface RegionStory {
  room_entries: Record<string, StoryLine[]>;
  npc_dialogue: Record<string, { first: StoryLine[]; repeat: string[]; name: string; portrait: string }>;
  bosses: Record<string, { before: StoryLine[]; after_peace: StoryLine[]; after_won: StoryLine[] }>; // keyed by creature id
  unlock_lines: Record<string, StoryLine[]>; // keyed by the exit's destination room id
  map_text_addendum: string;
}
