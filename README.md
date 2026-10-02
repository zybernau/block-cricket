# 🏏 Backyard Block Cricket

A minimalist 3D browser cricket game. No build tools, no npm, no install — just open and play.

**Play online:** https://zybernau.github.io/block-cricket/

## Run it

```bash
cd cricket-game
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

(Any static server works — the only dependency is Three.js, loaded from CDN.)

## GitHub Pages pipeline

Every push to `main` publishes the site automatically — no manual step in the loop:

```
push → ① test   verify.mjs + smoke.mjs + headless.mjs must pass
     → ② build  stage the static files (index.html · styles.css · src/)
     → ③ deploy publish to Pages
```

The pipeline lives in [.github/workflows/pages.yml](.github/workflows/pages.yml)
(GitHub Actions: `checkout → setup-node 22 → tests → configure-pages →
upload-pages-artifact → deploy-pages`). Site files only — docs and tests stay
repo-only. A new push cancels any in-flight deploy (concurrency group `pages`).

**One-time setup** (before the first deploy can succeed): repo
**Settings → Pages → Build and deployment → Source → "GitHub Actions"**.
After that, every push to `main` republishes on its own; `workflow_dispatch`
also lets you re-run the deploy manually from the Actions tab.

## Controls (Batting)

| Key | Action |
|---|---|
| **W A S D** | Move the batsman inside his crease box (W/S = forward/back ±2 ft around the popping crease · A/D = sideways, never past the wide guidelines) |
| **← ↑ → ↓** | Aim the shot direction (8-way; ↑ = straight down the ground). On **Easy/Medium** a faint yellow cone on the turf shows the held direction |
| **Space** | Swing the bat |
| **Shift (hold)** | **ATTACK mode** — bigger backlift, more power, more loft, tighter timing window. Default is **DEFENSIVE** (safe ground shots, forgiving timing) **R** | Restart when the match is over |

Camera sits **behind the stumps** — you face away from the screen down the pitch, watching the bowler run in.

## Shots (rear view — screen directions, RHB terms; mirrored for LHB)

| Aim | Shot | Pose |
|---|---|---|
| **↑** | Straight Drive | tall, vertical bat, high follow-through, small step down the pitch |
| **↗** (↑+→) | Cover Drive | strides to the off side, leans over, vertical bat high |
| **→** | Square Cut | wide stance, horizontal bat at shoulder height |
| **↘** (→+↓) | Late Cut | crouches, guides a horizontal bat down behind square |
| **↓** | Leg Glance | stays leg-side of the ball, angled vertical bat, body turns behind |
| **↙** (↓+←) | Sweep Shot | deep crouch (knee-bend read), sweeps the horizontal bat low |
| **←** | Pull Shot | across to leg side, horizontal bat through chest height |
| **↖** (←+↑) | On-Drive | strides to leg side, vertical bat lofted high through mid-on |

The timing tag names the attempted shot (`Perfect Cover Drive!`, `Missed the Sweep Shot — bad timing`). ATTACK mode keeps the same poses with a bigger backlift, higher finish and more loft.

## Rules (Phase 1)

- **Overs** picked on the start screen: **5 / 10 / 20 / custom (1–50)**, plus difficulty level. **3 wickets** a side.
- **Crease**: 10 ft wide pitch · popping crease 2.5 ft in front of the stumps · blue wide guidelines 1.5 bat-lengths out from the edge of the stumps on either side. The batsman is confined to the crease box (wide line to wide line, ±2 ft around the popping crease).
- **Batting order**: 3 wickets = 3 strikers — two right-handers, then a left-hander (watch the RHB/LHB badge; guard + stance mirror). Guards are middle-stump for both hands. A locked **runner (non-striker)** waits at the bowler end.
- **Wides**: a ball passing the popping crease outside the guidelines untouched = **WIDE, +1 extra, ball doesn't count** (hit it and it's fair — play on).
- **Runs are automatic**: clear the ring & stops = 2 · inside ring / blocked = 1 · boundary on the bounce = 4 · boundary on the full = 6.
- **Powerplay field**: exactly **2 fielders outside the 30-yard ring**, everyone else inside.
- Dismissals: **Bowled** (missed, ball hits stumps) and **Caught** (aerial shot to a fielder) — the **umpire** (dark blazer, white hat, behind the bowler-end stumps) raises his finger for every OUT.
- Bowling attack rotates every over: **Right-arm Fast · Left-arm Fast · Medium-fast · Off-spin · Leg-spin**, each with its own pace pool, movement bias, release side and accuracy. Like real bowlers they land ~95%+ legally and only spray wides under pressure (after recent boundaries).

## Project layout

```
cricket-game/
├── index.html          canvas + HUD overlay + import map
├── styles.css          HUD styling
└── src/
    ├── main.js         bootstrap + game-loop + state machine
    ├── constants.js    ALL tuning numbers (pitch, speeds, timings, fielder positions)
    ├── scene.js        ground/pitch/stumps/ring/camera + shared block-person builder
    ├── input.js        keyboard
    ├── entities/       batsman.js · bowler.js · ball.js · fielder.js
    ├── systems/        bowlingEngine.js · contact.js · scoring.js · match.js
    └── ui/hud.js       scorecard + messages
```

## Roadmap — Phase 2 (after you sign off Phase 1)

- Playable bowling (you pick pace/swing/line and bowl)
- Manual running between wickets + run-outs
- Full 2-innings chase (AI bats), LBW, difficulty levels
