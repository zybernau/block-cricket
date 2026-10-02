# 🏏 Backyard Block Cricket — Agent Handoff

> Status snapshot for AI agents picking up this codebase. Read this before changing anything.

## 1. What it is

Minimalist 3D browser cricket game (batting only). No build tools, no npm — static files + Three.js from CDN.

```bash
cd cricket-game
python3 -m http.server 8000
# open http://localhost:8000
```

**World axes (metres, y-up):** batsman stumps at `z = 0`, bowler stumps at `z = +20.12`.
Camera sits **behind the batsman** at `[0, 4.9, -8.6]` looking down `+z`.
Because the camera looks along `+z`: **screen-right = world `-x`, screen-left = `+x`**,
screen-up = `+z`. The batsman faces `+z` (back to camera), so screen directions agree
with the batsman's own left/right. A right-hander's leg side = `+x` = screen-left.

## 2. File layout

```
index.html      canvas + HUD + difficulty/overs start-screen overlay
styles.css      HUD + start-screen styling
src/
  main.js                 game-loop + state machine (MENU/IDLE/RUNUP/DELIVERY/SHOT/SETTLE/GAMEOVER)
  constants.js            ALL tuning numbers + lookup tables (edit here first)
  scene.js                ground/pitch/creases/stumps/crowd/camera + buildBlockPerson()
  input.js                keyboard (WASD move, arrows aim, Space swing, Shift attack, R restart)
  entities/batsman.js     striker (input, swing anim) + non-striker reuse (locked flag)
  entities/bowler.js      run-up + release animation (side-aware via setSide)
  entities/ball.js        flight/bounce/roll physics + launch()
  entities/fielder.js     static field + dynamic sightline fade
  entities/aimGuide.js    subtle yellow aim cone (Easy/Medium only)
  entities/umpire.js      OUT finger signal (stubs for wide/four/six)
  systems/bowlingEngine.js  delivery generation: bowler type × pace × swing × line × length
  systems/contact.js      swing resolution (alignment + timing) + shot naming
  systems/scoring.js      auto-runs rules
  systems/match.js        score/wickets/balls/wides, per-game overs
  ui/hud.js               scoreboard, reel, messages, start-screen wiring
```

**Convention:** gameplay numbers live in `constants.js` — never hardcode physics elsewhere.
Verify edits with `node --check <file>` (ESM; plain syntax check, no imports resolved).
No browser is installed in this environment, so verification is static
(`node --check` + numeric/wiring assertions), not screenshots.

## 3. Feature log (what's implemented and where)

### Start screen: difficulty + overs (`index.html`, `hud.js`, `main.js`)
- 4 levels: **Easy / Medium / Hard** (= original tuning) **/ Master** — `DIFFICULTY_LEVELS`
  scales timing windows, ball speed, swing, fielder reach (`catchRadius`/`blockRadius`),
  loft chance, wide multiplier. Badge in scorecard shows active level.
- Overs picker: **5 / 10 / 20 / custom (1–50)**. Clicking a level starts immediately;
  overs buttons only select; custom box applies on change, Enter confirms+starts.
  `Match` carries per-game `oversPerInnings` (`setOvers()` clamps); `reset()` preserves it.
- `input.js` ignores keystrokes whose target is an `<input>` (typing in the custom box
  must not swing/aim/start the game).

### Camera sightline (`constants.js` `SIGHTLINE`/`CAMERA_SETUP`, `fielder.js`, `main.js`)
- No static fielder inside corridor `|x|<3, 0<z<13`. Slips live **behind** the batsman
  (`z<0`, as in real cricket); keeper offset to `x=+1.1` and crouched (`scale.y=0.72`).
- `FieldingTeam.updateVisibility(camPos, foci)` fades any fielder on the
  camera→batsman or camera→ball ray to 15% opacity (`depthWrite` off while faded).

### Controls mapping (`input.js`)
- Arrows/WASD are screen-relative **and** batsman-relative (they coincide):
  Up/W=`+z`, Down/S=`−z`, Left/A=`+x`, Right/D=`−x`. (An old comment claiming
  screen-right=`+x` was wrong — the camera math gives `−x`.)

### Directional batting animation (`batsman.js`, `constants.js` `SHOT_ZONES`)
- 8 aim zones (`k = round(atan2/45°)`, `k∈{-4..4}`, `-4→4` = straight behind):
  Up **Straight Drive**, ↗ **Cover Drive**, → **Square Cut**, ↘ **Late Cut**,
  ↓ **Leg Glance**, ↙ **Sweep Shot**, ← **Pull Shot**, ↖ **On-Drive**.
  Reference was an umpire-view chart; names/directions are converted to rear view
  (screen-right = off side, screen-left = leg side for RHB).
- Each zone drives: vertical/horizontal bat plane, backlift/follow-through pitch,
  bat roll, torso dip (**crouch**), front-foot **stride** offset (visual only, in `sync()`),
  sideways **lean**, hunch, scaled torso turn. Turn clamped to `SHOT_TURN_MAX = 1.15 rad`
  (behind shots glance, never spin). ATTACK keeps each pose with bigger lift/finish.
- `applyStance()` resets torso `position.y` (crouch), rotation, bat, aim, pose.
- `contact.js` returns `shotName` (angle mirrored for LHB so names stay correct);
  HUD timing announces it: `Perfect Cover Drive!`, `Missed the Sweep Shot — bad timing`.

### Aim guide (`aimGuide.js`, `main.js`)
- Faint yellow gradient triangle on the turf from the contact point along held aim
  (26 m, ±13° spread, ≤30% alpha, ATTACK stretches 1.3×). Visible only on
  **Easy/Medium** during IDLE/RUNUP/DELIVERY.

### Crease + wides (`constants.js`, `scene.js`, `bowlingEngine.js`, `match.js`, `main.js`)
- Pitch 3.05 m (10 ft). Popping crease 2.5 ft (0.762 m); blue wide guidelines at
  `WIDE_HALF_WIDTH = STUMP_EDGE + 1.5 × BAT_LENGTH` (≈ ±1.275 m), derived from the
  actual stump/bat dims so art and rules can't drift. Drawn full-length in `scene.js`.
- Batsman confined to crease box: `x ∈ ±WIDE`, `z ∈ [0.15, 1.37]` (±2 ft of popping crease).
  Guard is middle-stump (`homeX = 0`) for both hands. Legal line `±0.75`.
- Wide = untouched ball crossing the popping crease outside the lines → `WIDE! +1 extra`,
  ball not counted (`recordWide()`; reel shows teal `Wd`). Hit it and it's fair.
- Legal balls target `±0.75`; aimed wides target `wide + [0.25, 0.9]`.

### Handedness + batting order (`constants.js` `BATTING_ORDER = ['R','R','L']`, `batsman.js`, `main.js`, HUD badge)
- `setHandedness()` mirrors guard/stance/follow-through. Strike rotates on each wicket
  (`sendInNextBatter()`); green **RHB** / purple **LHB** badge in the mode bar.

### Non-striker (`batsman.js` `locked` + `placeAtBowlerEnd()`, `main.js`)
- Second `Batsman` at bowler end (`x −0.55`, behind popping crease, rotated π to face
  the striker). Locked: no movement, `startSwing()` refuses. `reset()` uses instance
  `home`, so menu restarts keep him parked.

### Bowling attack (`BOWLER_TYPES`, `bowlingEngine.js`, `main.js`, `bowler.js`)
- 5 generic types: **Right-arm Fast, Left-arm Fast, Medium-fast, Off-spin, Leg-spin** —
  each with pace pool, swing bias, `curveMul`, `wideBase` (3–5%), `releaseX`
  (left-armer from `−0.9`, spinners `+0.6`). Fresh type every over (never repeats),
  announced (`OVER 2 · Leg-spin`); run-up side follows via `bowler.setSide()`.
- **Pressure model:** `effWide = min(0.18, wideBase × (1 + 3·heat) × wideMul)` where
  `heat` (0..1, computed in `main.pressureHeat()`) = recent boundaries in last 6 balls.
  Base ≈ 95%+ legal; spray only under assault. Difficulty `wideMul`: 1.4/1.15/1.0/0.85.
- Delivery tag: `Type · Pace · Swing · Length`.
- FUTURE: named bowler profiles (traits/strengths/weaknesses/temperament) plug into
  `BOWLER_TYPES` — shape already supports it.

### Umpire (`umpire.js`, `main.js`)
- Dark blazer, white hat, behind bowler-end stumps facing the batsman.
  `umpire.signal('out')` on every wicket: right arm + index finger straight up
  (0.3 s raise, ~1.5 s hold, 0.4 s lower; `update(dt)` called from `batsUpdateRoof`).
  `signal(kind)` reserves `'wide' | 'four' | 'six'` for later; `reset()` on menu return.

## 4. Scoring / rules summary

- Auto-runs: boundary in air = 6, on bounce = 4, stopped outside ring = 2, inside/blocked = 1.
- Dismissals: Bowled (missed, hits stumps `|x|<0.4, z≤0.1`) and Caught (aerial, un-bounced,
  within difficulty `catchRadius`, below 2.6 m). No LBW, no run-outs, no strike rotation.
- Powerplay field: exactly 2 outside the ring (Deep Cover, Deep Square).
- Innings ends at 3 wickets or end of chosen overs (legal balls only).

## 5. Known simplifications / traps

- Stride offset is visual-only (`sync()`); contact physics uses `batsman.z`.
- Post-bounce lateral accel persists (same `accel` vector), so big swing can drift
  legal lines wide at the crease — realistic, but watch wide rates if tuning swing.
- `fielder.js` `celebrate()` leaves arms up (no reset call) — pre-existing; same for
  umpire if a game ends mid-signal (umpire IS reset in `backToMenu`).
  FIXED in the step-flow update: `newBall()` calls `fielders.reset()` (arms down,
  hop cleared) before each delivery; `celebrate()` now drives a fading hop.
- `MATCH.oversPerInnings = 2` is now only the `Match` constructor fallback; real value
  comes from the start screen (`DEFAULT_OVERS = 5`).
- Bat mesh dims must stay in sync with `BAT_LENGTH` (mesh uses both consts now:
  `BATSMAN.batBlade` width/thickness + `BAT_LENGTH` length).
- Non-striker is a full `Batsman` — any new per-frame striker logic in `main.js`
  must use the `batsman` ref, never loop all batsmen, or the runner will swing/move.
- `releaseX` offset in the crease-target solve — FIXED: the solve now closes the
  bowling-arm offset (`targetX - bowler.releaseX - …`); before it, legal balls
  crossed the crease at `releaseX + targetX` (spinners sprayed leg wides).
- Delivery `accel` is a SCALAR (lateralAccel), not a Vector3 — pass it whole to
  `ball.throwFrom(pos, vel, accel)`.
- `tests/smoke.mjs` + `tests/headless.mjs` write a transient `node_modules/three`
  stub (minimal Vector3/MathUtils/scene-graph) and remove it when done — not a
  real dependency.
- An exception thrown inside `update()` kills `requestAnimationFrame` and the
  game hard-freezes mid-state (observed: missing `FieldingTeam.setSetting`
  froze the flow at 1/5). Any new method called from the state machine MUST
  exist — run `node tests/headless.mjs` to catch this class of bug.

## 7. Update — realistic batsmen + step-driven game flow (implemented)

Phase A (realistic batsmen):
- `scene.js` `buildBlockPerson()` is articulated: hip pivots → thigh → knee
  pivots → shin, shoulder pivots → upper arm → elbow pivots → forearm, neck
  pivot → head (`FIG_HIP_Y = 0.82`, feet at y=0). Refs stay backward-compatible;
  adds `elbowL/R`, `kneeL/R`, `head`, `neck`.
- `batsman.js`: stance expressed as `stanceTargets()` (single source of truth,
  from `STANCES[hand]` in constants.js); swing does weight transfer (pelvis
  drift + lead knee extends / back knee loads) and settles back with an
  easeOutBack spring (`BATSMAN.recoverDuration`); guard-tap animation at IDLE
  (`setGuard`, `BATSMAN.guardTapSpeed`); footwork scaled by the latched
  delivery length (`swingLength`: back-and-across to short, bigger stride to
  the yorker).
- `constants.js`: `STANCES` (R/L), `BATSMAN.batBlade/recoverDuration/
  guardTapSpeed/guardOffset`, `SHOT.lengthMissMul/edgeChance`, `SHOT_ZONES`
  gains `worksOn` + `footwork` per shot.
- `contact.js` `resolveSwing(batsman, ball, aim, delivery)`: length-aware
  effectiveness — wrong length → power bleed (`lengthMissMul`) + leading-edge
  chance (`edgeChance`); returns `lengthMatch` for the HUD.

Phase B (step-driven game flow — the user's 5 steps):
- `systems/gameflow.js` (new, pure — node-testable): `powerplayOvers(overs)`
  (2 for a 5-over game, scales 10→3, 20→6), `countOutsideRing(set, hand)`,
  `planNextBall({lastHolder, heat, bowler, lastDelivery})` (boundary → slower
  pace + yorker/full + turn; wicket → attacking length; dot → bumper variation;
  wide → legal line), `chooseField({...})` (situation rules + powerplay guard).
- `main.js` states: `PLAN` (step 1) → `FIELDSET` (step 2, fielders walk at
  6 m/s) → `FREEZE` (step 3, static) → `IDLE` (step 4, guard tap) → `RUNUP` →
  `DELIVERY` → `SHOT` → `SETTLE` (step 5) → `PLAN`. `setFormation` is called
  ONLY in step 2 (removed from `releaseDelivery`); game-over is checked in
  `SETTLE`. HUD step panel (`showStep`) shows `n/5` + what's happening.
- `fielder.js`: `setting` flag gates gliding — `setSetting(on)` arms it,
  `settled()` reports arrival; hop celebration; `reset()` clears arms/knees/hops.
- `bowler.js`: knees scissor + elbows pump in the run-up; release pose extends
  the bowling arm; reset zeroes the new joints.
- `FIELDERS` = 10 (Keeper + 9, Slip 2 merged) + the `Bowler` entity = 11 players.
- `bowlingEngine.js` `generate(bowler, heat, hand, bias)` accepts the step-1
  plan bias; `targetX` is now exposed on the delivery (debug/HUD).

Verification: `node tests/verify.mjs` (18 static assertions), `node
tests/smoke.mjs` (integration: plan → engine → flight → wide rules), and
`node tests/headless.mjs` (drives the REAL frame loop with stubbed DOM/THREE:
start → 1→2→3→4 auto-advance → bowls → 5→1 loop, no exceptions across 25s).
All green; 195/200 planned deliveries legal. The flow is fully automatic —
no manual key moves it.

## 8. Update — image-matched stance rework

Per the user's reference image (batsman in a side-on batting stance):
- `constants.js` `STANCES` reworked: SPLIT feet — `footStep: 0.36` (front foot
  strides up to the popping crease, lands at world z ≈ 0.75 = the crease line)
  and `footBack: -0.30` (back foot planted near the stumps) — the legs never
  read parallel (split ≈ 0.66 m). Deep knee bend `kneeFlex: 0.45` with the
  hips DROPPED so the feet stay planted; chest over the crease
  `torsoHunch: 0.62`; bat RAISED up-back over the shoulder `batRaise: 2.3`
  with hands forward `batZ: 0.3`, `batY: 0.72`; elbows bent (`elbow: 0.5`).
- `scene.js` exports `FIG_LIMB = { thigh: 0.42, shin: 0.40 }` — `batsman.js`
  derives the stance hip height as `thigh + shin·cos(kneeFlex)` so a bent
  knee keeps the feet on the turf (the hips drop, the figure never floats).
- `batsman.js`:
  - `stanceTargets()` gains `neckRot` (head counter-rotated up, eyes down the
    pitch) and `elbow`; applyStance applies both.
  - The swing arc now runs from the RAISED backlift
    (`batRaise + (attack ? 0.55 : 0.25) + pose.lift`) DOWN through the ball
    and up the other side (full cricket swing) — before it, the arc started
    at the ball and only followed through upward.
  - The recovery returns the bat over the TOP (shortest-arc blend on
    `batRot[0]`) to the raised stance — never windmilling back through the ball.
  - The guard tap is now a bat WAGGLE around the raised pose (matches the image).
  - Windup torso hunch is stance-relative (`torsoHunch + 0.08`), and the hips
    sit at the dropped height (`t.legL[1]`), not raw `FIG_HIP_Y`.
- Deployment: the Pages pipeline is live — the site publishes on every push to
  `main` (https://zybernau.github.io/block-cricket/).

## 6. Roadmap (user-stated future work)

1. Named bowler profiles with traits/strengths/weaknesses (+ pressure temperament).
2. Umpire signals for wide / four / six.
3. Playable bowling, manual running + run-outs, full 2-innings chase, LBW.
