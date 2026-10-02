// Static verification for the plan items — plain node ESM, no dependencies.
// Run: node tests/verify.mjs
import assert from 'node:assert/strict';
import {
  FIELDERS, FIELD_SETS, RING_RADIUS, PITCH_LENGTH, MATCH, STANCES,
  SHOT_ZONES, SHOT, LENGTHS, BATSMAN, shotZoneFor,
} from '../src/constants.js';
import { planNextBall, chooseField, powerplayOvers, countOutsideRing } from '../src/systems/gameflow.js';

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.error('  ✗', name, '—', e.message); }
};

console.log('\n— Fielding side (B2) —');

check('FIELDERS has 10 entries (Keeper + 9 fielders; bowler is the 11th player)', () => {
  assert.equal(FIELDERS.length, 10);
  assert.equal(FIELDERS.filter((f) => f.isKeeper).length, 1);
});

check('every FIELD_SETS entry resolves all 10 names', () => {
  const names = FIELDERS.map((f) => f.name).sort();
  for (const [key, set] of Object.entries(FIELD_SETS)) {
    const posNames = Object.keys(set.pos).sort();
    assert.deepEqual(posNames, names, `${key}: missing ${names.filter((n) => !posNames.includes(n)).join(', ')}`);
  }
});

check('powerplay-legal sets have ≤ 2 outside the ring', () => {
  for (const key of ['balanced', 'attacking', 'spin']) {
    const n = countOutsideRing(key);
    assert.ok(n <= 2, `${key} has ${n} outside the ring`);
  }
});

check('defensive set is flagged postPowerplay and has > 2 outside', () => {
  assert.equal(FIELD_SETS.defensive.postPowerplay, true);
  assert.ok(countOutsideRing('defensive') > 2, 'defensive should push 3+ outside');
});

check('powerplayOvers scales (5 → 2, 10 → 3, 20 → 6)', () => {
  assert.equal(powerplayOvers(5), 2);
  assert.equal(powerplayOvers(10), 3);
  assert.equal(powerplayOvers(20), 6);
});

check('no field set violates the sightline corridor (|x| < 3, 0 < z < 13)', () => {
  for (const [key, set] of Object.entries(FIELD_SETS)) {
    for (const [name, p] of Object.entries(set.pos)) {
      if (p[1] > 0 && p[1] < 13 && Math.abs(p[0]) < 3) {
        assert.fail(`${key}/${name} at [${p}] sits in the sightline corridor`);
      }
    }
  }
});

console.log('\n— Step-driven game flow (B0–B5) —');

check('planner returns a plan with a note for every outcome', () => {
  for (const kind of ['four', 'six', 'wicket', 'dot', 'wide', null]) {
    const p = planNextBall({ lastHolder: kind ? { kind } : null });
    assert.ok(p && typeof p.note === 'string' && p.note.length > 0, `kind ${kind}`);
    assert.ok(['slower', 'faster', null].includes(p.pace), `kind ${kind} pace`);
    assert.ok(typeof p.spin === 'boolean', `kind ${kind} spin`);
  }
});

check('boundary → slower pace + yorker/full + turn (B1)', () => {
  const fast = planNextBall({ lastHolder: { kind: 'six' }, bowler: { paces: ['Fast', 'Fast-Medium'] } });
  assert.equal(fast.pace, 'slower');
  assert.equal(fast.spin, true);
  assert.ok(['yorker', 'full'].includes(fast.length));
  const spin = planNextBall({ lastHolder: { kind: 'four' }, bowler: { paces: ['Slow-Medium', 'Slow'] } });
  assert.equal(spin.pace, 'slower');
  assert.equal(spin.length, 'full'); // no yorker from the spinners
});

check('dot → variation; wicket → attacking length; wide → neutral (B1)', () => {
  const dot = planNextBall({ lastHolder: { kind: 'dot' } });
  assert.equal(dot.pace, 'faster');
  assert.equal(dot.length, 'short');
  const wicket = planNextBall({ lastHolder: { kind: 'wicket' } });
  assert.equal(wicket.length, 'good');
  const wide = planNextBall({ lastHolder: { kind: 'wide' } });
  assert.equal(wide.length, null);
});

check('chooseField honors the powerplay: no defensive in the first 2 overs of a 5-over game', () => {
  for (let balls = 0; balls < 12; balls++) {
    const f = chooseField({ balls, ballsRemaining: 1, oversPerInnings: 5, heat: 1, bowler: { id: 'raf' } });
    assert.notEqual(f, 'defensive', `defensive chosen at ball ${balls} (inside powerplay)`);
  }
});

check('chooseField allows defensive after the powerplay under pressure', () => {
  const f = chooseField({ balls: 18, ballsRemaining: 12, oversPerInnings: 5, heat: 1, bowler: { id: 'raf' } });
  assert.equal(f, 'defensive');
});

check('chooseField: spinner gets the spin squeeze; new batter gets attacking', () => {
  const spin = chooseField({ balls: 18, ballsRemaining: 20, oversPerInnings: 5, heat: 0, bowler: { id: 'leg' } });
  assert.equal(spin, 'spin');
  const att = chooseField({ balls: 30, ballsRemaining: 0, oversPerInnings: 5, lastHolder: { kind: 'wicket' }, bowler: { id: 'raf' } });
  assert.equal(att, 'attacking');
});

console.log('\n— Realistic batsmen (A2/A3) —');

check('STANCES has R and L variants with the same cue set', () => {
  assert.ok(STANCES.R && STANCES.L, 'both entries exist');
  assert.deepEqual(Object.keys(STANCES.L).sort(), Object.keys(STANCES.R).sort());
});

check('stance is image-matched: split feet, deep knee bend, bat raised', () => {
  const S = STANCES.R;
  assert.ok(S.footStep > 0.25 && S.footBack < -0.15,
    `feet read parallel: front ${S.footStep}, back ${S.footBack}`);
  assert.ok(S.footStep - S.footBack > 0.5, `split too small: ${S.footStep - S.footBack}`);
  assert.ok(S.kneeFlex > 0.3, `knee bend too shallow: ${S.kneeFlex}`);
  assert.ok(S.batRaise > Math.PI / 2, `bat not raised: ${S.batRaise}`);
  assert.ok(S.torsoHunch > 0.55, `hunch too upright: ${S.torsoHunch}`);
});

check('BATSMAN carries batBlade, recoverDuration, guardTapSpeed, guardOffset', () => {
  assert.ok(BATSMAN.batBlade?.w > 0 && BATSMAN.batBlade?.d > 0);
  assert.ok(BATSMAN.recoverDuration > 0);
  assert.ok(BATSMAN.guardTapSpeed > 0);
  assert.ok(BATSMAN.guardOffset >= 0);
});

check('every SHOT_ZONE has worksOn (valid lengths) + footwork', () => {
  const lenNames = LENGTHS.map((l) => l.name);
  for (const z of SHOT_ZONES) {
    assert.ok(Array.isArray(z.worksOn) && z.worksOn.length > 0, `${z.name} worksOn`);
    for (const w of z.worksOn) assert.ok(lenNames.includes(w), `${z.name} bad length "${w}"`);
    assert.ok(['front', 'back', 'either'].includes(z.footwork), `${z.name} footwork`);
  }
});

check('LHB shot-zone lookup mirrors RHB (same world direction = same name)', () => {
  for (let deg = -180; deg <= 180; deg += 15) {
    const a = (deg * Math.PI) / 180;
    assert.equal(shotZoneFor(a, 'L').name, shotZoneFor(-a, 'R').name, `deg ${deg}`);
  }
});

check('SHOT carries the length-aware penalties', () => {
  assert.ok(SHOT.lengthMissMul > 0 && SHOT.lengthMissMul < 1);
  assert.ok(SHOT.edgeChance > 0 && SHOT.edgeChance < 1);
});

console.log('\n— Wrong-length swing regression (the 4/5 freeze) —');

// The 4/5 freeze: resolveSwing reassigned `const speed` on the wrong-length
// path -> "Assignment to constant variable" thrown from the Space handler ->
// the loop died before requestAnimationFrame and the game hard-froze exactly
// when Space was pressed. This test deterministically exercises that path.
const { resolveSwing } = await import('../src/systems/contact.js');

const fakeBatsman = { attack: false, hand: 'R', x: 0, z: 0.45 };
const fakeBall = { pos: { x: 0, z: 1.1 } };
const straightAim = { x: 0, z: 1, idle: false }; // Straight Drive: worksOn ['full','good']

check('wrong-length swing does NOT throw (const-speed regression)', () => {
  // short ball + straight drive = the exact path that froze the game
  const out = resolveSwing(fakeBatsman, fakeBall, straightAim, { length: { name: 'short' } });
  assert.equal(out.outcome, 'hit');
  assert.equal(out.lengthMatch, false);
  assert.ok(Number.isFinite(out.speed) && out.speed > 0, 'speed must stay finite');
  // yorker + straight drive = the other mismatched length
  const out2 = resolveSwing(fakeBatsman, fakeBall, straightAim, { length: { name: 'yorker' } });
  assert.equal(out2.lengthMatch, false);
  assert.ok(Number.isFinite(out2.speed));
});

check('right-length swing keeps full power (no penalty)', () => {
  for (const len of ['full', 'good']) {
    const out = resolveSwing(fakeBatsman, fakeBall, straightAim, { length: { name: len } });
    assert.equal(out.lengthMatch, true, `length ${len}`);
    assert.ok(Number.isFinite(out.speed));
  }
});

check('every (SHOT_ZONE × LENGTH) combination resolves without throwing', () => {
  for (const zone of SHOT_ZONES) {
    for (const len of LENGTHS) {
      // aim the zone's own direction: k * 45°
      const a = zone.k * (Math.PI / 4);
      const aim = { x: Math.sin(a), z: Math.cos(a), idle: false };
      const out = resolveSwing(fakeBatsman, fakeBall, aim, { length: { name: len.name } });
      assert.equal(out.outcome, 'hit', `${zone.name} on ${len.name}`);
      assert.ok(Number.isFinite(out.speed) && Number.isFinite(out.elevation),
        `${zone.name} on ${len.name} produced non-finite values`);
    }
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
