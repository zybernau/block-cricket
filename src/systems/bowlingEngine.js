import * as THREE from 'three';
import {
  PACE_TYPES, SWING_TYPES, LENGTHS, WIDE_TARGET_OFF, WIDE_TARGET_LEG, BOWLER_TYPES,
  BOWLER, GRAVITY, CREASE_DEPTH, SPIN_RETENTION, MAX_LATERAL_ACCEL,
  legalLineRange, getDifficulty,
} from '../constants.js';
import { rand, pick } from '../utils.js';

// Generates a delivery: bowler type × pace × swing × line × length.
// Ball motion model: thrown from (releaseX, releaseHeight, releaseZ) down the pitch.
// Swing/in-flight lateral acceleration + gravity + bounce handled in ball.js.
//
// To hit the target bounce length despite gravity, we solve flight time from
// the speed, then derive vy to land exactly at bounceZ, and lateral accel from
// the swing curve so it ends on target line at the POPPING CREASE (where the
// wide call is made), not just at the bounce — with reduced post-bounce drift
// (SPIN_RETENTION, matching ball.js bounce damping).
//
// Pressure model: a real bowler lands ~97%+ balls legally and only sprays
// wides when the batting side applies pressure (heat 0..1 = recent boundaries).
//   effWide = min(WIDE_CAP, wideBase * (1 + 1.5*heat) * wideMul)
// At heat 0 a fast bowler goes at ~1.5% wides; under full assault up to ~5%.
const WIDE_CAP = 0.08;

function paceByName(name) {
  return PACE_TYPES.find((p) => p.name === name) || PACE_TYPES[1];
}

function swingByName(name) {
  return SWING_TYPES.find((s) => s.name === name) || SWING_TYPES[0];
}

export class BowlingEngine {
  constructor() {
    this.current = null;
  }

  // bowler: a BOWLER_TYPES entry (defaults to a random type); heat: 0..1 pressure.
  // hand: striker handedness ('R'|'L') — legal lines + wide sides flip with it.
  // bias (B1, from gameflow.planNextBall): the tactical call based on the
  // previous shot — { pace: 'slower'|'faster'|null, length: LENGTHS name|null,
  // spin: bool }. pace 'slower' takes the slowest of the bowler's options,
  // 'faster' the quickest; length pins the bounce; spin prefers a turning
  // swing type. Without a bias the delivery is drawn randomly as before.
  generate(bowler = pick(BOWLER_TYPES), heat = 0, hand = 'R', bias = null) {
    let pace;
    if (bias?.pace === 'slower') {
      pace = paceByName(bowler.paces[bowler.paces.length - 1]); // slowest option
    } else if (bias?.pace === 'faster') {
      pace = paceByName(bowler.paces[0]);                       // quickest option
    } else {
      pace = paceByName(pick(bowler.paces));
    }

    let length;
    if (bias?.length) {
      length = LENGTHS.find((l) => l.name === bias.length) || pick(LENGTHS);
    } else {
      length = pick(LENGTHS);
    }

    let swing;
    if (bias?.spin) {
      // prefer a swing type with turn on it (spinner: more turn)
      const curvy = bowler.swings.map(swingByName).filter((s) => s.curve !== 0);
      swing = curvy.length ? pick(curvy) : swingByName(pick(bowler.swings));
    } else {
      swing = swingByName(pick(bowler.swings));
    }

    return this.makeDelivery(pace, swing, length, bowler, heat, hand);
  }

  // targetX = x where the ball should cross the popping crease (wide call plane).
  // Legal balls stay inside the off guideline / leg line for the striker's hand;
  // pressure wides spray outside off OR down leg (strict leg line).
  makeDelivery(pace, swing, length, bowler = BOWLER_TYPES[0], heat = 0, hand = 'R') {
    const diff = getDifficulty();
    const speed = rand(...pace.speed) * (diff.ballSpeedMul ?? 1);

    // rare pressure-driven mistake: stray outside the wide guidelines
    const effWide = Math.min(
      WIDE_CAP,
      bowler.wideBase * (1 + 1.5 * Math.max(0, Math.min(1, heat))) * (diff.wideMul ?? 1)
    );
    const range = legalLineRange(hand);
    let targetX = rand(range.min, range.max); // around the stumps, hand-aware
    let wideSide = null;
    if (Math.random() < effWide) {
      // off-side vs down-leg: 50/50, each beyond its own guideline
      wideSide = Math.random() < 0.5 ? 'off' : 'leg';
      const offSign = hand === 'L' ? 1 : -1;
      const sign = wideSide === 'off' ? offSign : -offSign;
      const tgt = wideSide === 'off' ? WIDE_TARGET_OFF : WIDE_TARGET_LEG;
      targetX = sign * rand(tgt.min, tgt.max);
    }

    const dist = BOWLER.releaseZ - length.bounceZ;        // horizontal distance to bounce point
    const t = dist / speed;                                // flight time to bounce
    // vy needed so y = releaseHeight + vy*t + 0.5*g*t^2 == 0  (ground)
    const vy = (0 - BOWLER.releaseHeight - 0.5 * GRAVITY * t * t) / t;
    const rawAccel = swing.curve * pace.swingMul * bowler.curveMul * (diff.swingMul ?? 1);
    // cap the curve so slow-spin on Master stays dramatic, not cartoonish —
    // the crease-target solve below still lands it legally on targetX.
    const lateralAccel = THREE.MathUtils.clamp(rawAccel, -MAX_LATERAL_ACCEL, MAX_LATERAL_ACCEL);

    // solve vx so the ball arrives ON targetX at the popping crease
    // (z = CREASE_DEPTH, where main.js calls the wide), not at the bounce.
    // The ball is released at x = bowler.releaseX (the bowling arm), so the
    // solve must close that offset too:
    //   x_bounce = releaseX + vx*t + 0.5*a*t^2
    //   x_crease = x_bounce + (vx + a*t)*t2 + 0.5*a2*t2^2 = targetX
    //   => vx = (targetX - releaseX - 0.5*a*t^2 - a*t*t2 - 0.5*a2*t2^2) / (t + t2)
    // a2 = retained post-bounce drift (ball.js damps accel by SPIN_RETENTION).
    const t2 = Math.max(0.02, (length.bounceZ - CREASE_DEPTH) / speed);
    const a2 = lateralAccel * SPIN_RETENTION;
    const vxAdj =
      (targetX - bowler.releaseX - 0.5 * lateralAccel * t * t - lateralAccel * t * t2 - 0.5 * a2 * t2 * t2) /
      (t + t2);

    this.current = {
      pace, swing, length, bowler,
      speed, hand, wideSide,
      targetX, // x the ball should cross the popping crease at (debug/HUD)
      pos: new THREE.Vector3(bowler.releaseX, BOWLER.releaseHeight, BOWLER.releaseZ),
      vel: new THREE.Vector3(vxAdj, vy, -speed),
      accel: lateralAccel,
      tag: `${bowler.name} · ${pace.name} · ${swing.name} · ${length.name}`,
    };
    return this.current;
  }
}
