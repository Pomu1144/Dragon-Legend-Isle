// The Dundean missions: the blood rite in the graveyard and the wind priests' cult.
// Progress lives in save flags: quest_<mission> (accepted), fight_<id> (a group broken),
// thanked_<mission> (reported back), and the fragment / formula key items.
import { MISSIONS } from './data/missions';
import type { MissionFight, MissionId } from './data/missionTypes';
import { State } from './state';

export const Quests = {
  fight(id: string): MissionFight | undefined {
    return MISSIONS?.fights.find((f) => f.id === id);
  },
  accepted(m: MissionId) {
    return State.flag('quest_' + m);
  },
  fightsOf(m: MissionId) {
    return MISSIONS?.fights.filter((f) => f.mission === m) ?? [];
  },
  done(m: MissionId) {
    const fs = this.fightsOf(m);
    return fs.length > 0 && fs.every((f) => State.flag('fight_' + f.id));
  },
  /** Which mission an NPC gives, if any. */
  givenBy(npc: string): MissionId | undefined {
    if (!MISSIONS) return undefined;
    return (Object.keys(MISSIONS.giver) as MissionId[]).find((m) => MISSIONS!.giver[m] === npc);
  },
  /** Quest-log rows: [title, current text, finished]. */
  log(): { title: string; text: string; done: boolean }[] {
    if (!MISSIONS) return [];
    const rows: { title: string; text: string; done: boolean }[] = [];
    for (const q of MISSIONS.quests) {
      if (q.id === 'formula') {
        const n = (['blood', 'wind'] as MissionId[]).filter((m) => this.done(m)).length;
        if (n === 0) continue;
        rows.push({ title: q.title, text: q.stages[Math.min(n - 1, q.stages.length - 1)], done: n === 2 });
        continue;
      }
      if (!this.accepted(q.id)) continue;
      const fs = this.fightsOf(q.id);
      const broken = fs.filter((f) => State.flag('fight_' + f.id)).length;
      const stage = this.done(q.id) ? 2 : broken > 0 ? 1 : 0;
      const tally = fs.length > 1 && stage < 2 ? `  (${broken} of ${fs.length} broken)` : '';
      rows.push({ title: q.title, text: (q.stages[Math.min(stage, q.stages.length - 1)] ?? '') + tally, done: stage === 2 });
    }
    return rows;
  },
};
