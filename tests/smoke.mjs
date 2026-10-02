// Integration smoke test: exercises planNextBall -> BowlingEngine.generate ->
// ball flight/wide rules end-to-end (the ball half of the step-driven loop).
//
// Needs 'three' resolvable under node — the script writes a minimal
// Vector3/MathUtils stub into node_modules/three and removes it when done.
// Not a real dependency; the browser uses the CDN importmap as before.
// Run: node tests/smoke.mjs
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nodeModulesDir = path.join(root, 'node_modules');
const stubDir = path.join(nodeModulesDir, 'three');
const createdHere = !existsSync(stubDir);

const STUB = [
  'export class Vector3 {',
  '  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }',
  '  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }',
  '  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }',
  '  clone() { return new Vector3(this.x, this.y, this.z); }',
  '  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }',
  '  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }',
  '  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }',
  '  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }',
  '  length() { return Math.hypot(this.x, this.y, this.z); }',
  '  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }',
  '  distanceToSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }',
  '}',
  'export class SphereGeometry { constructor() {} }',
  'export class MeshLambertMaterial { constructor(opts = {}) { Object.assign(this, opts); } }',
  'export class Mesh {',
  '  constructor(geo, mat) {',
  '    this.geometry = geo; this.material = mat;',
  '    this.castShadow = false; this.visible = true;',
  '    this.position = new Vector3();',
  '    this.rotation = { x: 0, y: 0, z: 0 };',
  '  }',
  '}',
  'export const MathUtils = {',
  '  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),',
  '  lerp: (a, b, t) => a + (b - a) * t,',
  '  degToRad: (d) => (d * Math.PI) / 180,',
  '};',
].join('\n');

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.error('  ✗', name, '—', e.message); }
};

try {
  if (createdHere) {
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(path.join(stubDir, 'package.json'),
      JSON.stringify({ name: 'three', type: 'module', main: 'index.js' }));
    writeFileSync(path.join(stubDir, 'index.js'), STUB);
  }

  const { BowlingEngine } = await import('../src/systems/bowlingEngine.js');
  const { planNextBall, chooseField } = await import('../src/systems/gameflow.js');
  const {
    BOWLER_TYPES, isWideAtCrease, CREASE_DEPTH, GRAVITY, FIELD_SETS,
  } = await import('../src/constants.js');
  const { Ball } = await import('../src/entities/ball.js');

  console.log('\n— Bowling plan → engine (B1) —');

  check('bias flows through generate: slower/faster pace honored', () => {
    const engine = new BowlingEngine();
    const bowler = BOWLER_TYPES.find((b) => b.id === 'mf'); // paces: FM/Medium/SM
    const slower = engine.generate(bowler, 0, 'R', { pace: 'slower', length: null, spin: false });
    assert.equal(slower.pace.name, 'Slow-Medium');
    const faster = engine.generate(bowler, 0, 'R', { pace: 'faster', length: null, spin: false });
    assert.equal(faster.pace.name, 'Fast-Medium');
  });

  check('bias length pins the bounce length', () => {
    const engine = new BowlingEngine();
    for (const len of ['yorker', 'full', 'good', 'short']) {
      const d = engine.generate(BOWLER_TYPES[0], 0, 'R', { pace: null, length: len, spin: false });
      assert.equal(d.length.name, len);
    }
  });

  check('spin bias prefers a turning swing', () => {
    const engine = new BowlingEngine();
    const bowler = BOWLER_TYPES.find((b) => b.id === 'off'); // swings: Right×2 + Straight
    for (let i = 0; i < 20; i++) {
      const d = engine.generate(bowler, 0, 'R', { pace: null, length: null, spin: true });
      assert.notEqual(d.swing.curve, 0, 'spin bias drew a straight ball');
    }
  });

  console.log('\n— Flight → wide rules with planned deliveries —');

  check('200 planned deliveries: legal rate ≥ 90%, every plan lands on target', () => {
    const engine = new BowlingEngine();
    let legal = 0, wides = 0;
    const outcomes = ['four', 'six', 'wicket', 'dot', 'wide', null];
    for (let i = 0; i < 200; i++) {
      const hand = i % 2 ? 'L' : 'R';
      const plan = planNextBall({
        lastHolder: { kind: outcomes[i % outcomes.length] },
        bowler: BOWLER_TYPES[i % BOWLER_TYPES.length],
      });
      const d = engine.generate(BOWLER_TYPES[i % BOWLER_TYPES.length], 0.5, hand, plan);
      if (d.wideSide) { wides++; continue; }
      // simulate the flight to the crease — a legal-plan ball must cross
      // inside the wide guidelines for that hand
      const sim = new Ball({ add() {} });
      sim.throwFrom(d.pos, d.vel, d.accel); // accel is a scalar lateralAccel
      let crossedX = null;
      for (let s = 0; s < 4000 && crossedX === null; s++) {
        sim.update(1 / 240, GRAVITY);
        if (sim.pos.z <= CREASE_DEPTH) crossedX = sim.pos.x;
      }
      assert.notEqual(crossedX, null, `${d.tag} never reached the crease`);
      assert.equal(isWideAtCrease(crossedX, hand), null,
        `${d.tag} (wideSide=${d.wideSide}) called wide at x=${crossedX.toFixed(2)}`);
      legal++;
      sim.hide();
    }
    assert.ok(legal >= 180, `legal rate too low: ${legal}/200`);
    console.log(`    (${wides} planned wides, ${legal} legal)`);
  });

  console.log('\n— Field sets across a 5-over game (B2) —');

  check('chooseField picks powerplay-legal sets for all 30 balls', () => {
    for (let balls = 0; balls < 30; balls++) {
      const field = chooseField({
        balls, ballsRemaining: 30 - balls, oversPerInnings: 5,
        heat: 0.8, bowler: BOWLER_TYPES[0],
      });
      const set = FIELD_SETS[field];
      assert.ok(set, `unknown field ${field}`);
      if (balls < 12) assert.notEqual(set.postPowerplay, true, `${field} at ball ${balls}`);
    }
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
} finally {
  // clean up the transient stub (only if this run created it)
  if (createdHere) {
    rmSync(nodeModulesDir, { recursive: true, force: true }); // we created the whole dir
  }
}
