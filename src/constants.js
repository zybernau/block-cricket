// ============================================================
// ALL gameplay tuning lives here. Tweak these numbers to change
// the feel of the game — nowhere else should hardcode physics.
// ============================================================

// ---- Field dimensions (metres, y-up, z = pitch axis) ----
// Batsman end at z = 0, bowler end at z = +PITCH_LENGTH.
// Camera sits behind z = 0 looking down -z towards bowler at +z.
//
// Basic-cricket crease setup (user-specified, feet converted at 1 ft = 0.3048 m):
//   popping crease 2.5 ft (0.762 m) in front of each set of stumps,
//   wide guidelines 2 ft (0.61 m) either side of middle stump, full length.
export const FOOT = 0.3048;
export const PITCH_LENGTH = 20.12;        // stumps to stumps
export const PITCH_WIDTH = 3.05;          // real 10 ft wide, widened from 2.5
export const CREASE_DEPTH = 2.5 * FOOT;   // popping (batsman) crease in front of stumps

// ---- Stumps / bat / wide guidelines ----
// Asymmetric wides (limited-overs style): generous outside off, strict down leg.
//   OFF line: 1.5 bat-lengths out from the stump edge (blue guides, ≈1.275).
//   LEG line: just outside leg stump (amber guides) — anything passing down
//   leg beyond it untouched is a wide, even if inside the blue lines.
// Side flips with handedness: RHB off = -x / leg = +x; LHB mirrors.
export const PERSON = { w: 0.42, h: 1.72, d: 0.42 }; // total height
export const STUMP = { h: 0.77, r: 0.035, gap: 0.08, color: 0xf5f5dc };
export const BAT_LENGTH = 0.75;           // matches the bat mesh in batsman.js
export const STUMP_EDGE = STUMP.gap + 2 * STUMP.r; // outer edge of off/leg stump (|x|)
export const WIDE_OFF_HALF_WIDTH = STUMP_EDGE + 1.5 * BAT_LENGTH; // ≈1.275
export const WIDE_HALF_WIDTH = WIDE_OFF_HALF_WIDTH; // legacy alias (art, clamps)
export const WIDE_LEG_HALF_WIDTH = 0.45;  // just outside leg stump
export const WIDE_RUNS = 1;               // penalty per wide (ball not counted)
export const WIDE_TARGET_OFF = { min: WIDE_OFF_HALF_WIDTH + 0.25, max: WIDE_OFF_HALF_WIDTH + 0.9 };
export const WIDE_TARGET_LEG = { min: WIDE_LEG_HALF_WIDTH + 0.25, max: WIDE_LEG_HALF_WIDTH + 0.9 };
export const WIDE_TARGET = WIDE_TARGET_OFF; // legacy alias
// Legal line stays inside the relevant guideline with margin: full range on
// the off side, tucked to just inside the leg line on the leg side.
export const LEGAL_OFF_MAX = 0.75;
export const LEGAL_LEG_MAX = WIDE_LEG_HALF_WIDTH - 0.1; // ≈0.35

// hand 'R'|'L' -> +1 = off side is -x (RHB), -1 mirrors for LHB.
// Returns 'off' | 'leg' for a crease-crossing x.
export function wideSideFor(x, hand = 'R') {
  if (x === 0) return 'off';
  const offSign = hand === 'L' ? 1 : -1; // x-sign of the off side
  return Math.sign(x) === offSign ? 'off' : 'leg';
}
export function isWideAtCrease(x, hand = 'R') {
  const side = x === 0 ? 'off' : wideSideFor(x, hand);
  const lim = side === 'off' ? WIDE_OFF_HALF_WIDTH : WIDE_LEG_HALF_WIDTH;
  return Math.abs(x) > lim ? side : null;
}
export function legalLineRange(hand = 'R') {
  // RHB: off (-x) to -0.75, leg (+x) to +0.35. LHB mirrors.
  return hand === 'L'
    ? { min: -LEGAL_LEG_MAX, max: LEGAL_OFF_MAX }
    : { min: -LEGAL_OFF_MAX, max: LEGAL_LEG_MAX };
}
export const BOUNDARY_RADIUS = 55;        // centre point = middle of pitch
export const RING_RADIUS = 23;            // 30-yard ring
export const GRAVITY = -9.8 * 2.2;        // arcade gravity (real feels too floaty here)

// ---- Camera ----
// Raised slightly so fielders can never sit directly in the sightline
// from the lens to the batsman contact zone.
export const CAMERA_SETUP = {
  fov: 55,
  position: [0, 4.9, -8.6],               // behind & above batsman stumps
  lookAt: [0, 1.1, 14],                   // angled down the pitch
};

// ---- Sightline ----
// Central corridor that must stay clear so the batsman always has an
// unobstructed view of the bowler/ball. No static fielder may be placed
// inside |x| < SIGHTLINE_HALF_WIDTH for 0 < z < SIGHTLINE_END_Z.
export const SIGHTLINE = {
  halfWidth: 3.0,
  endZ: 13.0,
  // dynamic fade: fielders within this lateral distance of the
  // camera->focus ray are faded out so they never block the play.
  fadeRadius: 1.6,
  fadedOpacity: 0.15,
};

// ---- Batsman ----
// Crease box (basic cricket): the batsman must stay inside the wide
// guidelines laterally and within 2 ft either side of the popping crease
// longitudinally — he cannot step out down the pitch past the box.
export const BATSMAN = {
  homeX: 0,                               // middle-stump guard for BOTH hands (bat side still mirrors)
  homeZ: 0.45,                            // just behind the popping crease (0.762)
  size: { w: 0.45, h: 0.55, d: 0.45 },    // torso block
  color: 0x1565c0,                        // blue
  headColor: 0xffcc80,
  batColor: 0xc8a15a,
  guardOffset: 0.12,                      // middle-and-leg guard (leg side of middle stump)
  // movement clamp (crease box — laterally bounded by the wide guidelines,
  // ±2 ft around the popping crease longitudinally)
  minX: -WIDE_HALF_WIDTH, maxX: WIDE_HALF_WIDTH,
  minZ: 2.5 * FOOT - 2 * FOOT, maxZ: 2.5 * FOOT + 2 * FOOT, // 0.15 .. 1.37
  moveSpeed: 5.2,                         // m/s
  // swing animation
  swingDuration: 0.22,                    // seconds wind-up -> follow through
  reachX: 1.05,                           // horizontal bat reach from batsman centre
  contactPlaneZ: 0.65,                    // z-offset in front of batsman where contact happens
  // bat mesh (blade width/thickness; length = BAT_LENGTH above)
  batBlade: { w: 0.1, d: 0.18 },
  // spring recovery: follow-through settles back to stance over this many seconds
  recoverDuration: 0.35,
  // bat-waggle idle animation (the raised bat bobs behind while waiting)
  guardTapSpeed: 3.2,
};

// ---- Stances keyed by handedness (A2, image-matched) ----
// Athletic batting stance per the reference image: SPLIT feet (the front foot
// strides up to the popping crease, the back foot planted well behind — the
// two legs never read parallel), deep knee bend with the hips dropped so the
// feet stay planted, chest pressed over the crease with the head up, and the
// bat raised up-back over the back shoulder. Every cue is mirrored at apply
// time (× mirror) so RHB and LHB both read correctly from behind the camera;
// the two entries are identical today and exist so per-hand tuning diverges.
export const STANCES = {
  R: {
    torsoYaw: 0.55,     // side-on: chest faces the off side (× mirror)
    torsoHunch: 0.62,   // forward press — chest over the crease (image lean)
    torsoTilt: 0.18,    // head over the front foot (× mirror)
    batX: 0.38,         // hands just outside the body line, leg side (× mirror)
    batY: 0.72,         // hands at waist height (bat raised, image grip)
    batZ: 0.3,          // hands forward of the body line, near the ball plane
    batRaise: 2.3,      // blade up-back over the shoulder (image backlift)
    batTilt: 0.28,      // toe angled out toward the keeper (× mirror)
    footSpread: 0.24,   // feet either side of guard (lateral)
    footStep: 0.36,     // FRONT foot striding up to the popping crease (split)
    footBack: -0.30,    // BACK foot planted behind, near the stumps (split)
    weightBack: 0.06,   // hips settled toward the back foot
    kneeFlex: 0.45,     // deep knee bend — athletic crouch (image stance)
  },
  L: { // mirrors R (same numbers, applied × mirror at applyStance)
    torsoYaw: 0.55, torsoHunch: 0.62, torsoTilt: 0.18,
    batX: 0.38, batY: 0.72, batZ: 0.3, batRaise: 2.3, batTilt: 0.28,
    footSpread: 0.24, footStep: 0.36, footBack: -0.30, weightBack: 0.06, kneeFlex: 0.45,
  },
};

// ---- Bowler ----
export const BOWLER = {
  homeZ: PITCH_LENGTH + 14.5,             // run-up start
  color: 0xc62828,                        // red
  runupSpeed: 7.5,
  releaseHeight: 2.35,                    // ball leaves hand at this height
  releaseZ: PITCH_LENGTH - CREASE_DEPTH - 0.4, // front arm of popping crease
};

// ---- Ball ----
export const BALL = {
  radius: 0.085,
  color: 0xe53935,
  bounciness: 0.62,                       // velocity retained per bounce
  rollFriction: 2.2,                      // ground drag when rolling
  stopSpeed: 0.9,                         // below this (and on ground) ball is dead
  keeperZ: -1.6,                          // keeper crouches behind stumps
};

// Pace types: speed (m/s), flight time to batsman, swing strength multiplier
export const PACE_TYPES = [
  { name: 'Fast',        speed: [36, 39], swingMul: 0.75 },
  { name: 'Fast-Medium', speed: [32, 35], swingMul: 1.0 },
  { name: 'Medium',      speed: [27, 31], swingMul: 1.3 },
  { name: 'Slow-Medium', speed: [23, 26], swingMul: 1.55 },
  { name: 'Slow',        speed: [18, 22], swingMul: 1.8 },
];

// ---- Bowlers: generic types for now ----
// A real attack: ~97%+ balls land legally, mistakes creep in under pressure
// (see pressure model in bowlingEngine.js). A fresh type takes the ball each
// over. FUTURE: named bowler profiles plug in here — per-bowler pace pools,
// pet deliveries, accuracy, strengths/weaknesses and pressure temperament.
export const BOWLER_TYPES = [
  { id: 'raf', name: 'Right-arm Fast', arm: 'right', paces: ['Fast', 'Fast-Medium'], swings: ['Straight', 'Left swing', 'Right swing'], curveMul: 1.0, wideBase: 0.015, releaseX: 0.9 },
  { id: 'laf', name: 'Left-arm Fast',  arm: 'left',  paces: ['Fast', 'Fast-Medium'], swings: ['Straight', 'Left swing', 'Right swing'], curveMul: 1.0, wideBase: 0.018, releaseX: -0.9 },
  { id: 'mf',  name: 'Medium-fast',    arm: 'right', paces: ['Fast-Medium', 'Medium', 'Slow-Medium'], swings: ['Straight', 'Left swing', 'Right swing'], curveMul: 1.1, wideBase: 0.020, releaseX: 0.9 },
  { id: 'off', name: 'Off-spin',       arm: 'right', paces: ['Slow-Medium', 'Slow'], swings: ['Right swing', 'Right swing', 'Straight'], curveMul: 1.6, wideBase: 0.022, releaseX: 0.6 },
  { id: 'leg', name: 'Leg-spin',       arm: 'right', paces: ['Slow-Medium', 'Slow'], swings: ['Left swing', 'Left swing', 'Straight'], curveMul: 1.8, wideBase: 0.025, releaseX: 0.6 },
];

// Swing types: direction (sign = +x leg side for RHB... camera at -z so +x = right side of screen = off... keep it simple: +x curves right of screen)
export const SWING_TYPES = [
  { name: 'Straight',     curve: 0 },
  { name: 'Left swing',   curve: -1.9 },  // lateral accel m/s^2 while in flight
  { name: 'Right swing',  curve: 1.9 },
];

// Fraction of in-flight swing accel retained after the bounce (seam/spin).
// Must match ball.js bounce damping AND the bowlingEngine crease-target solve
// below — keep the three in sync or legal lines drift wide at the crease.
export const SPIN_RETENTION = 0.35;

// Hard cap on in-flight lateral accel so slow-spin combos curve visibly but
// never take a silly mid-flight path (engine still lands them legal via the
// crease-target solve — this just keeps the trajectory believable).
export const MAX_LATERAL_ACCEL = 4.5;

// Pressure model tuning: heat 0..1 from boundaries in the recent window.
// Needs PRESSURE.boundariesForMax boundaries in the last PRESSURE.window balls
// for full heat — dots/wickets cool the bowler off quickly.
export const PRESSURE = { window: 8, boundariesForMax: 3 };

// Lengths: bounce position between stumps (fewer = fuller). 0 = yorker at batsman.
export const LENGTHS = [
  { name: 'yorker', bounceZ: 1.2 },
  { name: 'full',   bounceZ: 2.6 },
  { name: 'good',   bounceZ: 5.2 },
  { name: 'short',  bounceZ: 9.0 },
];

// Bowler line for LEGAL balls: x targeted at the popping crease (0 = middle stump).
// Legal lines stay comfortably inside the wide guidelines; the engine only
// strays outside them on rare pressure-driven mistakes (see bowlingEngine).
export const LINE_RANGE = { min: -0.75, max: 0.75 };

// ---- Contact & timing ----
export const TIMING = {
  perfect: 0.38,      // metres from contact plane => PERFECT
  earlyLate: 0.85,    // within this => early/late contact
  // beyond => clean miss
  // defence widens windows:
  defensiveMul: 1.6,
};

export const SHOT = {
  defensive: { power: 9.0,  elevation: 10,  powerJitter: 2.5 },  // degrees launch
  attack:    { power: 19.5, elevation: 26,  powerJitter: 5.0 },
  misMul: 0.45,       // early/late shots lose this much power
  misLoftChance: 0.55, // chance a mistimed attack shot spoons up
  // Length-aware shots (A3): a shot aimed against the wrong delivery length
  // (see SHOT_ZONES.worksOn) loses power and can take a leading edge.
  lengthMissMul: 0.6, // power kept when the shot is wrong for the length
  edgeChance: 0.35,   // chance a wrong-length shot spoons off the edge
};

// ---- Shot poses: rear-view animation + names, keyed by 8 aim zones ----
// angle = atan2(aim.x, aim.z): 0 = straight (Up arrow), +ve = screen-left.
// For a RHB facing the bowler, +x screen-left IS leg side; the umpire-view
// reference is mirrored, so: screen-right/up = off-side drives (cover),
// screen-left/up = leg-side drives (on-drive), square = cuts/pulls,
// down = behind-the-stumps glides (late cut / glance / sweep).
// Names are RHB terms; for a LHB the angle is mirrored before lookup so the
// same world direction reports correctly (cover <-> on-drive, cut <-> pull).
//
// Pose fields: plane 0 = vertical bat (drives/glances), 1 = horizontal bat
// (cuts/pulls/sweeps); lift/followOff adjust backlift/follow-through pitch;
// roll = bat roll at contact; crouch = torso dip (m); stride = front-foot
// step [dx, dz] (m); yawMul scales torso turn; lean = sideways torso tilt;
// pitch = extra forward hunch during the swing.
//
// Length-aware shot choice (A3):
//   worksOn  = delivery lengths (LENGTHS names) this shot is effective on —
//              a shot aimed at the wrong length loses power (SHOT.lengthMissMul)
//              and can spoon off a leading edge (SHOT.edgeChance).
//   footwork = 'front' (full/yorker), 'back' (short) or 'either' — drives the
//              stride the batter makes (batsman.js scales stride by length).
export const SHOT_ZONES = [
  { k: 0,  name: 'Straight Drive', plane: 0, lift: 0,    followOff: -0.3, roll: 0.15, crouch: 0.02, stride: [0, 0.25],     yawMul: 0.3, lean: 0.05, pitch: -0.10, worksOn: ['full', 'good'],           footwork: 'front' },
  { k: 1,  name: 'On-Drive',       plane: 0, lift: 0.1,  followOff: -0.4, roll: 0.35, crouch: 0.04, stride: [0.3, 0.2],     yawMul: 0.7, lean: 0.15, pitch: -0.05, worksOn: ['full', 'good'],           footwork: 'front' },
  { k: 2,  name: 'Pull Shot',      plane: 1, lift: -0.3, followOff: 0.3,  roll: 1.40, crouch: 0.10, stride: [0.3, 0],       yawMul: 1.0, lean: 0.25, pitch: 0.10,  worksOn: ['short'],                  footwork: 'back' },
  { k: 3,  name: 'Sweep Shot',     plane: 1, lift: 0.2,  followOff: 0.9,  roll: 1.20, crouch: 0.22, stride: [0.25, -0.1],   yawMul: 0.9, lean: 0.20, pitch: 0.25,  worksOn: ['full', 'good'],           footwork: 'front' },
  { k: 4,  name: 'Leg Glance',     plane: 0, lift: 0.2,  followOff: 0.5,  roll: 0.50, crouch: 0.08, stride: [0.15, -0.2],   yawMul: 1.0, lean: 0.10, pitch: 0.05,  worksOn: ['full', 'good', 'yorker'], footwork: 'either' },
  { k: -3, name: 'Late Cut',       plane: 1, lift: 0.1,  followOff: 0.7,  roll: 1.10, crouch: 0.12, stride: [-0.2, -0.15],  yawMul: 0.9, lean: 0.20, pitch: 0.05,  worksOn: ['good', 'short'],          footwork: 'back' },
  { k: -2, name: 'Square Cut',     plane: 1, lift: -0.2, followOff: 0.2,  roll: 1.30, crouch: 0.05, stride: [-0.35, 0],    yawMul: 0.8, lean: 0.25, pitch: 0,     worksOn: ['good', 'short'],          footwork: 'back' },
  { k: -1, name: 'Cover Drive',    plane: 0, lift: 0,    followOff: -0.3, roll: 0.40, crouch: 0.03, stride: [-0.3, 0.2],    yawMul: 0.7, lean: 0.15, pitch: -0.05, worksOn: ['full', 'good'],           footwork: 'front' },
];
export const SHOT_TURN_MAX = 1.15; // rad — behind-the-stumps shots glance, torso never spins

// angle in radians, hand 'R'|'L'. Returns the zone record (shared, read-only).
export function shotZoneFor(angle, hand = 'R') {
  const a = hand === 'L' ? -angle : angle;
  let k = Math.round(a / (Math.PI / 4));
  if (k === -4) k = 4; // straight behind (Down) either way
  return SHOT_ZONES.find((z) => z.k === k) || SHOT_ZONES[0];
}

// ---- Fielders: 10 on the field (Keeper + 9) — the Bowler entity is the
// 11th player of the side. Powerplay (field-restriction overs): at most 2
// outside the 30-yard ring. ----
// positions are [x, z], fielder block colour green.
//
// Sightline rule: nothing static may stand in the central corridor
// (|x| < 3, 0 < z < 13) between the camera and the bowler, so the
// batsman always has an unobstructed view of the play. Slips live
// BEHIND the batsman (z < 0, as in real cricket), not in front of him.
export const FIELDERS = [
  { pos: [1.1, -2.4],  name: 'Keeper', isKeeper: true },
  // behind the batsman (never in the sightline)
  { pos: [2.1, -2.1],  name: 'Slip' },
  // inside ring — all kept clear of the central corridor
  { pos: [6.0, 3.0],   name: 'Gully' },
  { pos: [12.5, 14.0], name: 'Point' },
  { pos: [-14.5, 16],  name: 'Cover' },
  { pos: [-8.5, 21.5], name: 'Mid-off' },
  { pos: [8.5, 21.5],  name: 'Mid-on' },
  { pos: [16.5, 6.0],  name: 'Square Leg' },
  // outside ring (field-restriction rule: only these two)
  { pos: [-30, 34],    name: 'Deep Cover' },
  { pos: [32, 12],     name: 'Deep Square' },
];
// Dynamic field sets: reposition the same 10 fielders by game situation.
// Coords are RHB-oriented (+x = leg side); mirrored for LHB at apply time.
// All sets keep the sightline corridor (|x| < 3, 0 < z < 13) clear and the
// keeper/slip behind the batsman. Keys match FIELDERS names.
// postPowerplay: sets with more than 2 outside the ring are ILLEGAL during
// the field-restriction overs — gameflow.js clamps to 'balanced' then.
export const FIELD_SETS = {
  // default: powerplay, 2 outside the ring
  balanced: {
    label: 'Balanced',
    pos: {
      'Keeper': [1.1, -2.4], 'Slip': [2.1, -2.1],
      'Gully': [6.0, 3.0], 'Point': [12.5, 14.0], 'Cover': [-14.5, 16],
      'Mid-off': [-8.5, 21.5], 'Mid-on': [8.5, 21.5], 'Square Leg': [16.5, 6.0],
      'Deep Cover': [-30, 34], 'Deep Square': [32, 12],
    },
  },
  // new batter / early overs: catchers crowd the bat, ring stays tight
  attacking: {
    label: 'Attacking',
    pos: {
      'Keeper': [1.1, -2.4], 'Slip': [1.8, -1.8],
      'Gully': [4.5, 2.0], 'Point': [10.5, 12.0], 'Cover': [-11.5, 14],
      'Mid-off': [-6.0, 19.0], 'Mid-on': [6.0, 19.0], 'Square Leg': [12.0, 5.0],
      'Deep Cover': [-30, 34], 'Deep Square': [32, 12],
    },
  },
  // spinner on: close catchers + short leg ring, cover drops back
  spin: {
    label: 'Spin squeeze',
    pos: {
      'Keeper': [1.1, -2.4], 'Slip': [1.8, -1.8],
      'Gully': [5.0, 4.0], 'Point': [10.0, 12.0], 'Cover': [-12.0, 15],
      'Mid-off': [-8.0, 22.0], 'Mid-on': [8.0, 22.0], 'Square Leg': [9.5, 3.5],
      'Deep Cover': [-30, 34], 'Deep Square': [32, 12],
    },
  },
  // batter on top / death overs: spread the boundary riders, 4 out
  defensive: {
    label: 'Defensive',
    postPowerplay: true,
    pos: {
      'Keeper': [1.1, -2.4], 'Slip': [2.1, -2.1],
      'Gully': [10.0, 10.0], 'Point': [21.0, 22.0], 'Cover': [-20.0, 20.0],
      'Mid-off': [-17.0, 32.0], 'Mid-on': [17.0, 34.0], 'Square Leg': [24.0, 8.0],
      'Deep Cover': [-30, 34], 'Deep Square': [32, 12],
    },
  },
};
export const CATCH_RADIUS = 1.5;   // catch zone for aerial balls (Hard default; overridden by difficulty)
export const BLOCK_RADIUS = 1.5;   // ground balls die within this radius (Hard default; overridden by difficulty)
export const CATCH_MAX_HEIGHT = 2.6;

// ---- Difficulty levels ----
// Hard = the original tuning (labelled as such). Easy/Medium widen the
// timing windows, slow the ball down and shrink fielder reach so runs
// come easier. Master tightens everything beyond Hard.
export const DIFFICULTY_LEVELS = {
  easy: {
    label: 'Easy',
    perfect: 0.8,
    earlyLate: 1.7,
    defensiveMul: 2.2,
    ballSpeedMul: 0.7,
    swingMul: 0.55,
    catchRadius: 1.0,
    blockRadius: 1.0,
    misLoftChance: 0.22,
    wideMul: 0.6,
    blurb: 'Slow balls · huge timing window · sleepy fielders',
  },
  medium: {
    label: 'Medium',
    perfect: 0.58,
    earlyLate: 1.25,
    defensiveMul: 1.9,
    ballSpeedMul: 0.86,
    swingMul: 0.8,
    catchRadius: 1.25,
    blockRadius: 1.25,
    misLoftChance: 0.38,
    wideMul: 0.8,
    blurb: 'Gentle pace · forgiving timing · lazy fielders',
  },
  hard: {
    label: 'Hard',
    perfect: 0.38,
    earlyLate: 0.85,
    defensiveMul: 1.6,
    ballSpeedMul: 1.0,
    swingMul: 1.0,
    catchRadius: 1.5,
    blockRadius: 1.5,
    misLoftChance: 0.55,
    wideMul: 1.0,
    blurb: 'Original tuning · sharp pace · safe hands',
  },
  master: {
    label: 'Master',
    perfect: 0.27,
    earlyLate: 0.62,
    defensiveMul: 1.3,
    ballSpeedMul: 1.14,
    swingMul: 1.3,
    catchRadius: 1.9,
    blockRadius: 1.9,
    misLoftChance: 0.72,
    wideMul: 1.2,
    blurb: 'Express pace · big swing · razor timing · sticky hands',
  },
};
export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'master'];

let _activeDifficultyKey = 'hard';

export function setDifficulty(key) {
  if (DIFFICULTY_LEVELS[key]) _activeDifficultyKey = key;
  return DIFFICULTY_LEVELS[_activeDifficultyKey];
}

export function getDifficultyKey() {
  return _activeDifficultyKey;
}

export function getDifficulty() {
  return DIFFICULTY_LEVELS[_activeDifficultyKey];
}

// ---- Match ----
export const MATCH = {
  oversPerInnings: 2,
  ballsPerOver: 6,
  wickets: 3,
  powerplayOvers: 2,   // field-restriction overs (≤2 outside the ring) for a 5-over game; gameflow scales up for longer games
};

// Start-screen overs choices (+ a custom box). Default = 5 for a real game feel.
export const OVERS_OPTIONS = [5, 10, 20];
export const DEFAULT_OVERS = 5;
export const MAX_CUSTOM_OVERS = 50;

// Batting order handedness for the 3 wickets: two right-handers, one left-hander.
// 'R' guards on +x (leg side for a RHB facing the bowler), 'L' mirrors to -x.
export const BATTING_ORDER = ['R', 'R', 'L'];
