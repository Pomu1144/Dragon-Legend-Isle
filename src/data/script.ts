import type { Line } from '../ui/Dialogue';
import { STORY } from './story';
import { State } from '../state';
import { STARTERS } from './starters';

/** Fetch a story scene as dialogue lines, filling in {HATCHLING}/{ELEMENT}/name placeholders. */
export function scene(id: string): Line[] {
  const lines = STORY.scenes[id] ?? [];
  const s = State.get();
  const st = STARTERS.find((x) => x.id === s.starter?.id);
  const fill = (t: string) =>
    t
      .replace(/\{HATCHLING\}/g, st?.name ?? 'the hatchling')
      .replace(/\{ELEMENT\}/g, st?.element ?? '')
      .replace(/\{HERO\}/g, s.name);
  return lines.map((l) => ({
    text: fill(l.text),
    speaker: l.speaker || undefined,
    portrait: l.portrait && l.portrait !== 'none' ? l.portrait : undefined,
    choices: l.choices && l.choices.length ? l.choices.map(fill) : undefined,
    voice: l.portrait === 'guildmaster_portrait' ? 0.7 : l.portrait === 'wren_portrait' ? 1.25 : l.portrait === 'hero_portrait' ? 0.95 : l.portrait === 'mon_divine' ? 0.6 : 1,
  }));
}
