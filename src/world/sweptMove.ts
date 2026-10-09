/** Continuous-feeling collision for a perspective-painted overworld.
 * Test every short segment, even on a slow frame while running, so a narrow
 * fence, lamp, well rim or bridge edge cannot be skipped in one update.
 * Slide along the free axis instead of stopping the character completely.
 */
export type FootprintTest = (x: number, y: number) => boolean;

export function sweptMove(
  x: number, y: number, dx: number, dy: number, canStand: FootprintTest,
  maxStep = 4,
): [number, number] {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (canStand(x + sx, y + sy)) {
      x += sx;
      y += sy;
      continue;
    }
    // Collision detected: allow the feet to slide parallel to the obstacle.
    if (sx && canStand(x + sx, y)) x += sx;
    if (sy && canStand(x, y + sy)) y += sy;
  }
  return [x, y];
}
