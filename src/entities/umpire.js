import * as THREE from 'three';
import { buildBlockPerson } from '../scene.js';
import { PITCH_LENGTH } from '../constants.js';

// The umpire: dark blazer + white hat, posted behind the bowler-end stumps,
// facing the batsman. On OUT he raises the right arm straight overhead with
// the index finger extended. Entry point is signal(kind) so further signals
// (wide = both arms out, four = wave, six = both arms up) can plug in later.
export class Umpire {
  constructor(scene) {
    this.fig = buildBlockPerson(0x37474f);
    this.group = this.fig.group;

    // white hat
    const hat = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.09, 0.36),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })
    );
    hat.position.set(0, 0.97, 0);
    this.fig.torsoPivot.add(hat);

    // index finger on the right hand — reads once the arm goes up
    const finger = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.15, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xffcc80 })
    );
    finger.position.y = -0.62;
    this.fig.armR.add(finger);

    this.group.position.set(-2.4, 0, PITCH_LENGTH + 1.6);
    this.group.rotation.y = Math.PI; // face the batsman
    scene.add(this.group);

    this.signalT = -1; // <0 idle; >=0 seconds since the OUT signal started
  }

  // 'out' implemented; 'wide' | 'four' | 'six' reserved for later.
  signal(kind) {
    if (kind === 'out') this.signalT = 0;
  }

  reset() {
    this.signalT = -1;
    this.fig.armR.rotation.x = 0;
    this.fig.armR.rotation.z = 0;
  }

  update(dt) {
    if (this.signalT < 0) return;
    this.signalT += dt;
    const t = this.signalT;
    // raise over 0.3s, hold to 1.8s, lower by 2.2s
    let k;
    if (t < 0.3) k = t / 0.3;
    else if (t < 1.8) k = 1;
    else if (t < 2.2) k = 1 - (t - 1.8) / 0.4;
    else { this.reset(); return; }
    this.fig.armR.rotation.x = -Math.PI * k; // right arm straight up overhead
    this.fig.armR.rotation.z = 0;
  }
}
