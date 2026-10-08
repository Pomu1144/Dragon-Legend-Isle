import type { StoryLine } from './storyTypes';

/** A side quest: a criminal or rogue tamer with a team of monsters, fought one after another. */
export interface Bounty {
  id: string;
  title: string;
  giver: string; // npc id, or "thing:<room>/<thing id>" for a notice board
  requires: string; // save flag needed before it is offered ("" = always)
  room: string; // where the criminal waits; they confront Kael on entering it
  criminal: string; // name shown in battle ("Elvin's Mutation")
  team: string[]; // monster ids, in order
  offer: StoryLine[];
  confront: StoryLine[];
  between: string[]; // "* " lines as the next monster comes out ({N} = left)
  after: StoryLine[];
  done: StoryLine[]; // the giver, afterwards
  reward: { gold: number; items: Record<string, number> };
  stages: string[]; // quest log: [accepted, done]
}
