import * as THREE from 'three';
import { createScene } from './scene.js';
import { initInput, flushJustPressed, swingPressed, restartPressed, attackMode, wasPressed, getAimVector } from './input.js';
import * as hud from './ui/hud.js';
import { Ball } from './entities/ball.js';
import { Batsman } from './entities/batsman.js';
import { Bowler } from './entities/bowler.js';
import { FieldingTeam } from './entities/fielder.js';
import { AimGuide } from './entities/aimGuide.js';
import { Umpire } from './entities/umpire.js';
import { BowlingEngine } from './systems/bowlingEngine.js';
import { Match } from './systems/match.js';
import { resolveSwing } from './systems/contact.js';
import { planNextBall, chooseField } from './systems/gameflow.js';
import { awardRuns, distFromCentre } from './systems/scoring.js';
import { pick } from './utils.js';
import {
  GRAVITY, BALL, PITCH_LENGTH, RING_RADIUS, BOUNDARY_RADIUS,
  CATCH_MAX_HEIGHT, BOWLER, CAMERA_SETUP, CREASE_DEPTH,
  WIDE_RUNS, BATTING_ORDER, DEFAULT_OVERS,
  BOWLER_TYPES, MATCH, PRESSURE, FIELD_SETS, isWideAtCrease,
  DIFFICULTY_LEVELS, DIFFICULTY_ORDER,
  setDifficulty, getDifficulty, getDifficultyKey,
} from './constants.js';

// ============================================================
// State machine — step-driven game flow (B0–B5):
//   MENU       difficulty select (before first ball / after game over)
//   PLAN       step 1 — set bowling parameters from the previous shot
//   FIELDSET   step 2 — fielders walk to their spots (powerplay rule)
//   FREEZE     step 3 — field set, they will not move
//   IDLE       step 4 — batsman takes guard (guard-tap), then bowls
//   RUNUP      bowler running in
//   DELIVERY   ball in flight — batsman may swing (Space)
//   SHOT       ball in play after contact
//   SETTLE     step 5 — outcome recorded, then back to PLAN (or game over)
//   GAMEOVER
// ============================================================
let state = 'MENU';
let stateT = 0;
const setState = (s) => { state = s; stateT = 0; };
const PLAN_WAIT = 0.9;
const FREEZE_WAIT = 0.45;
const FIELDSET_TIMEOUT = 2.8; // freeze anyway if the walk somehow overruns
const IDLE_WAIT = 0.55;
const SETTLE_WAIT = 1.0;

let renderer, scene, camera, stumpsBatter;
let ball, batsman, nonStriker, bowler, umpire, fielders, match, aimGuide;
let currentBowler = BOWLER_TYPES[0]; // fresh type takes the ball each over
let currentPlan = null;          // step-1 bowling plan (feeds BowlingEngine)
let currentField = 'balanced';   // step-2 field set (set once, then frozen)
let delivery = null;
let swingOutcome = null;        // latched when Space is pressed
let resolutionKind = null;      // set when the ball's fate is decided
let resolutionData = null;
let pendingDifficulty = 'hard'; // highlighted on the start screen
let pendingOvers = DEFAULT_OVERS; // chosen overs (5/10/20/custom)

// zoomed-in dramatic camera when a shot is hit
const BASE_CAM_POS = new THREE.Vector3(...CAMERA_SETUP.position);
const BASE_CAM_LOOK = new THREE.Vector3(...CAMERA_SETUP.lookAt);
const camLook = BASE_CAM_LOOK.clone();
const camPos = BASE_CAM_POS.clone();

function applyDifficulty(key) {
  pendingDifficulty = key;
  setDifficulty(key);
  hud.markSelectedDifficulty(key);
  hud.setDifficultyBadge(key, DIFFICULTY_LEVELS[key].label);
}

function sendInNextBatter() {
  // order index = wickets fallen: 0 -> opener, 1, 2 -> last man (left-hander)
  const hand = BATTING_ORDER[Math.min(match.wickets, BATTING_ORDER.length - 1)];
  batsman.setHandedness(hand);
  hud.setHand(hand);
}

function startFromMenu() {
  applyDifficulty(pendingDifficulty);
  match.reset();
  match.setOvers(pendingOvers);
  sendInNextBatter();
  hud.updateScoreboard(match);
  hud.updateBallReel(match);
  hud.hideGameOver();
  hud.hideStartScreen();
  hud.showDelivery('');
  hud.showTiming('');
  hud.showBigMessage('READY!', '#ffd54a', 0.9);
  newBall();
}

function backToMenu() {
  match.reset();
  sendInNextBatter();
  hud.updateScoreboard(match);
  hud.updateBallReel(match);
  hud.showStep(0, '');
  hud.hideGameOver();
  pendingDifficulty = getDifficultyKey();
  hud.markSelectedDifficulty(pendingDifficulty);
  hud.markSelectedOvers(pendingOvers);
  hud.showStartScreen();
  bowler.reset();
  batsman.reset();
  nonStriker.reset(); // back to the bowler-end mark
  fielders.setFormation('balanced', 'R');
  fielders.reset();
  umpire.reset();
  ball.hide();
  currentPlan = null;
  currentField = 'balanced';
  delivery = null;
  swingOutcome = null;
  resolutionKind = null;
  resolutionData = null;
  setState('MENU');
}

function init() {
  const canvas = document.getElementById('game-canvas');
  ({ renderer, scene, camera, stumpsBatter } = createScene(canvas));
  initInput();
  hud.initHUD();

  ball = new Ball(scene);
  batsman = new Batsman(scene);
  nonStriker = new Batsman(scene); // runner at the bowler end — locked, never faces
  nonStriker.setHandedness('R');
  nonStriker.placeAtBowlerEnd();
  bowler = new Bowler(scene);
  umpire = new Umpire(scene);
  fielders = new FieldingTeam(scene);
  aimGuide = new AimGuide(scene);
  match = new Match(pendingOvers);
  sendInNextBatter(); // opener takes guard

  hud.updateScoreboard(match);
  hud.updateBallReel(match);
  applyDifficulty('hard');
  pendingDifficulty = 'hard';
  hud.markSelectedDifficulty(pendingDifficulty);
  hud.markSelectedOvers(pendingOvers);
  hud.showStartScreen();
  // clicking an overs option only selects (no start); custom box confirms with Enter
  hud.onOversPick((n) => {
    pendingOvers = n;
    hud.markSelectedOvers(n);
  });
  hud.onCustomOversConfirm((n) => {
    pendingOvers = n;
    hud.markSelectedOvers(n);
    if (state === 'MENU') startFromMenu();
  });
  // clicking a level starts the game immediately with that level
  hud.onDifficultyPick((key) => {
    pendingDifficulty = key;
    startFromMenu();
  });
  setState('MENU');
  requestAnimationFrame(loop);
}

// Fresh bowler type every over (never the same twice running).
function pickBowler() {
  let next = currentBowler;
  while (next.id === currentBowler.id) next = pick(BOWLER_TYPES);
  currentBowler = next;
  bowler.setSide(next.releaseX);
}

// 0..1 pressure from recent punishment: boundaries in the recent window.
// Needs 3 boundaries in the last 8 balls for full heat (see PRESSURE) — a
// single four no longer sends the bowler into a wide spiral, and dots cool
// him off within the window.
function pressureHeat() {
  let b = 0;
  for (const h of match.holders.slice(-PRESSURE.window)) {
    if (h.kind === 'four' || h.kind === 'six') b += 1;
  }
  return Math.min(1, b / PRESSURE.boundariesForMax);
}

function newBall() {
  // over break: rotate the attack and announce it (not on the first ball)
  if (match.balls % MATCH.ballsPerOver === 0) {
    pickBowler();
    if (match.balls > 0) {
      const overNo = Math.floor(match.balls / MATCH.ballsPerOver) + 1;
      hud.showBigMessage(`OVER ${overNo} · ${currentBowler.name}`, '#ffd54a', 1.1);
    }
  }
  // STEP 1 — set the bowling parameters from the previous shot (B1):
  // fast/slow/turn biased by the last ball, announced in the step panel.
  currentPlan = planNextBall({
    lastHolder: match.holders[match.holders.length - 1] || null,
    heat: pressureHeat(),
    bowler: currentBowler,
    lastDelivery: delivery,
  });
  bowler.reset();
  batsman.reset();
  fielders.reset(); // arms down, hops cleared before the next delivery
  if (stumpsBatter) stumpsBatter.reset();
  ball.hide();
  delivery = null;
  swingOutcome = null;
  resolutionKind = null;
  resolutionData = null;
  hud.showStep(1, currentPlan.note);
  setState('PLAN');
}

// Field situation for the next ball (STEP 2, B2): delegates to gameflow with
// the live match context — new batter => catchers crowd the bat; death overs
// or pressure => boundary riders (post-powerplay only); spinner on => squeeze;
// otherwise the balanced powerplay ring. The field-restriction rule (at most
// 2 outside the ring during the powerplay overs) is enforced inside gameflow.
function chooseFieldNow() {
  return chooseField({
    balls: match.balls,
    ballsRemaining: match.ballsRemaining,
    oversPerInnings: match.oversPerInnings,
    bowler: currentBowler,
    lastHolder: match.holders[match.holders.length - 1] || null,
    heat: pressureHeat(),
  });
}

function releaseDelivery() {
  const engine = new BowlingEngine();
  delivery = engine.generate(currentBowler, pressureHeat(), batsman.hand, currentPlan);
  ball.throwFrom(delivery.pos, delivery.vel, delivery.accel);
  batsman.beginWindup();
  // B3: the field was already set and frozen in steps 2–3 — no setFormation here.
  hud.showDelivery(`${delivery.tag} · ${FIELD_SETS[currentField].label} field`);
  setState('DELIVERY');
}

// ---------- resolutions (called ONCE per ball) ----------
function doWicket(text) {
  match.recordBall('wicket');
  hud.showBigMessage('W — ' + text, '#ff5252', 1.4);
  hud.showTiming('');
  hud.showStep(5, 'Ball played · back to step 1');
  batsman.highlight(true);
  fielders.celebrate(text);
  umpire.signal('out'); // raised finger
  if (!match.isOver) sendInNextBatter(); // new striker takes guard on the next ball
  hud.updateScoreboard(match);
  hud.updateBallReel(match);
  setState('SETTLE');
}

function doRuns(runs, kind) {
  match.recordBall(kind, runs);
  const text = runs === 6 ? 'SIX!' : runs === 4 ? 'FOUR!' : runs === 0 ? '·' : `${runs} run${runs > 1 ? 's' : ''}`;
  const col = runs === 6 ? '#ce8bff' : runs === 4 ? '#6db6ff' : runs === 0 ? '#999' : '#a5d6a7';
  hud.showBigMessage(text, col, 1.05);
  hud.showTiming('');
  hud.showStep(5, 'Ball played · back to step 1');
  batsman.highlight(runs >= 4);
  hud.updateScoreboard(match);
  hud.updateBallReel(match);
  setState('SETTLE');
}

function doDot() {
  match.recordBall('dot');
  hud.showBigMessage('·', '#888', 0.8);
  hud.showStep(5, 'Ball played · back to step 1');
  batsman.relax();
  hud.updateScoreboard(match);
  hud.updateBallReel(match);
  setState('SETTLE');
}

function doWide(side) {
  match.recordWide(WIDE_RUNS);
  hud.showBigMessage('WIDE!', '#4dd0e1', 1.05);
  hud.showTiming(side === 'leg' ? 'Wide — down the leg side' : 'Wide — beyond the off guideline');
  hud.showStep(5, 'Ball played · back to step 1');
  batsman.relax();
  hud.updateScoreboard(match);
  hud.updateBallReel(match);
  setState('SETTLE');
}

// ---------- per-frame logic ----------
function update(dt) {
  stateT += dt;

  // ----- MENU: difficulty select, no ball in play -----
  if (state === 'MENU') {
    // keyboard: 1-4 highlight, Enter/Space starts
    const order = DIFFICULTY_ORDER;
    for (let i = 0; i < order.length; i++) {
      if (wasPressed(`Digit${i + 1}`) || wasPressed(`Numpad${i + 1}`)) {
        pendingDifficulty = order[i];
        applyDifficulty(pendingDifficulty);
      }
    }
    if (wasPressed('Enter') || wasPressed('NumpadEnter') || (swingPressed() && hud.isStartScreenVisible())) {
      startFromMenu();
      return;
    }
    // idle scene behind the menu + keep the sightline clear
    batsUpdateRoof(dt);
    updateFielderVisibility();
    updateAimGuide();
    camFollow(dt, false);
    return;
  }

  // restart anytime — back to the difficulty menu so levels are choosable
  if (restartPressed()) {
    if (match.isOver) {
      batsman.highlight(false);
      backToMenu();
      return;
    }
  }

  // mode indicator is live
  hud.setMode(attackMode());

  batsUpdateRoof(dt);
  updateAimGuide();

  switch (state) {
    case 'PLAN':
      // STEP 1 done -> STEP 2: set the fielders per the plan (B2)
      if (stateT >= PLAN_WAIT) {
        currentField = chooseFieldNow();
        fielders.setFormation(currentField, batsman.hand);
        fielders.setSetting(true); // fielders walk to their spots
        hud.showStep(2, `${FIELD_SETS[currentField].label} field`);
        setState('FIELDSET');
      }
      break;

    case 'FIELDSET': {
      // fielders walking — freeze as soon as everyone is in place (B3)
      if (fielders.settled() || stateT >= FIELDSET_TIMEOUT) {
        fielders.setSetting(false); // they will not move now
        hud.showStep(3, 'Field set');
        setState('FREEZE');
      }
      break;
    }

    case 'FREEZE':
      if (stateT >= FREEZE_WAIT) {
        hud.showStep(4, 'Batsman ready');
        setState('IDLE');
      }
      break;

    case 'IDLE':
      batsman.setGuard(true); // guard-tap animation (A2) while waiting
      if (stateT >= IDLE_WAIT) {
        if (match.isOver) {
          hud.showGameOver(match.resultText);
          setState('GAMEOVER');
          return;
        }
        bowler.startRunup();
        batsman.beginWindup();
        setState('RUNUP');
      }
      break;

    case 'RUNUP': {
      const released = bowler.update(dt);
      if (released) releaseDelivery();
      break;
    }

    case 'DELIVERY': {
      bowler.update(dt);
      ball.update(dt, GRAVITY);

      // swing? latch one aim vector so animation and ball direction agree
      if (swingOutcome === null && swingPressed()) {
        const aim = getAimVector();
        batsman.startSwing(aim, delivery);
        swingOutcome = resolveSwing(batsman, ball, aim, delivery);
        if (swingOutcome.outcome === 'miss') {
          const name = swingOutcome.shotName ? ` the ${swingOutcome.shotName}` : '';
          hud.showTiming(
            swingOutcome.reason === 'alignment' ? `Missed${name} — too far` : `Missed${name} — bad timing`
          );
        }
      }

      // contact: ball hits the bat plane while swing is latched
      if (swingOutcome && swingOutcome.outcome === 'hit' && ball.active && !ball.hit) {
        const contactZ = batsman.z + 0.65;
        if (ball.pos.z <= contactZ) {
          ball.launch(swingOutcome.dirX, swingOutcome.dirZ, swingOutcome.speed, swingOutcome.elevation);
          ball.pos.y = Math.max(ball.pos.y, 0.42); // help ground shots along the grass
          const shot = swingOutcome.shotName || 'Shot';
          const lenNote = swingOutcome.lengthMatch === false ? ' · wrong length' : '';
          hud.showTiming(
            swingOutcome.qual === 'perfect'
              ? `Perfect ${shot}!${lenNote}`
              : swingOutcome.qual === 'early'
              ? `${shot} — early${lenNote}`
              : `${shot} — late${lenNote}`
          );
          resolutionKind = null;
          setState('SHOT');
        }
      }

      // ball events without contact
      if (ball.active && !ball.hit) {
        // hits the stumps? scatter them — middle stump goes over, bails fly
        if (ball.pos.z <= 0.1 && Math.abs(ball.pos.x) < 0.4 && ball.pos.y < 1.0) {
          if (stumpsBatter) stumpsBatter.hit(ball.pos.x);
          ball.stop();
          doWicket('BOWLED!');
          return;
        }
        // wide? passes the popping crease untouched outside the guideline for
        // the striker's hand: generous outside off, strict down the leg side.
        // (Checked before the keeper takes it; a hit ball never gets here.)
        if (ball.pos.z <= CREASE_DEPTH) {
          const wideSide = isWideAtCrease(ball.pos.x, batsman.hand);
          if (wideSide) {
            ball.stop();
            doWide(wideSide);
            return;
          }
        }
        // through to the keeper
        if (ball.pos.z <= BALL.keeperZ) {
          ball.stop();
          doDot();
          return;
        }
      }
      break;
    }

    case 'SHOT': {
      bowler.update(dt);
      ball.update(dt, GRAVITY);
      if (!ball.active) break;

      // record crossing states
      if (resolutionData === null) {
        resolutionData = { bounced: false, crossedBoundary: null, caught: false };
      }
      if (ball.pos.y <= BALL.radius + 0.01 && ball.vel.y <= 0) resolutionData.bounced = true;

      const r = distFromCentre(ball.pos.x, ball.pos.z);

      // boundary crossing (only once)
      if (resolutionData.crossedBoundary === null && r >= BOUNDARY_RADIUS) {
        resolutionData.crossedBoundary = {
          bouncedBefore: resolutionData.bounced,
        };
        ball.stop();
        ball.hide();
        doRuns(resolutionData.crossedBoundary.bouncedBefore ? 4 : 6,
               resolutionData.crossedBoundary.bouncedBefore ? 'four' : 'six');
        return;
      }

      // catch: aerial & near a fielder & below catch height
      // reach scales with difficulty (Easy fielders are sleepy, Master are sticky)
      if (!resolutionData.caught && ball.pos.y < CATCH_MAX_HEIGHT && ball.pos.y > 0.2) {
        const f = fielders.nearest(ball.pos.x, ball.pos.z, getDifficulty().catchRadius);
        if (f && !resolutionData.bounced) {
          f.fig.armL.rotation.z = Math.PI; f.fig.armR.rotation.z = Math.PI; // hands up
          ball.stop();
          ball.hide();
          resolutionData.caught = true;
          doWicket(`CAUGHT (${f.name})`);
          return;
        }
      }

      // blockers: ground ball reaches a fielder
      if (ball.pos.y <= BALL.radius + 0.05) {
        const f = fielders.nearest(ball.pos.x, ball.pos.z, getDifficulty().blockRadius);
        if (f) {
          ball.stop();
          const stoppedInside = r < RING_RADIUS;
          const { runs } = awardRuns({
            crossedBoundary: false,
            bouncedBefore: resolutionData.bounced,
            finalX: ball.pos.x, finalZ: ball.pos.z,
            stoppedInside,
          });
          doRuns(runs, 'run');
          return;
        }
      }

      // dead ball: stopped rolling
      const speed2 = ball.vel.length();
      if (speed2 < BALL.stopSpeed && ball.pos.y <= BALL.radius + 0.02) {
        ball.stop();
        const stoppedInside = r < RING_RADIUS;
        const { runs } = awardRuns({
          crossedBoundary: false,
          bouncedBefore: resolutionData.bounced,
          finalX: ball.pos.x, finalZ: ball.pos.z,
          stoppedInside,
        });
        doRuns(runs, 'run');
        return;
      }

      break;
    }

    case 'SETTLE':
      if (stateT >= SETTLE_WAIT) {
        batsman.highlight(false);
        hud.showDelivery('');
        if (match.isOver) {
          hud.showGameOver(match.resultText);
          setState('GAMEOVER');
        } else {
          newBall(); // STEP 5 — as per the ball played, back to step 1 (B5)
        }
      }
      break;

    case 'GAMEOVER':
      // waiting for R (back to difficulty menu)
      break;
  }

  // keep the batsman's view unobstructed every frame
  updateFielderVisibility();

  // camera: chase the ball when it's hit, else stick behind the stumps
  if (state === 'SHOT' && ball.hit) {
    camFollow(dt, true);
  } else {
    camFollow(dt, false);
  }
}

function updateFielderVisibility() {
  // foci: batsman contact zone always, plus the live ball when in play
  const foci = [{ x: batsman.x, y: 1.0, z: batsman.z + 0.65 }];
  if ((state === 'DELIVERY' || state === 'SHOT') && ball.active) {
    foci.push({ x: ball.pos.x, y: Math.max(0.5, ball.pos.y), z: ball.pos.z });
  }
  fielders.updateVisibility(camera.position, foci);
}

// Subtle yellow aim cone on Easy/Medium only — shows the held shot
// direction while the ball is still live (IDLE/RUNUP/DELIVERY).
// Hidden on Hard/Master and once the ball is hit or the over settles.
function updateAimGuide() {
  const key = getDifficultyKey();
  const show =
    (key === 'easy' || key === 'medium') &&
    (state === 'IDLE' || state === 'RUNUP' || state === 'DELIVERY');
  if (!show) {
    aimGuide.update(0, 0, 0, 1, { visible: false });
    return;
  }
  const aim = getAimVector();
  aimGuide.update(batsman.x, batsman.z + 0.65, aim.x, aim.z, {
    visible: true,
    stretch: attackMode() ? 1.3 : 0.85,
  });
}

function batsUpdateRoof(dt) {
  // batsman always moves (except during swing, handled inside)
  batsman.update(dt);
  bowler.fig.group.rotation.y = Math.PI; // face the batsman
  umpire.update(dt); // holds the raised finger after an OUT, then lowers it
  if (stumpsBatter) stumpsBatter.update(dt); // settle scattered stumps/bails
  fielders.update(dt); // walk the field to the latest formation (only while setting)
}

function camFollow(dt, follow) {
  const targetPos = follow
    ? new THREE.Vector3(
        THREE.MathUtils.clamp(ball.pos.x * 0.55, -14, 14),
        4.0 + THREE.MathUtils.clamp(ball.pos.z * 0.06, 0, 2.6),
        -7.5 + THREE.MathUtils.clamp(ball.pos.z * 0.28, 0, 15)
      )
    : BASE_CAM_POS;
  const targetLook = follow
    ? new THREE.Vector3(ball.pos.x, Math.max(1, ball.pos.y + 0.6), ball.pos.z)
    : BASE_CAM_LOOK;

  camPos.lerp(targetPos, follow ? 0.09 : 0.05);
  camLook.lerp(targetLook, 0.08);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.035);
  update(dt);
  renderer.render(scene, camera);
  flushJustPressed();
  requestAnimationFrame(loop);
}

init();
