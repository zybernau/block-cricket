// Headless full-loop test: imports the real game (main.js) with stubbed
// DOM + THREE, drives the actual frame loop, presses keys, and asserts the
// step-driven flow advances AUTOMATICALLY (no manual key) without any
// runtime exception — the class of bug where the game hard-freezes mid-state
// (an exception inside update() kills requestAnimationFrame and the loop).
//
// Needs 'three' resolvable — writes a minimal stub into node_modules/three
// and removes it when done. Run: node tests/headless.mjs
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nodeModulesDir = path.join(root, 'node_modules');
const stubDir = path.join(nodeModulesDir, 'three');
const createdHere = !existsSync(stubDir);

const STUB = [
  // --- math / core ---
  'export class Vector3 {',
  '  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }',
  '  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }',
  '  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }',
  '  clone() { return new Vector3(this.x, this.y, this.z); }',
  '  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }',
  '  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }',
  '  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }',
  '  lerp(v, k) { this.x += (v.x - this.x) * k; this.y += (v.y - this.y) * k; this.z += (v.z - this.z) * k; return this; }',
  '  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }',
  '  length() { return Math.hypot(this.x, this.y, this.z); }',
  '  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }',
  '  distanceToSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }',
  '}',
  'export class Color { constructor() {} }',
  'export class Fog { constructor() {} }',
  'export const DoubleSide = 2;',
  'export const SRGBColorSpace = "srgb";',
  'export const MathUtils = {',
  '  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),',
  '  lerp: (a, b, t) => a + (b - a) * t,',
  '  degToRad: (d) => (d * Math.PI) / 180,',
  '};',
  // --- scene graph ---
  'export class Object3D {',
  '  constructor() {',
  '    this.children = [];',
  '    this.position = new Vector3();',
  '    this.scale = new Vector3();',
  '    this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };',
  '    this.visible = true; this.castShadow = false; this.receiveShadow = false;',
  '    this.renderOrder = 0; this.isObject3D = true;',
  '  }',
  '  add(...objs) { for (const o of objs) { this.children.push(o); o.parent = this; } }',
  '  traverse(fn) { fn(this); for (const c of this.children) if (c && typeof c.traverse === "function") c.traverse(fn); }',
  '}',
  'export class Mesh extends Object3D { constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; this.isMesh = true; } }',
  'export class Group extends Object3D { constructor() { super(); this.isGroup = true; } }',
  'export class Scene extends Object3D { constructor() { super(); this.background = null; this.fog = null; } }',
  // --- geometries / materials / lights / renderer ---
  'export class SphereGeometry { constructor() {} }',
  'export class BoxGeometry { constructor() {} }',
  'export class CircleGeometry { constructor() {} }',
  'export class CylinderGeometry { constructor() {} translate() {} }',
  'export class TorusGeometry { constructor() {} }',
  'export class BufferGeometry { setAttribute() {} computeVertexNormals() {} }',
  'export class BufferAttribute { constructor(a, s) {} }',
  'export class MeshBasicMaterial { constructor(o = {}) { Object.assign(this, o); } }',
  'export class MeshLambertMaterial { constructor(o = {}) { Object.assign(this, o); } }',
  'export class CanvasTexture { constructor() {} }',
  'export class Light { constructor() { this.position = new Vector3(); this.castShadow = false; this.shadow = { mapSize: { set() {} }, camera: {} }; } }',
  'export class DirectionalLight extends Light {}',
  'export class AmbientLight extends Light {}',
  'export class PerspectiveCamera { constructor() { this.position = new Vector3(); this.aspect = 1; } lookAt() {} updateProjectionMatrix() {} }',
  'export class WebGLRenderer { constructor() { this.shadowMap = { enabled: false, type: 0 }; } setSize() {} setPixelRatio() {} render() {} }',
  'export class Clock { getDelta() { return globalThis.__TEST_DT__ ?? (1 / 60); } }',
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

  // ---- DOM / window / rAF stubs ----
  const elementStub = (id) => ({
    id, textContent: '', className: '', innerHTML: '',
    style: {}, dataset: {}, value: '5',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, focus() {},
  });
  const els = new Map();
  globalThis.document = {
    getElementById: (id) => { if (!els.has(id)) els.set(id, elementStub(id)); return els.get(id); },
    querySelectorAll: () => [],
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect() {},
        globalCompositeOperation: 'source-over',
        fillStyle: '',
      }),
    }),
  };
  const handlers = {};
  globalThis.window = {
    innerWidth: 1280, innerHeight: 720,
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
  };
  let rafCb = null;
  globalThis.requestAnimationFrame = (fn) => { rafCb = fn; };
  globalThis.__TEST_DT__ = 1 / 60;

  // ---- load the real game (init() runs, registers the loop) ----
  await import('../src/main.js');

  const keydown = (code) => handlers['keydown']?.forEach((h) => h({ code, target: null, preventDefault() {} }));
  const keyup = (code) => handlers['keyup']?.forEach((h) => h({ code, target: null, preventDefault() {} }));
  const badge = () => els.get('step-badge')?.textContent ?? '';
  const stepText = () => els.get('step-text')?.textContent ?? '';
  const deliveryTag = () => els.get('delivery-tag')?.textContent ?? '';
  const frame = () => {
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('loop stopped — requestAnimationFrame was never re-registered');
    cb();
  };

  let errors = [];

  // 1. a few MENU frames
  for (let i = 0; i < 5 && !errors.length; i++) {
    try { frame(); } catch (e) { errors.push(`MENU frame ${i}: ${e.message}`); }
  }

  // 2. start the game (Enter on the start screen)
  keydown('Enter'); keyup('Enter');
  try { frame(); } catch (e) { errors.push(`start frame: ${e.message}`); }

  check('game starts into the flow without exceptions', () => {
    assert.deepEqual(errors, [], errors.join(' | '));
    assert.equal(badge(), '1/5', `badge after start: "${badge()}"`);
  });

  // 3. drive ~25s of frames, tapping Space each frame (swing path too) —
  //    the flow must advance 1 → 2 → 3 → 4 → 5 → 1 with NO manual key
  const transitions = [];
  let prev = badge();
  let bowled = false;
  for (let i = 0; i < 1500 && !errors.length; i++) {
    keydown('Space'); keyup('Space'); // swing attempt every frame (harmless off-delivery)
    try { frame(); } catch (e) {
      errors.push(`frame ${i} (badge ${prev}): ${e.message} :: ${(e.stack || '').split('\n')[1] || ''}`);
      break;
    }
    if (!bowled && deliveryTag()) bowled = true;
    if (badge() !== prev) { transitions.push(`${prev}→${badge()}`); prev = badge(); }
  }

  check('flow advances automatically: 1 plan → 2 fieldset → 3 freeze → 4 ready', () => {
    const seq = transitions.join(' ');
    assert.ok(transitions.some((t) => t.includes('1/5→2/5')), `no PLAN→FIELDSET transition in: ${seq}`);
    assert.ok(transitions.some((t) => t.includes('2/5→3/5')), `no FIELDSET→FREEZE transition in: ${seq}`);
    assert.ok(transitions.some((t) => t.includes('3/5→4/5')), `no FREEZE→IDLE transition in: ${seq}`);
  });

  check('bowler bowls: delivery tag appears (step 4 → delivery)', () => {
    assert.ok(bowled, 'no delivery was ever bowled in 25s of frames');
  });

  check('full cycle returns to step 1 (5 resolve → 1 plan)', () => {
    const seq = transitions.join(' ');
    assert.ok(transitions.some((t) => t.includes('→5/5')), `no resolve step in: ${seq}`);
    assert.ok(transitions.filter((t) => t.endsWith('→1/5')).length >= 2,
      `flow never looped back to PLAN in: ${seq}`);
  });

  check('no runtime exception across 25s of frames (no freeze)', () => {
    assert.deepEqual(errors, [], errors.join(' | '));
  });

  check('step text keeps flowing (non-empty at each advance)', () => {
    assert.ok(typeof stepText() === 'string');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
} finally {
  if (createdHere) {
    rmSync(nodeModulesDir, { recursive: true, force: true }); // we created the whole dir
  }
}
