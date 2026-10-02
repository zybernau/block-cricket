// Keyboard state registry — WASD move, arrows aim, space swing, shift attack, R restart.
const pressed = new Set();
const justPressed = new Set();

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function initInput() {
  window.addEventListener('keydown', (e) => {
    // typing in the custom-overs box must not swing/aim/start the game
    if (e.target && e.target.tagName === 'INPUT') return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!pressed.has(e.code)) justPressed.add(e.code);
    pressed.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    pressed.delete(e.code);
  });
  window.addEventListener('blur', () => pressed.clear());
}

export function isDown(code) { return pressed.has(code); }
export function wasPressed(code) { return justPressed.has(code); }

// call at END of each frame
export function flushJustPressed() { justPressed.clear(); }

// ---- Semantic helpers ----
// World mapping for the behind-the-stumps camera (eye at -z, looking +z):
// screen-up = +z (down the pitch), screen-down = -z,
// screen-right = -x, screen-left = +x.
// The batsman faces +z (toward the bowler, back to camera), so his
// right hand is also screen-right (-x) — screen and batsman agree.
export function getMoveVector() {
  let x = 0, z = 0;
  if (isDown('KeyW')) z += 1;
  if (isDown('KeyS')) z -= 1;
  if (isDown('KeyA')) x += 1; // screen-left
  if (isDown('KeyD')) x -= 1; // screen-right
  // normalize so diagonals aren't faster
  if (x !== 0 && z !== 0) { x *= Math.SQRT1_2; z *= Math.SQRT1_2; }
  return { x, z };
}

// Aim: arrow keys -> shot direction, screen-relative AND batsman-relative
// (they coincide for this camera). Up = straight down the ground (+z),
// Left = screen-left = batsman's left (+x), Right = screen-right (-x).
export function getAimVector() {
  let x = 0, z = 0;
  if (isDown('ArrowUp')) z += 1;
  if (isDown('ArrowDown')) z -= 1;
  if (isDown('ArrowLeft')) x += 1;
  if (isDown('ArrowRight')) x -= 1;
  if (x === 0 && z === 0) return { x: 0, z: 1, idle: true }; // default straight
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len, idle: false };
}

export function attackMode() { return isDown('ShiftLeft') || isDown('ShiftRight'); }
export function swingPressed() { return wasPressed('Space'); }
export function restartPressed() { return wasPressed('KeyR'); }
