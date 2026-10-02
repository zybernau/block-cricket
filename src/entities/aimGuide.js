import * as THREE from 'three';

// Subtle shot-direction guide: a long, low-opacity yellow triangle lying on
// the turf, apex at the batsman's contact point, opening along the held aim.
// Deliberately faint (gradient fades to transparent) so it reads as a hint,
// not a spotlight. Enabled by main.js only on Easy/Medium.
export class AimGuide {
  constructor(scene, { length = 26, halfWidth = 6 } = {}) {
    this.length = length;
    this.halfWidth = halfWidth;

    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0, 0, 0,
      -halfWidth, 0, length,
      halfWidth, 0, length,
    ]);
    // apex samples the strong end of the gradient, far corners the clear end
    const uvs = new Float32Array([0.5, 0, 0, 1, 1, 1]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();

    this.mat = new THREE.MeshBasicMaterial({
      map: makeGradientTexture(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = 0.075; // just above the pitch top (0.06), avoids z-fighting
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // aimX/aimZ = normalized aim vector; stretch scales length (attack hits longer).
  update(x, z, aimX, aimZ, { visible, stretch = 1 } = {}) {
    this.mesh.visible = !!visible;
    if (!visible) return;
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.mesh.rotation.y = Math.atan2(aimX, aimZ);
    this.mesh.scale.z = stretch;
  }
}

// Yellow gradient, strong-but-subtle at the apex (v=0, canvas bottom),
// fading to fully clear at the far end, with soft lateral falloff so the
// cone edges melt into the grass.
function makeGradientTexture() {
  const w = 128, h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');

  const v = ctx.createLinearGradient(0, h, 0, 0);
  v.addColorStop(0, 'rgba(255, 213, 74, 0.30)');
  v.addColorStop(0.55, 'rgba(255, 213, 74, 0.13)');
  v.addColorStop(1, 'rgba(255, 213, 74, 0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'destination-in';
  const hz = ctx.createLinearGradient(0, 0, w, 0);
  hz.addColorStop(0, 'rgba(0,0,0,0)');
  hz.addColorStop(0.3, 'rgba(0,0,0,1)');
  hz.addColorStop(0.7, 'rgba(0,0,0,1)');
  hz.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
