import * as THREE from 'three';
import {
  PITCH_LENGTH, PITCH_WIDTH, BOUNDARY_RADIUS, RING_RADIUS,
  CAMERA_SETUP, STUMP, PERSON, CREASE_DEPTH, WIDE_HALF_WIDTH, WIDE_LEG_HALF_WIDTH,
} from './constants.js';
import { rand } from './utils.js';

// Block person builder: returns a GROUP so callers can move the whole figure
// and rotate limbs around custom pivot points. Same builder for everyone,
// colour is the only differentiator.
//
// Articulated joints (A1): hip pivots -> thigh -> knee pivot -> shin, and
// shoulder pivots -> upper arm -> elbow pivot -> forearm, plus a neck pivot
// for the head. Heights: hips at FIG_HIP_Y, feet at y=0, total leg 0.82,
// arm 0.58 (same proportions as the original single-box limbs).
export const FIG_HIP_Y = 0.82;
// limb segment lengths — batsman.js derives the stance hip height from them
// so a bent knee keeps the feet planted on the turf
export const FIG_LIMB = { thigh: 0.42, shin: 0.40 };

export function buildBlockPerson(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xffcc80 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });

  // ---- legs: hip pivot (Group) -> thigh -> knee pivot (Group) -> shin ----
  const thighGeo = new THREE.BoxGeometry(0.15, 0.42, 0.16);
  const shinGeo = new THREE.BoxGeometry(0.13, 0.40, 0.15); // slight taper
  const makeLeg = (sideSign) => {
    const hip = new THREE.Group(); // hip pivot — running/stepping rotates here
    hip.position.set(sideSign * 0.11, FIG_HIP_Y, 0);
    const thigh = new THREE.Mesh(thighGeo, dark);
    thigh.position.y = -0.21;
    const knee = new THREE.Group(); // knee pivot — flex/extend rotates here
    knee.position.y = -0.42;
    const shin = new THREE.Mesh(shinGeo, dark);
    shin.position.y = -0.20;
    knee.add(shin);
    hip.add(thigh, knee);
    return { hip, knee };
  };
  const legL = makeLeg(-1), legR = makeLeg(1);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), mat);
  const torsoPivot = new THREE.Group();
  torso.position.y = 0.31;                 // relative to pivot top of legs
  torsoPivot.add(torso);
  torsoPivot.position.y = FIG_HIP_Y;

  // ---- arms: shoulder pivot (Group) -> upper arm -> elbow pivot -> forearm ----
  const upperGeo = new THREE.BoxGeometry(0.13, 0.30, 0.14);
  const foreGeo = new THREE.BoxGeometry(0.11, 0.28, 0.12); // slight taper
  const makeArm = (sideSign) => {
    const shoulder = new THREE.Group(); // shoulder pivot — windup rotates here
    shoulder.position.set(sideSign * 0.33, 0.55, 0);
    const upper = new THREE.Mesh(upperGeo, mat);
    upper.position.y = -0.15;
    const elbow = new THREE.Group(); // elbow pivot — bend/extend rotates here
    elbow.position.y = -0.30;
    const fore = new THREE.Mesh(foreGeo, mat);
    fore.position.y = -0.14;
    elbow.add(fore);
    shoulder.add(upper, elbow);
    return { shoulder, elbow };
  };
  const armL = makeArm(-1), armR = makeArm(1);
  torsoPivot.add(armL.shoulder, armR.shoulder);

  // ---- neck pivot -> head (so head nods independently of torso) ----
  const neck = new THREE.Group();
  neck.position.y = 0.62; // top of the torso mesh
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 0.16;
  neck.add(head);
  torsoPivot.add(neck);

  g.add(legL.hip, legR.hip, torsoPivot);
  return {
    group: g, torsoPivot,
    armL: armL.shoulder, armR: armR.shoulder,   // backward-compatible refs
    elbowL: armL.elbow, elbowR: armR.elbow,
    legL: legL.hip, legR: legR.hip,             // backward-compatible refs
    kneeL: legL.knee, kneeR: legR.knee,
    head, neck,
  };
}

function makeGround(scene) {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(BOUNDARY_RADIUS * 1.06, 64),
    new THREE.MeshLambertMaterial({ color: 0x2e7d32 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, PITCH_LENGTH / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // light mowing stripes for depth
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(
      new THREE.CircleGeometry(BOUNDARY_RADIUS * 1.05 - i * 7, 64),
      new THREE.MeshBasicMaterial({ color: 0x2a7430, transparent: true, opacity: 0.25 })
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, -0.01 - i * 0.001, PITCH_LENGTH / 2);
    scene.add(stripe);
  }

  // pitch
  const pitch = new THREE.Mesh(
    new THREE.BoxGeometry(PITCH_WIDTH, 0.06, PITCH_LENGTH + 2),
    new THREE.MeshLambertMaterial({ color: 0xcbb98a })
  );
  pitch.position.set(0, 0.03, PITCH_LENGTH / 2);
  pitch.receiveShadow = true;
  scene.add(pitch);

  // popping crease lines (batsman end + bowler end), 2.5 ft in front of each stumps.
  // Width spans the wide guidelines with a small margin.
  const creaseMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  for (const z of [CREASE_DEPTH, PITCH_LENGTH - CREASE_DEPTH]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(WIDE_HALF_WIDTH * 2 + 0.6, 0.012, 0.08), creaseMat);
    line.position.set(0, 0.065, z);
    scene.add(line);
  }

  // wide guidelines: blue lines 2 ft either side of middle stump, full pitch length.
  // Anything passing the batsman crease outside these (untouched) is a wide.
  const wideMat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
  for (const x of [-WIDE_HALF_WIDTH, WIDE_HALF_WIDTH]) {
    const guide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, PITCH_LENGTH + 3), wideMat);
    guide.position.set(x, 0.065, PITCH_LENGTH / 2);
    scene.add(guide);
  }

  // leg-side wide markers (amber): strict down-leg line, just outside leg stump.
  // Untouched balls passing the crease outside these on the leg side are wides,
  // even when inside the blue lines — limited-overs style.
  const legWideMat = new THREE.MeshBasicMaterial({ color: 0xffb300 });
  for (const x of [-WIDE_LEG_HALF_WIDTH, WIDE_LEG_HALF_WIDTH]) {
    const guide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, PITCH_LENGTH + 3), legWideMat);
    guide.position.set(x, 0.062, PITCH_LENGTH / 2);
    scene.add(guide);
  }

  // 30-yard ring (dashed)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 });
  const dashes = 72;
  for (let i = 0; i < dashes; i += 2) {
    const a0 = (i / dashes) * Math.PI * 2;
    const a1 = ((i + 1) / dashes) * Math.PI * 2;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.012, 0.35), ringMat);
    const am = (a0 + a1) / 2;
    dash.position.set(
      Math.cos(am) * RING_RADIUS,
      0.006,
      PITCH_LENGTH / 2 + Math.sin(am) * RING_RADIUS
    );
    dash.rotation.y = -am + Math.PI / 2;
    scene.add(dash);
  }

  // boundary rope — a low torus
  const rope = new THREE.Mesh(
    new THREE.TorusGeometry(BOUNDARY_RADIUS, 0.14, 8, 96),
    new THREE.MeshLambertMaterial({ color: 0xffdd44 })
  );
  rope.rotation.x = -Math.PI / 2;
  rope.position.set(0, 0.05, PITCH_LENGTH / 2);
  scene.add(rope);
}

function makeStumps(scene, z) {
  // Dynamic stump set: 3 stumps (base-pivot so they topple) + 2 bails.
  // hit(ballX) tips the struck stump backwards and pops the bails;
  // update(dt) integrates the debris; reset() rebuilds the wicket.
  const group = new THREE.Group();
  group.position.set(0, 0.06, z);
  scene.add(group);
  const mat = new THREE.MeshLambertMaterial({ color: STUMP.color });
  const stumpGeo = new THREE.CylinderGeometry(STUMP.r, STUMP.r, STUMP.h, 8);
  stumpGeo.translate(0, STUMP.h / 2, 0); // pivot at the base for toppling
  const stumps = [];
  for (let i = -1; i <= 1; i++) {
    const s = new THREE.Mesh(stumpGeo, mat);
    s.position.set(i * (STUMP.gap + STUMP.r), 0, 0);
    s.castShadow = true;
    group.add(s);
    stumps.push(s);
  }
  const bailGeo = new THREE.BoxGeometry(0.09, 0.025, 0.03);
  const bailX = (STUMP.gap + STUMP.r) / 2;
  const bails = [];
  for (const bx of [-bailX, bailX]) {
    const b = new THREE.Mesh(bailGeo, mat);
    b.position.set(bx, STUMP.h + 0.012, 0);
    b.castShadow = true;
    group.add(b);
    bails.push({ mesh: b, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), live: false });
  }

  let tipT = -1; // >=0 => mid-scatter seconds
  let tippedIdx = 1;
  const randTip = () => (Math.random() - 0.5);

  function hit(ballX = 0) {
    if (tipT >= 0) return; // already scattered
    // stump nearest the impact goes over backwards (-z, toward the camera)
    let best = 1, bestD = Infinity;
    stumps.forEach((s, i) => {
      const d = Math.abs(s.position.x - ballX);
      if (d < bestD) { bestD = d; best = i; }
    });
    tippedIdx = best;
    tipT = 0;
    for (const b of bails) {
      b.live = true;
      b.vel.set(randTip() * 2.4, 2.4 + Math.random() * 1.6, -1.5 - Math.random() * 2.0);
      b.angVel.set(4 + Math.random() * 6, randTip() * 8, randTip() * 8);
    }
  }

  function update(dt) {
    if (tipT < 0) return;
    tipT += dt;
    // struck stump topples back ~70°, slides half a metre; neighbour wobbles
    const k = Math.min(1, tipT / 0.45);
    const ease = 1 - Math.pow(1 - k, 3);
    const s = stumps[tippedIdx];
    s.rotation.x = -1.25 * ease;
    s.position.z = -0.55 * ease;
    s.position.y = 0.04 * Math.sin(Math.min(k, 1) * Math.PI);
    for (let i = 0; i < stumps.length; i++) {
      if (i === tippedIdx) continue;
      stumps[i].rotation.x = -0.08 * Math.sin(Math.min(tipT * 9, Math.PI)) * Math.exp(-tipT * 2);
    }
    // bails: ballistic + one ground bounce, then rest
    for (const b of bails) {
      if (!b.live) continue;
      b.vel.y -= 12 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += b.angVel.x * dt;
      b.mesh.rotation.y += b.angVel.y * dt;
      b.mesh.rotation.z += b.angVel.z * dt;
      const floorY = -0.045; // group sits 0.06 above ground; bail half-height ~0.012
      if (b.mesh.position.y < floorY && b.vel.y < 0) {
        b.mesh.position.y = floorY;
        if (Math.abs(b.vel.y) > 0.8) {
          b.vel.y *= -0.35;
          b.vel.x *= 0.6; b.vel.z *= 0.6;
          b.angVel.multiplyScalar(0.4);
        } else {
          b.live = false; // rest where it fell — reads as "bails off"
        }
      }
    }
  }

  function reset() {
    tipT = -1;
    stumps.forEach((s, i) => {
      s.rotation.set(0, 0, 0);
      s.position.set(i * (STUMP.gap + STUMP.r), 0, 0);
    });
    bails.forEach((b, i) => {
      b.live = false;
      b.vel.set(0, 0, 0);
      b.angVel.set(0, 0, 0);
      b.mesh.rotation.set(0, 0, 0);
      b.mesh.position.set(i === 0 ? -bailX : bailX, STUMP.h + 0.012, 0);
    });
  }

  return { group, hit, update, reset };
}

// crowd = colourful boxes ringing the field, way cheaper than sprites
function makeCrowd(scene) {
  const colors = [0x37474f, 0x546e7a, 0x6d4c41, 0x5d4037, 0x263238, 0x004d40, 0x01579b];
  const geo = new THREE.BoxGeometry(2.6, 5.5, 2.6);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand(-0.06, 0.06);
    const r = BOUNDARY_RADIUS * rand(1.16, 1.34);
    const stand = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: colors[i % colors.length] })
    );
    stand.position.set(
      Math.cos(a) * r,
      rand(2.2, 3.4),
      PITCH_LENGTH / 2 + Math.sin(a) * r
    );
    stand.scale.y = rand(0.8, 1.6);
    scene.add(stand);
  }
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b9e0);
  scene.fog = new THREE.Fog(0x87b9e0, 90, 220);

  const camera = new THREE.PerspectiveCamera(
    CAMERA_SETUP.fov,
    window.innerWidth / window.innerHeight,
    0.1, 500
  );
  camera.position.set(...CAMERA_SETUP.position);
  camera.lookAt(...CAMERA_SETUP.lookAt);

  // lights
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(30, 60, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd4e6, 0.85));

  makeGround(scene);
  const stumpsBatter = makeStumps(scene, 0);
  const stumpsBowler = makeStumps(scene, PITCH_LENGTH);
  makeCrowd(scene);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, stumpsBatter, stumpsBowler };
}
