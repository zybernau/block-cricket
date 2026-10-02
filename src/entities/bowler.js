import { BOWLER } from '../constants.js';
import { buildBlockPerson } from '../scene.js';

// Bowler states: IDLE (top of run-up, hands on hips) → RUNUP → RELEASED.
export class Bowler {
  constructor(scene) {
    this.fig = buildBlockPerson(BOWLER.color);
    this.group = this.fig.group;
    scene.add(this.group);
    this.sideX = 0.9; // run-up x: +0.9 right-arm over, -0.9 left-arm, +0.6 spin
    this.reset();
  }

  // adopt a BOWLER_TYPES side (called when a new bowler takes the ball each over)
  setSide(x) { this.sideX = x; }

  reset() {
    this.pos = { x: this.sideX, z: BOWLER.homeZ };
    this.state = 'IDLE';
    this.sync();
    // hands-on-hips idle pose
    this.fig.armL.rotation.z = 0.9; this.fig.armR.rotation.z = -0.9;
    this.fig.armL.rotation.x = 0; this.fig.armR.rotation.x = 0;
    this.fig.kneeL.rotation.x = 0; this.fig.kneeR.rotation.x = 0;
    this.fig.elbowL.rotation.x = 0; this.fig.elbowR.rotation.x = 0;
    this.fig.torsoPivot.rotation.set(0, 0, 0);
  }

  startRunup() { if (this.state === 'IDLE') this.state = 'RUNUP'; }

  // returns true exactly on the frame the ball is released
  update(dt) {
    if (this.state !== 'RUNUP') return false;

    const distToRelease = this.pos.z - BOWLER.releaseZ;
    const moving = distToRelease > 0.1;

    if (moving) {
      this.pos.z -= BOWLER.runupSpeed * dt;

      // jogging legs + knees scissoring + pumping arms (time-based wiggle)
      this.animT = (this.animT || 0) + dt;
      const phase = this.animT * BOWLER.runupSpeed * 0.45;
      this.fig.legL.rotation.x = Math.sin(phase) * 0.9;
      this.fig.legR.rotation.x = -Math.sin(phase) * 0.9;
      this.fig.kneeL.rotation.x = Math.max(0, Math.sin(phase)) * 1.1;
      this.fig.kneeR.rotation.x = Math.max(0, -Math.sin(phase)) * 1.1;
      this.fig.armL.rotation.x = Math.sin(phase) * 0.8;
      this.fig.armR.rotation.x = -Math.sin(phase) * 0.8;
      this.fig.elbowL.rotation.x = -0.7; this.fig.elbowR.rotation.x = -0.7; // elbows bent while pumping
      this.fig.armL.rotation.z = 0.15; this.fig.armR.rotation.z = -0.15;
    }

    // final 2 metres: rear up, both arms overhead, knees extend into the jump
    if (!moving || distToRelease < 2.2) {
      this.fig.armR.rotation.x = -Math.PI;          // bowling arm straight up
      this.fig.armL.rotation.x = -Math.PI / 2;      // front arm leading
      this.fig.elbowR.rotation.x = 0;               // bowling arm fully extended
      this.fig.elbowL.rotation.x = -0.3;
      this.fig.kneeL.rotation.x = 0.25; this.fig.kneeR.rotation.x = 0.25;
      this.fig.torsoPivot.rotation.x = -0.18;       // back arch
    }

    this.sync();

    if (!moving || distToRelease <= 0.11 * BOWLER.runupSpeed) {
      this.state = 'RELEASED';
      return true;                                   // ball release this frame
    }
    return false;
  }

  sync() { this.group.position.set(this.pos.x, 0, this.pos.z); }
}
