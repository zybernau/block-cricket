import { SHOT, BATSMAN, getDifficulty, shotZoneFor } from '../constants.js';
import { getAimVector } from '../input.js';
import { rand } from '../utils.js';

// Resolves a swing attempt against the incoming ball.
// Returns { outcome, quality, dirX, dirZ, aerial, speed, shotName, lengthMatch }.
// shotName comes from the same 8-zone table that drives the swing animation,
// mirrored for LHB so the world direction is always named correctly.
//
// Alignment:  horizontal distance between ball x and batsman x vs bat reach
// Timing:     distance of ball z from the batsman's contact plane
//
// Length-aware shots (A3): the aimed shot is checked against the delivery
// length (SHOT_ZONES.worksOn) — right shot for the length keeps full power;
// wrong length loses power (SHOT.lengthMissMul) and can spoon off a leading
// edge (SHOT.edgeChance).
export function resolveSwing(batsman, ball, aimOverride, delivery = null) {
  const reachEff = BATSMAN.reachX * (batsman.attack ? 1.0 : 1.15);
  const contactZ = batsman.z + BATSMAN.contactPlaneZ;

  const aim = aimOverride || getAimVector();
  const zone = shotZoneFor(Math.atan2(aim.x, aim.z), batsman.hand);
  const shotName = zone.name;

  const alignErr = Math.abs(ball.pos.x - batsman.x);
  const timeErr = ball.pos.z - contactZ;         // +ve = not yet arrived (early)

  if (alignErr > reachEff) {
    return { outcome: 'miss', reason: 'alignment', shotName };
  }

  // Difficulty scales the timing windows; Hard matches the legacy TIMING values.
  const diff = getDifficulty();
  const perfect = diff.perfect * (batsman.attack ? 1.0 : diff.defensiveMul);
  const earlyLate = diff.earlyLate * (batsman.attack ? 1.0 : diff.defensiveMul);

  const aErr = Math.abs(timeErr);
  if (aErr > earlyLate) return { outcome: 'miss', reason: 'timing', shotName };
  const perfectness = 1 - aErr / earlyLate;      // 1 = dead centre
  let qual;
  if (aErr <= perfect) qual = 'perfect';
  else qual = timeErr > 0 ? 'early' : 'late';

  const profile = batsman.attack ? SHOT.attack : SHOT.defensive;
  const mistimed = qual !== 'perfect';
  // `let` — the wrong-length penalty below reassigns it (a `const` here threw
  // "Assignment to constant variable" and hard-froze the game mid-swing)
  let speed = profile.power * (mistimed ? SHOT.misMul : 1) * rand(0.9, 1.1);
  let elevation = profile.elevation * (mistimed ? 0.8 : 1) + rand(-profile.powerJitter, profile.powerJitter);
  let aerial = batsman.attack;

  if (mistimed) {
    const misLoftChance = diff.misLoftChance ?? SHOT.misLoftChance;
    if (batsman.attack && Math.random() < misLoftChance) {
      aerial = true;
      elevation = Math.max(elevation, 32);       // spoons up
    } else if (!batsman.attack) {
      elevation = Math.min(elevation, 12);       // keeps it safe-ish down
      aerial = false;
    } else {
      aerial = true;
    }
  }

  // length-aware effectiveness (A3): aimed shot vs the delivery length
  const lenName = delivery?.length?.name ?? null;
  const worksOn = zone.worksOn ?? ['full', 'good'];
  const lengthMatch = lenName === null ? true : worksOn.includes(lenName);
  if (!lengthMatch) {
    speed *= SHOT.lengthMissMul;                 // wrong length: power bleeds
    elevation += 7;
    if (Math.random() < SHOT.edgeChance) {
      // leading edge — loops up gently, straight to the ring
      aerial = true;
      elevation = Math.max(elevation, 30);
      speed = Math.min(speed, 11);
    }
  }

  return { outcome: 'hit', qual, dirX: aim.x, dirZ: aim.z, speed, elevation, aerial, perfectness, shotName, lengthMatch };
}
