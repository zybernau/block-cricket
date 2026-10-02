import {
  MATCH, RING_RADIUS, PITCH_LENGTH, FIELD_SETS, BOWLER_TYPES,
} from '../constants.js';

// ============================================================
// Game flow (B0–B5): the step-driven loop.
//   1. PLAN      set bowling parameters from the previous shot
//   2. FIELDSET  set fielders per the plan (field-restriction rule)
//   3. FREEZE    field static — they will not move
//   4. IDLE/BOWL once the batsman is ready, do the bowling
//   5. RESOLVE   as per the ball played, back to step 1
//
// Pure helpers only — no THREE, no DOM — so tests/verify.mjs can run them
// in node. main.js owns the state machine and calls these.
// ============================================================

// Field-restriction overs for a game of `overs` overs: 2 for a 5-over match
// (user rule), scaling up for longer games (10 -> 3, 20 -> 6, T20 style).
export function powerplayOvers(overs = MATCH.oversPerInnings) {
  return Math.max(MATCH.powerplayOvers, Math.round(overs * 0.3));
}

// Count fielders outside the 30-yard ring for a FIELD_SETS entry (keeper
// never counts for the ring). Mirrors x for LHB like setFormation does.
export function countOutsideRing(setName, hand = 'R') {
  const set = FIELD_SETS[setName];
  if (!set) return Infinity;
  const mirror = hand === 'L' ? -1 : 1;
  let n = 0;
  for (const [name, p] of Object.entries(set.pos)) {
    if (name === 'Keeper') continue;
    const x = p[0] * mirror;
    if (Math.hypot(x, p[1] - PITCH_LENGTH / 2) > RING_RADIUS) n++;
  }
  return n;
}

// STEP 1 — set the bowling parameters from the previous shot (B1).
// Returns a bias object for BowlingEngine.generate + a note for the HUD.
//   four/six -> slow the pace down, fuller/yorker length, more turn (turn
//               based on what was punished)
//   wicket   -> new batter, attacking good length
//   dot      -> vary it: quicker + bumper
//   wide     -> back to the legal line, repeat the pace
export function planNextBall({ lastHolder = null, heat = 0, bowler = null, lastDelivery = null } = {}) {
  const kind = lastHolder?.kind ?? null;
  if (kind === 'four' || kind === 'six') {
    const canYorker = !!bowler?.paces?.some((p) => p === 'Fast' || p === 'Fast-Medium');
    return {
      pace: 'slower',
      length: canYorker ? 'yorker' : 'full',
      spin: true,
      note: canYorker ? 'punished · slower ball, yorker attempt' : 'punished · slower ball, fuller',
    };
  }
  if (kind === 'wicket') {
    return { pace: null, length: 'good', spin: false, note: 'new batter · attacking length' };
  }
  if (kind === 'wide') {
    return { pace: null, length: null, spin: false, note: 'back to the legal line' };
  }
  if (kind === 'dot') {
    return { pace: 'faster', length: 'short', spin: false, note: 'dot ball · vary it, bumper' };
  }
  // first ball / settling in
  return { pace: null, length: null, spin: false, note: 'settling in' };
}

// STEP 2 — set the fielders according to the plan (B2).
// Situation rules (from main.js chooseField) + the field-restriction rule:
// during the powerplay overs at most 2 fielders may stand outside the ring,
// so the 'defensive' set (postPowerplay) is clamped to 'balanced' then.
export function chooseField({
  balls = 0, ballsRemaining = Infinity, oversPerInnings = MATCH.oversPerInnings,
  bowler = null, lastHolder = null, heat = 0,
} = {}) {
  const pp = powerplayOvers(oversPerInnings);
  const oversBowled = Math.floor(balls / MATCH.ballsPerOver);
  const inPowerplay = oversBowled < pp;

  let field;
  if (balls < MATCH.ballsPerOver || (lastHolder && lastHolder.kind === 'wicket')) {
    field = 'attacking';                       // new batter / first over: catchers
  } else if (!inPowerplay && (ballsRemaining <= MATCH.ballsPerOver * 2 || heat >= 0.66)) {
    field = 'defensive';                       // death overs / pressure: riders
  } else if (bowler && (bowler.id === 'off' || bowler.id === 'leg')) {
    field = 'spin';                            // spinner: squeeze
  } else {
    field = 'balanced';
  }

  // powerplay guard: defensive is illegal inside the restriction overs
  if (inPowerplay && FIELD_SETS[field]?.postPowerplay) field = 'balanced';
  return field;
}
