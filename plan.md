# 🏏 Improvement Plan — Realistic Batsmen + Step-Driven Gameplay

> Grounded in the current code (see `HANDOFF.md` for the base feature log).
> Conventions: all tuning numbers go in `src/constants.js`; verify every JS edit
> with `node --check <file>`. No browser here — verification is static.

---

## 1. Where we are today (relevant anchors)

| Area | File | Status |
|---|---|---|
| Block figure | `src/scene.js` `buildBlockPerson()` | 2 legs + torso pivot + 2 arm pivots + head. No knees/elbows, no bat grip. |
| Batsman | `src/entities/batsman.js` | Handedness (`R`/`L`) mirrors stance + guard (`GUARD_OFFSET 0.12`). Pose-driven swing from `SHOT_ZONES` (lerp, no limb physics). |
| Shot poses | `src/constants.js` `SHOT_ZONES` | 8 aim zones (drive/cut/pull/sweep/glance) with plane/lift/roll/crouch/stride. **No ball-length awareness.** |
| Contact | `src/systems/contact.js` | Alignment (reach) + timing windows only. Shot name from aim zone. |
| Bowler pick | `src/main.js` `pickBowler()` | Fresh random type every over. No memory of the previous shot. |
| Field | `src/main.js` `chooseField()` + `src/entities/fielder.js` | 4 sets, retargeted **at ball release** (field glides during run-up — wrong). No powerplay enforcement. **12 players** (11 in `FIELDERS` + separate bowler) — one too many. |
| Match | `src/systems/match.js` | Overs/wickets/balls/wides fine. |
| States | `src/main.js` | `MENU → IDLE → RUNUP → DELIVERY → SHOT → SETTLE → GAMEOVER`. |

---

## 2. Gap analysis vs. the requested improvements

1. **Realistic batsmen**
   - *Physics* — today the swing is a pose lerp; arms rotate independently of the
     bat, no weight transfer, snap-return to stance. → **A1, A2**
   - *Stance (L/R handed)* — mirroring exists and reads from behind; improve
     fidelity (weight-back side-on stance, guard tap, footwork split) → **A2**
   - *Different shots* — 8 zones exist but ignore the delivery length; add
     length-aware effectiveness + footwork → **A3, A4**

2. **Realistic step-driven gameplay** — today the field changes silently at
   release and the bowler has no tactical memory. → **B1–B5**

---

## 3. Phase A — Realistic batsmen

### A1. Articulated block person (`src/scene.js`)
- Extend `buildBlockPerson()`: add **hip group, knee pivots (L/R), elbow pivots
  (L/R), neck/head pivot** — still blocky boxes, same builder for everyone.
- Keep returned refs backward-compatible (`group, torsoPivot, armL, armR, legL,
  legR` stay) and add the new joints. Update all consumers if pivot origins
  change: `batsman.js`, `fielder.js` (keeper crouch, `celebrate()`), `main.js`
  (catch arms-up), `bowler.js` (run-up anim gets knees).

### A2. Stance + handedness physics (`src/entities/batsman.js`, `src/constants.js`)
- Proper **side-on, weight-on-back-foot stance** for RHB; every cue mirrored for
  LHB (guard offset, shoulder line, bat side, front-foot edge). Add a
  `STANCE` variant table keyed by handedness in `constants.js`.
- **Weight transfer**: during the swing, hips + torso shift back→front foot
  (`pose.stride` extends to hip translation); follow-through momentum with a
  **spring-damper return** to stance instead of a snap (replace the hard
  `applyStance()` call at swing end in `update()`).
- **Guard tap animation** at `IDLE` (bat taps the crease) — reads as "ready".
- Fix pre-existing nit: bat blade width/thickness `0.1 × 0.18` hardcoded in
  `batsman.js` → move to `BATSMAN.batBlade` in `constants.js`.

### A3. Length-aware shots (`src/constants.js`, `src/systems/contact.js`)
- `SHOT_ZONES` gains per-shot metadata: `worksOn: ['full','good',…]` and
  `footwork: 'front'|'back'|'either'`.
- `resolveSwing()` compares the **delivery length** (`length.bounceZ`) against
  `worksOn`: right shot for the length → full power; wrong length → mistimed,
  edge chance, reduced power. Short ball + pull = punish; yorker + pull =dig out.
- Footwork selection is automatic from the incoming length (front foot for
  full/yorker, back foot for short) — feeds the A2 stride.

### A4. Readable LHB mid-swing
- Keep the mirror discipline in `update()` (torso yaw/tilt, bat pivot, lean all
  `× mirror`); add a one-shot numeric assertion script (`tests/` — plain node,
  no deps) that checks LHB stance mirrors RHB for every cue.

---

## 4. Phase B — Step-driven gameplay (the 5-step loop)

New module `src/systems/gameflow.js` + a HUD step indicator. The state machine
gains three states; `RUNUP/DELIVERY/SHOT` stay untouched.

```
SETTLE ─→ STEP1 PLAN ─→ STEP2 FIELDSET ─→ STEP3 FREEZE ─→ IDLE (guard)
                                                             │
   ┌─────────────────────────────────────────────────────────┘
   └─→ RUNUP → DELIVERY → SHOT → SETTLE → back to STEP1
```

### B1. Step 1 — Set bowling parameters from the previous shot
- `GameFlow.planNext()` reads the **last ball outcome** (`match.holders[-1]`,
  `pressureHeat()`):
  - four/six → **slow the pace** (pace pool toward Slow/Medium), target
    yorker/full, more swing (turn) — a change-of-pace response.
  - wicket → new batter, attacking good length.
  - dot → vary from the last delivery (different pace + length combo).
  - wide → come back to the legal line, repeat pace.
- Replaces the random `pickBowler()` pace choice *within* an over (type still
  rotates each over). Plan is announced in HUD: `Step 1/5 · Bowling plan: slower ball, yorker`.

### B2. Step 2 — Set fielders according to the plan (powerplay rule)
- **Player count fix**: `FIELDERS` drops to **10 entries** (Keeper + 9 fielders);
  the `Bowler` entity is the 11th player. Merge Slip 2 into Slip 1.
- **Powerplay rule**: overs 1–2 (of a 5-over match; scales via
  `MATCH.powerplayOvers`) → **max 2 fielders outside the 30-yard ring**
  (`RING_RADIUS`). `defensive` set (4–5 out) is only legal after the powerplay.
- `chooseField()` moves into `GameFlow` and honors the constraint + the B1 plan
  (attacking plan → catchers; defensive → riders when allowed).
- Fielders **visibly walk** to their new spots during this step
  (`FieldingTeam.update(dt)` glides only while `setting === true`).

### B3. Step 3 — Freeze the field
- Once positions are reached, `frozen = true`: `update(dt)` stops gliding and
  fielders are static until the next resolution. `setFormation()` is called
  **only in step 2** — never at `releaseDelivery()` (removes the current
  field-shifts-while-bowling bug).

### B4. Step 4 — Bowl once the batsman is ready
- `IDLE` (guard tap, `IDLE_WAIT`) → `RUNUP` → `releaseDelivery()` unchanged,
  except the field is already frozen and the delivery comes from the B1 plan.

### B5. Step 5 — Resolve and loop
- `SHOT`/`SETTLE` resolution unchanged (boundary/catch/block/wide rules), then
  back to **Step 1** with the outcome as the planner's memory.

---

## 5. State mapping (old → new)

| Old | New | Change |
|---|---|---|
| `MENU` | `MENU` | unchanged |
| — | `PLAN` (step 1) | new: bowling plan from last shot |
| — | `FIELDSET` (step 2) | new: field walks out, powerplay enforced |
| — | `FREEZE` (step 3) | new: field static, brief hold |
| `IDLE` | `IDLE` (step 4) | guard tap, then run-up |
| `RUNUP`/`DELIVERY` | same | delivery from plan, field frozen |
| `SHOT`/`SETTLE` | same | resolve → loop to `PLAN` |

---

## 6. Constraints & conventions (must keep)

- Gameplay numbers only in `src/constants.js` (`FIELD_SETS`, `SHOT_ZONES`,
  `PACE_TYPES`, new `MATCH.powerplayOvers`, `BATSMAN.batBlade`).
- Sightline corridor `|x| < 3, 0 < z < 13` stays clear in every field set;
  keeper/slips behind the batsman (`z < 0`).
- `nonStriker` is a full `Batsman` — per-frame striker logic must use the
  `batsman` ref, never loop all batsmen.
- Verify with `node --check` after every edit + numeric wiring assertions
  (powerplay count, LHB mirror, step transitions).

---

## 7. Verification plan (static, no browser)

1. `node --check` on every touched file.
2. `node tests/verify.mjs` assertions:
   - `FIELDERS` = 10 (keeper + 9); every `FIELD_SETS` entry resolves all 10 names.
   - Powerplay sets have ≤ 2 outside `RING_RADIUS`; defensive set flagged
     `postPowerplay: true`.
   - LHB stance mirrors RHB (every `STANCE` cue × −1) and `shotZoneFor` mirror
     round-trips.
   - GameFlow transition table covers all outcomes → `PLAN`.
3. Manual smoke (user, in browser): run `python3 -m http.server 8000`, check
   step messages, field walk-then-freeze, LHB batter at guard, powerplay count.
