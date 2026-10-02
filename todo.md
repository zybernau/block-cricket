# ✅ todo.md — Implementation Checklist

> Companion to `plan.md`. Work top-down; tick as you go.
> Verify each JS edit with `node --check <file>`.

## Phase A — Realistic batsmen

- [x] **A1. Articulated block person** (`src/scene.js` `buildBlockPerson()`)
  - [x] Add hip group, knee pivots (L/R), elbow pivots (L/R), neck/head pivot
  - [x] Keep refs backward-compatible; update consumers if pivot origins move
        (`batsman.js`, `fielder.js`, `main.js` catch arms-up, `bowler.js` run-up)

- [x] **A2. Stance + handedness physics** (`src/entities/batsman.js`, `src/constants.js`)
  - [x] `STANCES` variant table keyed by handedness in `constants.js`
  - [x] Side-on weight-back stance for RHB, mirrored for LHB (all cues × mirror)
  - [x] Weight transfer during swing (hips + torso back→front, `stride` → hip move)
  - [x] Spring-damper return to stance (replace snap `applyStance()` at swing end)
  - [x] Guard-tap animation at `IDLE` (bat taps the crease)
  - [x] Move hardcoded bat blade `0.1 × 0.18` → `BATSMAN.batBlade` in `constants.js`

- [x] **A3. Length-aware shots** (`src/constants.js`, `src/systems/contact.js`)
  - [x] `SHOT_ZONES` gains `worksOn: [lengths]` + `footwork: 'front'|'back'|'either'`
  - [x] `resolveSwing()` compares delivery length vs `worksOn` → power/edge penalty
  - [x] Automatic footwork from incoming length (front = full/yorker, back = short)

- [x] **A4. LHB mirror assertions** (`tests/verify.mjs`)
  - [x] LHB stance mirrors RHB for every cue; `shotZoneFor` mirror round-trips

## Phase B — Step-driven gameplay (5-step loop)

- [x] **B0. GameFlow module** (`src/systems/gameflow.js`, `src/main.js`)
  - [x] Add states `PLAN` (step 1) / `FIELDSET` (step 2) / `FREEZE` (step 3)
  - [x] Transition: `SETTLE → PLAN → FIELDSET → FREEZE → IDLE → RUNUP → … → SETTLE → PLAN`
  - [x] HUD step indicator (`Step n/5 · …`)

- [x] **B1. Step 1 — bowling parameters from previous shot** (`gameflow.js`)
  - [x] four/six → slower pace + yorker/full + more swing (turn)
  - [x] wicket → attacking good length for the new batter
  - [x] dot → vary pace + length from last delivery
  - [x] wide → legal line again, repeat pace
  - [x] Announce plan in HUD (replaces random per-over pace choice)

- [x] **B2. Step 2 — field setting + powerplay rule** (`constants.js`, `fielder.js`, `gameflow.js`)
  - [x] `FIELDERS` → 10 entries (Keeper + 9); merge Slip 2 into Slip 1 (11 players total with bowler)
  - [x] `MATCH.powerplayOvers` (2 for a 5-over match); enforce ≤ 2 outside `RING_RADIUS` during it
  - [x] `defensive` set (4–5 out) flagged `postPowerplay: true`, only applied after
  - [x] `chooseField()` honors plan + constraint (moved into `GameFlow`)
  - [x] Fielders visibly walk to spots only while `setting === true`

- [x] **B3. Step 3 — freeze the field**
  - [x] `frozen` flag: `update(dt)` stops gliding once positions reached
  - [x] `setFormation()` only in step 2 — remove the call at `releaseDelivery()`

- [x] **B4. Step 4 — bowl when batsman ready**
  - [x] `IDLE` (guard tap + `IDLE_WAIT`) → `RUNUP` → delivery from the B1 plan

- [x] **B5. Step 5 — resolve and loop**
  - [x] Resolution unchanged (boundary/catch/block/wide) → back to `PLAN`

## Extras (found during implementation)

- [x] **Release-X offset bug** (`src/systems/bowlingEngine.js`): the crease-target
      solve treated the release as x=0, so every ball crossed the crease at
      `releaseX + targetX` — spinners sprayed leg-side wides. Fixed: the solve
      now closes the `bowler.releaseX` offset (found by `tests/smoke.mjs`).
- [x] **Freeze at step 1/5** (`src/entities/fielder.js`): `main.js` called
      `fielders.setSetting(true)` but the `setSetting(on)` method was never
      defined — a TypeError thrown inside `update()` killed
      `requestAnimationFrame` and the game hard-froze with the badge on 1/5.
      Fixed: the setter now exists. No manual key needed — the flow stays
      automatic (found by `tests/headless.mjs`).

## Verification

- [x] `node --check` on every touched file — all OK
- [x] `node tests/verify.mjs` — 17 passed, 0 failed
- [x] `node tests/smoke.mjs` — 5 passed, 0 failed (195/200 legal planned deliveries)
- [x] `node tests/headless.mjs` — 6 passed, 0 failed (drives the real frame loop
      with stubbed DOM/THREE: starts → 1→2→3→4 auto-advance → bowls → 5→1 loop,
      no exceptions across 25s of frames)
- [ ] Browser smoke (user): step messages, field walk-then-freeze, LHB guard, powerplay count

## GitHub Pages pipeline

- [x] `.github/workflows/pages.yml` — push to `main` → test → build → deploy
  - [x] test job: verify.mjs + smoke.mjs + headless.mjs (setup-node 22)
  - [x] build job: stage index.html + styles.css + src/ → upload-pages-artifact
  - [x] deploy job: deploy-pages (environment github-pages, url output)
  - [x] concurrency group `pages` (new push cancels in-flight deploy)
  - [x] `workflow_dispatch` trigger for manual re-runs
- [x] `.gitignore` (`.zvec-grep/`, `node_modules/`, `.DS_Store`, `_site/`)
- [x] README: pipeline docs + one-time Pages source setting
- [x] One-time (user, on GitHub): Settings → Pages → Source → "GitHub Actions" — done
- [x] **SITE LIVE**: https://zybernau.github.io/block-cricket/ (HTTP 200, all 3 jobs green)

## Freeze at 4/5 (swing press) — fixed

- [x] **Root cause** (`src/systems/contact.js`): `resolveSwing` declared
      `const speed` and then reassigned it on the wrong-length path
      (`speed *= SHOT.lengthMissMul`) → "Assignment to constant variable"
      thrown from the Space handler → the loop died before
      `requestAnimationFrame` → hard freeze exactly at the swing. Fixed:
      `speed` is now `let`.
- [x] **Error reporting layer** (debug later, never freeze):
  - [x] `loop()` try/catches every frame → `reportError()` (console + on-screen
        error strip) and KEEPS the loop alive
  - [x] `window.onerror` + `unhandledrejection` handlers surface on the strip
  - [x] HUD error strip (index.html `#error-strip` + hud.js `showError`/`hideError`
        + styles.css) — message + first stack line, visible for 8s
  - [x] `ball.launch` NaN-guarded (a bad velocity can never poison the ball state)
  - [x] DELIVERY/SHOT watchdogs (`BALL_WATCHDOG = 12s`): a stalled ball
        force-resolves as a dot with an error note instead of hanging forever
- [x] **Regression tests**:
  - [x] verify.mjs: deterministic wrong-length swing (the exact freeze path) +
        every SHOT_ZONE × LENGTH combination resolves without throwing (21/21)
  - [x] headless.mjs: 45s run with varying aim, asserts the loop survived AND
        the error strip never fired + a synthetic error shows on the strip and
        the loop survives (7/7)

## Stance rework (image-matched)

- [x] `STANCES` reworked per the reference image: split feet (`footStep 0.36`
      to the crease, `footBack -0.30` behind — legs never read parallel),
      deep knee bend (`kneeFlex 0.45`) with hips dropped so feet stay planted,
      chest over the crease (`torsoHunch 0.62`), head up (neck counter-rotation),
      bat raised up-back (`batRaise 2.3`) with hands forward (`batZ 0.3`, elbows bent)
- [x] `scene.js` exports `FIG_LIMB` (thigh/shin lengths) — batsman derives the
      stance hip height so bent knees keep the feet on the turf
- [x] `batsman.js`: swing arc now runs from the raised backlift, down through
      the ball, up the other side; recovery returns the bat over the top
      (shortest arc) to the raised stance; guard tap → bat waggle around the
      raised pose
- [x] verify.mjs stance assertions (split > 0.5m, kneeFlex > 0.3, batRaise > π/2)
- [x] All suites green (18/18 verify · 5/5 smoke · 6/6 headless)
