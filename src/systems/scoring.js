import { RING_RADIUS, BOUNDARY_RADIUS, PITCH_LENGTH } from '../constants.js';

// Auto-runs rules (Phase 1 — no manual running):
//  crosses boundary in air (before bounce)  = 6
//  crosses boundary after bounce / rolls over = 4
//  stopped/passing outside the ring        = 2
//  inside the ring or blocked              = 1
export function awardRuns({ crossedBoundary, bouncedBefore, finalX, finalZ, stoppedInside }) {
  if (crossedBoundary) {
    return { runs: bouncedBefore ? 4 : 6 };
  }
  if (!stoppedInside) return { runs: 2 }; // fell outside ring, stopped short of rope
  return { runs: 1 };
}

export function distFromCentre(x, z) {
  return Math.hypot(x, z - PITCH_LENGTH / 2);
}
export { RING_RADIUS, BOUNDARY_RADIUS };
