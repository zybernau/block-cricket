import * as THREE from 'three';
import { BATSMAN, BAT_LENGTH, PITCH_LENGTH, STANCES, shotZoneFor, SHOT_TURN_MAX } from '../constants.js';
import { clamp } from '../utils.js';
import { buildBlockPerson, FIG_HIP_Y } from '../scene.js';
import { getMoveVector, getAimVector, attackMode } from '../input.js';

// Real side-on stance (see STANCES in constants.js), rebuilt so handedness
// reads from behind (camera at -z): feet split across the crease with the
// front foot edged toward the bowler, torso yawed side-on (chest to the off
// side), bat grounded behind the back foot on the LEG side with the toe
// pointing back at the keeper. RHB and LHB mirror every cue: guard offset,
// shoulder line, bat side, front foot.
//
// A2 physics: the stance is expressed as a target-pose record (stanceTargets)
// so the swing can (a) shift weight — pelvis drifts toward the shot, lead
// knee extends while the back knee loads — and (b) settle back to stance with
// a spring-damper ease (easeOutBack) instead of snapping.
const TORSO_Y = 0.78; // knees flexed (was 0.82: upright block)

// ease-out with a slight overshoot past 1, then settle — reads as a spring
const easeOutBack = (k) => {
  const c1 = 1.2, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

export class Batsman {
  constructor(scene) {
    this.fig = buildBlockPerson(BATSMAN.color);
    this.group = new THREE.Group();
    this.group.add(this.fig.group);
    scene.add(this.group);

    // bat — pivot group so we can animate a swing arc
    this.batPivot = new THREE.Group();
    const bat = new THREE.Mesh(
      new THREE.BoxGeometry(BATSMAN.batBlade.w, BAT_LENGTH, BATSMAN.batBlade.d),
      new THREE.MeshLambertMaterial({ color: BATSMAN.batColor })
    );
    bat.position.y = -BAT_LENGTH / 2; // hang below the pivot (handle at pivot point)
    bat.castShadow = true;
    this.batPivot.add(bat);
    this.group.add(this.batPivot);

    this.hand = 'R';      // 'R' = right-hander (guards +x), 'L' mirrors everything
    this.mirror = 1;
    this.locked = false;  // true for the non-striker: no movement, never swings
    this.home = { x: BATSMAN.homeX, z: BATSMAN.homeZ };
    this.pos = { ...this.home };
    this.swingT = -1;      // >=0 => mid-swing (seconds since started)
    this.recoverT = -1;    // >=0 => springing back to stance after follow-through
    this.recoverFrom = null;
    this.windup = false;   // true from bowler release until swing/reset
    this.guard = false;    // true at IDLE: guard-tap animation
    this.idleT = 0;        // guard-tap clock
    this.attack = false;
    this.swingAim = { x: 0, z: 1 }; // latched aim for the current swing
    this.swingAngle = 0;            // atan2(swingAim.x, swingAim.z): 0 = straight
    this.swingLength = null;        // delivery length latched for footwork (A3)
    this.pose = shotZoneFor(0, 'R'); // latched SHOT_ZONES record for the swing
    this.applyStance();
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  // Switch the striker: RHB guards just leg-side of middle, LHB mirrors.
  // (Skipped for the locked non-striker — he keeps his bowler-end spot.)
  setHandedness(hand) {
    this.hand = hand === 'L' ? 'L' : 'R';
    this.mirror = this.hand === 'L' ? -1 : 1;
    if (!this.locked) {
      this.home.x = this.mirror * BATSMAN.guardOffset;
      this.home.z = BATSMAN.homeZ;
      this.pos = { ...this.home };
    }
    this.recoverT = -1;
    this.applyStance();
    this.sync();
  }

  // Park this figure as the non-striker (runner) at the bowler end:
  // behind the popping crease, opposite side of the stumps, facing the striker.
  placeAtBowlerEnd() {
    this.locked = true;
    this.home = { x: -0.55 * this.mirror, z: PITCH_LENGTH - 0.45 };
    this.pos = { ...this.home };
    this.group.rotation.y = Math.PI; // face back down the pitch at the striker
    this.recoverT = -1;
    this.applyStance();
    this.sync();
  }

  // guard-tap animation on/off (main.js sets it during the IDLE step)
  setGuard(on) {
    if (this.guard === on) return;
    this.guard = on;
    if (on) this.idleT = 0;
  }

  reset() {
    this.pos = { ...this.home };
    this.swingT = -1;
    this.recoverT = -1;
    this.windup = false;
    this.applyStance();
    this.sync();
  }

  // softly return to stance (dot ball / after shot resolved)
  relax() {
    this.swingT = -1;
    this.recoverT = -1;
    this.windup = false;
    this.swingAim = { x: 0, z: 1 };
    this.swingAngle = 0;
    this.swingLength = null;
    this.pose = shotZoneFor(0, this.hand);
    this.applyStance();
  }

  // Target pose for the current handedness — the single source of truth for
  // the stance (applyStance applies it; swing recovery blends toward it).
  stanceTargets() {
    const S = STANCES[this.hand] || STANCES.R;
    const m = this.mirror;
    const leadIsL = m > 0;
    return {
      torsoRot: [S.torsoHunch, S.torsoYaw * m, -S.torsoTilt * m],
      torsoY: TORSO_Y,
      // hip pivots: spread across the crease, front foot edged toward the
      // bowler, both hips settled slightly toward the back foot (weight back)
      legL: [-S.footSpread, FIG_HIP_Y, (leadIsL ? S.footStep : -0.02) - S.weightBack],
      legR: [S.footSpread, FIG_HIP_Y, (leadIsL ? -0.02 : S.footStep) - S.weightBack],
      knee: S.kneeFlex,
      // both hands down to the bat, grounded behind the back foot on the leg side
      armRot: [-0.55, 0, -0.35 * m],
      batPos: [S.batX * m, S.batY, -0.15],
      batRot: [-0.15, 0, S.batTilt * m], // toe down, angled out
    };
  }

  applyStance() {
    const t = this.stanceTargets();
    this.fig.torsoPivot.rotation.set(t.torsoRot[0], t.torsoRot[1], t.torsoRot[2]);
    this.fig.torsoPivot.position.y = t.torsoY; // undo swing crouch
    this.fig.legL.position.set(t.legL[0], t.legL[1], t.legL[2]);
    this.fig.legR.position.set(t.legR[0], t.legR[1], t.legR[2]);
    this.fig.kneeL.rotation.x = t.knee;
    this.fig.kneeR.rotation.x = t.knee;
    this.fig.armL.rotation.set(t.armRot[0], t.armRot[1], t.armRot[2]);
    this.fig.armR.rotation.set(t.armRot[0], t.armRot[1], t.armRot[2]);
    this.batPivot.position.set(t.batPos[0], t.batPos[1], t.batPos[2]);
    this.batPivot.rotation.set(t.batRot[0], t.batRot[1], t.batRot[2]);
    this.swingAim = { x: 0, z: 1 };
    this.swingAngle = 0;
    this.swingLength = null;
    this.pose = shotZoneFor(0, this.hand);
  }

  // snapshot the current articulated pose (for the spring recovery)
  capturePose() {
    const tp = this.fig.torsoPivot;
    return {
      torsoRot: [tp.rotation.x, tp.rotation.y, tp.rotation.z],
      torsoY: tp.position.y,
      legL: [this.fig.legL.position.x, this.fig.legL.position.y, this.fig.legL.position.z],
      legR: [this.fig.legR.position.x, this.fig.legR.position.y, this.fig.legR.position.z],
      kneeL: this.fig.kneeL.rotation.x,
      kneeR: this.fig.kneeR.rotation.x,
      armL: [this.fig.armL.rotation.x, this.fig.armL.rotation.y, this.fig.armL.rotation.z],
      armR: [this.fig.armR.rotation.x, this.fig.armR.rotation.y, this.fig.armR.rotation.z],
      batPos: [this.batPivot.position.x, this.batPivot.position.y, this.batPivot.position.z],
      batRot: [this.batPivot.rotation.x, this.batPivot.rotation.y, this.batPivot.rotation.z],
    };
  }

  // lerp every pose component from `a` toward the stance targets by k
  blendPose(a, k) {
    const to = this.stanceTargets();
    const L = (x, y) => x + (y - x) * k;
    this.fig.torsoPivot.rotation.set(L(a.torsoRot[0], to.torsoRot[0]), L(a.torsoRot[1], to.torsoRot[1]), L(a.torsoRot[2], to.torsoRot[2]));
    this.fig.torsoPivot.position.y = L(a.torsoY, to.torsoY);
    this.fig.legL.position.set(L(a.legL[0], to.legL[0]), L(a.legL[1], to.legL[1]), L(a.legL[2], to.legL[2]));
    this.fig.legR.position.set(L(a.legR[0], to.legR[0]), L(a.legR[1], to.legR[1]), L(a.legR[2], to.legR[2]));
    this.fig.kneeL.rotation.x = L(a.kneeL, to.knee);
    this.fig.kneeR.rotation.x = L(a.kneeR, to.knee);
    this.fig.armL.rotation.set(L(a.armL[0], to.armRot[0]), L(a.armL[1], to.armRot[1]), L(a.armL[2], to.armRot[2]));
    this.fig.armR.rotation.set(L(a.armR[0], to.armRot[0]), L(a.armR[1], to.armRot[1]), L(a.armR[2], to.armRot[2]));
    this.batPivot.position.set(L(a.batPos[0], to.batPos[0]), L(a.batPos[1], to.batPos[1]), L(a.batPos[2], to.batPos[2]));
    this.batPivot.rotation.set(L(a.batRot[0], to.batRot[0]), L(a.batRot[1], to.batRot[1]), L(a.batRot[2], to.batRot[2]));
  }

  // begin forward press + backlift as bowler approaches
  beginWindup() {
    if (this.swingT >= 0) return;
    this.recoverT = -1;   // windup pose overrides any in-flight recovery
    this.guard = false;
    this.windup = true;
    const S = STANCES[this.hand] || STANCES.R;
    this.fig.torsoPivot.rotation.x = 0.42;
    this.fig.armL.rotation.x = -1.1;                  // hands pick up together
    this.fig.armR.rotation.x = -1.2;
    // attack mode: bigger backlift
    this.batPivot.rotation.x = this.attack ? -1.9 : -1.3;
    // settle onto the back foot while the bowler charges in
    const t = this.stanceTargets();
    this.fig.legL.position.set(t.legL[0], FIG_HIP_Y, t.legL[2] - S.weightBack);
    this.fig.legR.position.set(t.legR[0], FIG_HIP_Y, t.legR[2] - S.weightBack);
  }

  startSwing(aim, delivery = null) {
    if (this.swingT >= 0 || this.locked) return false;
    // Latch the held aim so the animation matches the shot direction
    // (same vector contact.js resolves the ball with) + the delivery length
    // for footwork (A3: front foot to full/yorker, back and across to short).
    const a = aim || getAimVector();
    this.swingAim = { x: a.x, z: a.z };
    this.swingAngle = Math.atan2(a.x, a.z);
    this.pose = shotZoneFor(this.swingAngle, this.hand);
    this.swingLength = delivery?.length?.name ?? null;
    this.swingT = 0;
    return true;
  }

  update(dt) {
    this.attack = attackMode();

    // movement allowed when not mid-swing (never for the locked non-striker)
    if (this.swingT < 0 && this.recoverT < 0 && !this.locked) {
      const mv = getMoveVector();
      this.pos.x = clamp(
        this.pos.x + mv.x * BATSMAN.moveSpeed * dt,
        BATSMAN.minX, BATSMAN.maxX
      );
      this.pos.z = clamp(
        this.pos.z + mv.z * BATSMAN.moveSpeed * dt,
        BATSMAN.minZ, BATSMAN.maxZ
      );
    }

    // swing animation — pose-driven per SHOT_ZONES: vertical bat for drives /
    // glances, horizontal bat for cuts / pulls / sweeps, plus crouch (dip),
    // weight transfer (pelvis + knees), front-foot stride, sideways lean and a
    // clamped torso turn.
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = this.swingT / BATSMAN.swingDuration;
      if (t >= 1) {
        this.swingT = -1;
        // spring back to stance from the follow-through pose (no snap)
        this.recoverT = 0;
        this.recoverFrom = this.capturePose();
      } else {
        const pose = this.pose || shotZoneFor(0, this.hand);
        // arc: starts high/back at t=0, whips through the ball at t≈0.45, follows through
        const backlift = (this.attack ? -1.9 : -1.3) + pose.lift;
        const follow = (this.attack ? -3.4 : -2.9) + pose.followOff;
        const downSwing = THREE.MathUtils.lerp(backlift, follow, Math.pow(t, 1.6));
        const side = this.swingAngle >= 0 ? 1 : -1; // +x (screen-left) vs -x (screen-right)
        const rawTurn = Math.min(Math.abs(this.swingAngle), Math.PI) * side;
        const turn = THREE.MathUtils.clamp(rawTurn, -SHOT_TURN_MAX, SHOT_TURN_MAX);
        const ease = Math.sin(Math.min(t * 1.15, 1) * Math.PI * 0.5); // fast turn, hold follow-through
        const sway = Math.sin(t * Math.PI); // 0 -> 1 -> 0 across the swing
        const baseRoll = this.attack ? 0.9 : 0.5;
        const rollMax = baseRoll + (pose.roll - baseRoll) * pose.plane;
        this.batPivot.rotation.x = downSwing;
        this.batPivot.rotation.y = turn * 0.7 * ease;
        this.batPivot.rotation.z = sway * rollMax * (Math.abs(turn) < 0.05 ? this.mirror : side);
        this.batPivot.position.x = STANCES[this.hand].batX * this.mirror + Math.sin(turn) * 0.35 * ease;
        // body: unwind from the side-on base toward the shot (scaled), lean
        // sideways, hunch, dip — handedness stays readable mid-swing.
        this.fig.torsoPivot.rotation.y = STANCES[this.hand].torsoYaw * this.mirror + turn * pose.yawMul * ease;
        this.fig.torsoPivot.rotation.z = -STANCES[this.hand].torsoTilt * this.mirror - side * pose.lean * sway;
        this.fig.torsoPivot.rotation.x = STANCES[this.hand].torsoHunch + pose.pitch * sway;
        this.fig.torsoPivot.position.y = TORSO_Y - pose.crouch * sway;
        // weight transfer (A2): pelvis drifts toward the shot (the group
        // offset in sync() is the lunge — this is the relative hip shift),
        // lead knee extends, back knee loads
        const st = this.stanceTargets();
        const leadIsL = this.mirror > 0;
        const dx = pose.stride[0] * sway * 0.35;
        const dz = pose.stride[1] * sway * 0.35;
        this.fig.legL.position.set(st.legL[0] + dx, FIG_HIP_Y, st.legL[2] + dz);
        this.fig.legR.position.set(st.legR[0] + dx, FIG_HIP_Y, st.legR[2] + dz);
        const leadKnee = leadIsL ? this.fig.kneeL : this.fig.kneeR;
        const backKnee = leadIsL ? this.fig.kneeR : this.fig.kneeL;
        leadKnee.rotation.x = st.knee * (1 - sway * 0.8);
        backKnee.rotation.x = st.knee + sway * 0.3;
      }
    } else if (this.recoverT >= 0) {
      // spring-damper return to stance after the follow-through
      this.recoverT += dt;
      const k = Math.min(1, this.recoverT / BATSMAN.recoverDuration);
      this.blendPose(this.recoverFrom || this.capturePose(), easeOutBack(k));
      if (k >= 1) {
        this.recoverT = -1;
        this.applyStance();
      }
    } else if (this.windup) {
      // subtle pre-aim lean around the side-on base, so the held direction
      // reads before the swing without losing handedness
      const a = getAimVector();
      const ang = Math.atan2(a.x, a.z);
      const idle = a.idle ? 0 : 1;
      this.fig.torsoPivot.rotation.y = STANCES[this.hand].torsoYaw * this.mirror + ang * 0.25 * idle;
      this.batPivot.rotation.y = ang * 0.2 * idle;
    } else if (this.guard) {
      // guard tap (A2): bat tips to the crease and back, tiny crouch bob
      this.idleT += dt;
      const tap = Math.abs(Math.sin(this.idleT * BATSMAN.guardTapSpeed));
      this.batPivot.rotation.x = -0.15 - tap * 0.22;
      this.fig.torsoPivot.position.y = TORSO_Y - tap * 0.02;
    }

    this.sync();
  }

  sync() {
    // front-foot stride toward the shot, swelling mid-swing then recovering;
    // scaled by the delivery length (A3 footwork: back and across to short,
    // bigger stride to the yorker)
    let ox = 0, oz = 0;
    if (this.swingT >= 0 && this.pose) {
      const t = Math.min(this.swingT / BATSMAN.swingDuration, 1);
      const s = Math.sin(t * Math.PI);
      let footMul = 1, footDz = 0;
      if (this.swingLength === 'short') { footMul = 0.7; footDz = -0.12; }
      else if (this.swingLength === 'yorker') { footMul = 1.25; footDz = 0.1; }
      ox = this.pose.stride[0] * footMul * s;
      oz = (this.pose.stride[1] * footMul + footDz) * s;
    }
    this.group.position.set(this.pos.x + ox, 0, this.pos.z + oz);
  }

  highlight(on) {
    this.fig.torsoPivot.children[0].material.emissive = new THREE.Color(on ? 0x553311 : 0x000000);
  }
}
