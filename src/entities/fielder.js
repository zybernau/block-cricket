import * as THREE from 'three';
import { FIELDERS, FIELD_SETS, PERSON, RING_RADIUS, SIGHTLINE } from '../constants.js';
import { buildBlockPerson } from '../scene.js';

// Fielders (incl. keeper + bowler stand-ins) with catch/check radii.
// Dynamic: setFormation(name, hand) retargets all units by game situation
// (attacking / spin squeeze / defensive…). The field moves ONLY while
// setting === true (step 2 of the game flow) — update(dt) freezes them once
// they reach their spots, and they stay static through the delivery (step 3).
// X targets mirror for LHB so off/leg-side fielders stay on the correct side
// of the new striker.
//
// Visibility guarantee: no set places anyone in the central sightline
// corridor (see FIELD_SETS), the keeper crouches low and off the camera
// axis, and any fielder that drifts between the camera and the action is
// faded out dynamically via updateVisibility().
export class FieldingTeam {
  constructor(scene) {
    this.units = [];
    this.formation = 'balanced';
    this.setting = false;   // true only during the field-setting step (B2/B3)
    for (const f of FIELDERS) {
      const color = f.isKeeper ? 0xe0c080 : 0x388e3c;
      const fig = buildBlockPerson(color);
      fig.group.position.set(f.pos[0], 0, f.pos[1]);
      fig.group.rotation.y = 0.4;
      scene.add(fig.group);
      const unit = { name: f.name, isKeeper: !!f.isKeeper, fig, x: f.pos[0], z: f.pos[1], tx: f.pos[0], tz: f.pos[1], faded: false, hopT: -1 };
      if (unit.isKeeper) {
        // crouch low + stay off the camera axis so the keeper never
        // blocks the view of the pitch.
        fig.group.scale.y = 0.72;
        fig.torsoPivot.rotation.x = 0.5;
      }
      this._collectMaterials(unit);
      this.units.push(unit);
    }
  }

  // Retarget the field; returns true when the set actually changed.
  setFormation(name, hand = 'R') {
    const set = FIELD_SETS[name];
    if (!set) return false;
    const mirror = hand === 'L' ? -1 : 1;
    for (const u of this.units) {
      const p = set.pos[u.name];
      if (!p) continue;
      u.tx = p[0] * mirror;
      // keeper stays on his side of the stumps rather than crossing over
      if (u.isKeeper) u.tx = p[0];
      u.tz = p[1];
    }
    const changed = this.formation !== name;
    this.formation = name;
    return changed;
  }

  // field-setting gate (B2/B3): the field only walks while setting is true —
  // once frozen (false) fielders stay static until the next resolution.
  setSetting(on) {
    this.setting = !!on;
  }

  // walk/jog the field toward its targets — ONLY while setting === true
  // (step 2). Once the field is set they freeze (step 3) and never move
  // during the run-up/delivery. The hop celebration always animates.
  update(dt) {
    const step = (this.setting ? 6.0 : 3.5) * dt; // brisk jog to position
    for (const u of this.units) {
      if (this.setting) {
        const dx = u.tx - u.x, dz = u.tz - u.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4) {
          const k = Math.min(1, step / d);
          u.x += dx * k;
          u.z += dz * k;
        }
      }
      // celebration hop: fading tuck-jumps after a catch
      let hopY = 0;
      if (u.hopT >= 0) {
        u.hopT += dt;
        const k = u.hopT / 1.2;
        if (k >= 1) u.hopT = -1;
        else {
          hopY = Math.abs(Math.sin(u.hopT * 9)) * 0.22 * (1 - k);
          const tuck = hopY > 0.02 ? 0.7 : 0;
          u.fig.kneeL.rotation.x = tuck;
          u.fig.kneeR.rotation.x = tuck;
        }
      }
      u.fig.group.position.set(u.x, hopY, u.z);
      // face the pitch centre while on the move
      u.fig.group.rotation.y = Math.atan2(-u.x, 10 - u.z);
    }
  }

  // true when every fielder has reached his spot (field-setting step done)
  settled() {
    return this.units.every((u) => Math.hypot(u.tx - u.x, u.tz - u.z) < 0.05);
  }

  _collectMaterials(unit) {
    unit.mats = [];
    unit.fig.group.traverse((o) => {
      if (o.isMesh) {
        o.material.transparent = true;
        unit.mats.push(o.material);
      }
    });
  }

  _setFaded(unit, faded) {
    if (unit.faded === faded) return;
    unit.faded = faded;
    const opacity = faded ? SIGHTLINE.fadedOpacity : 1.0;
    for (const m of unit.mats) {
      m.opacity = opacity;
      m.depthWrite = !faded;
    }
  }

  // Fade any fielder sitting on the camera->focus segment so the
  // batsman always has an unobstructed view of the ball.
  // Call every frame with the current camera pos and one or two foci
  // (batsman contact point + ball when live).
  updateVisibility(camPos, foci) {
    const fadeR2 = SIGHTLINE.fadeRadius * SIGHTLINE.fadeRadius;
    const list = Array.isArray(foci) ? foci : [foci];
    for (const u of this.units) {
      // keeper stays faded only if truly in the way — with the new
      // offset position he usually isn't, but keep the safety net.
      const p = new THREE.Vector3(u.x, 1.0, u.z);
      let block = false;
      for (const focus of list) {
        const f = new THREE.Vector3(focus.x, focus.y ?? 1.0, focus.z);
        const camToF = new THREE.Vector3().subVectors(f, camPos);
        const len2 = camToF.lengthSq();
        if (len2 < 1e-6) continue;
        const t = new THREE.Vector3().subVectors(p, camPos).dot(camToF) / len2;
        // strictly between camera and focus (with a small margin)
        if (t > 0.02 && t < 0.985) {
          const closest = new THREE.Vector3().copy(camPos).addScaledVector(camToF, t);
          if (closest.distanceToSquared(p) < fadeR2) { block = true; break; }
        }
      }
      this._setFaded(u, block);
    }
  }

  // first fielder within radius of (x,z) or null
  nearest(x, z, radius) {
    let best = null, bestD = radius;
    for (const u of this.units) {
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  // celebrate a caught ball: fading hop (animated in update) + hands up
  celebrate(name) {
    const u = this.units.find((u) => u.name === name);
    if (!u) return;
    u.hopT = 0;
    u.fig.armL.rotation.z = Math.PI; u.fig.armR.rotation.z = Math.PI;
  }

  reset() {
    for (const u of this.units) {
      u.hopT = -1;
      u.fig.kneeL.rotation.x = 0; u.fig.kneeR.rotation.x = 0;
      u.fig.armL.rotation.z = 0; u.fig.armR.rotation.z = 0;
    }
  }
}
