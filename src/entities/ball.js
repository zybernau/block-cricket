import * as THREE from 'three';
import { BALL, SPIN_RETENTION } from '../constants.js';

export class Ball {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(BALL.radius, 14, 10);
    const mat = new THREE.MeshLambertMaterial({ color: BALL.color });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.accel = new THREE.Vector3();  // used for swing curve
    this.active = false;               // physics running
    this.hit = false;                  // true once batsman hits it
  }

  throwFrom(pos, vel, lateralAccel = 0) {
    this.pos.copy(pos);
    this.vel.copy(vel);
    this.accel.set(lateralAccel, 0, 0);
    this.active = true;
    this.hit = false;
    this.mesh.visible = true;
  }

  stop() {
    this.active = false;
    this.vel.set(0, 0, 0);
    this.accel.set(0, 0, 0);
  }

  hide() {
    this.active = false;
    this.mesh.visible = false;
  }

  // apply batting impulse
  launch(dirX, dirZ, speed, elevationDeg) {
    const el = THREE.MathUtils.degToRad(elevationDeg);
    this.vel.set(dirX * speed * Math.cos(el), speed * Math.sin(el), dirZ * speed * Math.cos(el));
    this.accel.set(0, 0, 0);
    this.hit = true;
  }

  update(dt, gravity) {
    if (!this.active) return;
    this.vel.y += gravity * dt;
    this.vel.addScaledVector(this.accel, dt);

    // ground drag for shots
    if (this.hit && this.pos.y <= BALL.radius + 0.02 && Math.abs(this.vel.y) < 3.5) {
      const drag = BALL.rollFriction * dt;
      const hv = Math.hypot(this.vel.x, this.vel.z);
      if (hv > 0) {
        const f = Math.max(0, hv - drag) / hv;
        this.vel.x *= f; this.vel.z *= f;
      }
    }

    this.pos.addScaledVector(this.vel, dt);

    // bounce
    if (this.pos.y < BALL.radius) {
      this.pos.y = BALL.radius;
      if (this.vel.y < 0) this.vel.y = -this.vel.y * BALL.bounciness;
      if (this.vel.y < 0.6) this.vel.y = 0;
      // Swing dies at the bounce — only a fraction carries on as seam/spin
      // drift. Without this, big in-flight accel keeps pushing post-bounce
      // and turns legal lines (esp. slow spin) into accidental wides.
      if (!this.hit) this.accel.x *= SPIN_RETENTION;
    }

    this.mesh.position.copy(this.pos);
  }
}
