// Walk-map fixes per room: occluders (tall painted objects the player walks behind), extra block
// polygons and corrected walk areas. Applied on top of every room source by rooms.ts.
import type { Pt } from './rooms';

export const ROOM_FIXES: Record<string, { occluders?: { poly: Pt[]; base: number }[]; block?: Pt[][]; walk?: Pt[][] }> = {
  plaza: {
    // the snow-flower planter in the middle of the plaza
    occluders: [{ poly: [[598, 520], [606, 470], [650, 425], [700, 402], [760, 393], [820, 404], [862, 440], [884, 500], [880, 535], [822, 580], [700, 588], [620, 566]], base: 568 }],
  },
};
