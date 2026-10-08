// Walk-map fixes per room: occluders (tall painted objects the player walks behind), extra block
// polygons and corrected walk areas. Applied on top of every room source by rooms.ts.
import type { Pt } from './rooms';

export const ROOM_FIXES: Record<string, { occluders?: { poly: Pt[]; base: number }[]; block?: Pt[][]; walk?: Pt[][] }> = {
  plaza: {
    // the snow-flower planter in the middle of the plaza
    occluders: [{ poly: [[598, 520], [606, 470], [650, 425], [700, 402], [760, 393], [820, 404], [862, 440], [884, 500], [880, 535], [822, 580], [700, 588], [620, 566]], base: 568 }],
  },
  gate: {
    // the gatehouse front: both towers and the wall over the arch (the arch opening stays see-through)
    occluders: [{ poly: [[580, 535], [580, 240], [660, 178], [750, 240], [752, 302], [962, 342], [968, 298], [1045, 226], [1125, 298], [1125, 560], [930, 556], [905, 542], [905, 420], [880, 392], [850, 377], [820, 372], [790, 378], [765, 395], [745, 420], [737, 532], [700, 536]], base: 536 }],
  },
};
