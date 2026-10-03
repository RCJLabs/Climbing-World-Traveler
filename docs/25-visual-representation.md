# 25 · Watching the simulation: visual representation

**Status (2026-10-03):** proposal. Since [24](24-simulation-game.md) the wall is only ever watched, never played, so the picture no longer has to serve as an input surface. This doc sets what the picture must do, the data a renderer gets from the engine, ten candidate styles mocked up on one simulated attempt, how real climbs get recreated, and a recommendation. The owner picks; nothing here changes the engine or the shipped wall yet.

**Mockups:** the Design canvas *Climbing Simulator Visual Styles*: ten phone artboards (390 × 844), each playing the same attempt sequence live with Play, Replay and a speed button, ordered from realistic to stylised. The renderers behind them are in `scripts/dev/visual-styles/` (§9).

Related: [05a Wall and Kinematics](05a-wall-and-kinematics.md) · [06 Procedural Routes](06-procedural-routes.md) · [07 Disciplines](07-disciplines.md) · [17 UI](17-ui-ux.md) · [18 Tech](18-tech-architecture.md) · [23 §4 Flat Dusk](23-move-types-and-art-direction.md) · [24 The Simulation Game](24-simulation-game.md)

---

## 1. What the picture is for

| # | Requirement | Why | Check |
|---|---|---|---|
| R1 | Shows every kind of climb the engine simulates: boulders now; sport pitches, multi-pitch and big walls later ([07](07-disciplines.md)) | The climbs are the game's output | The same renderer draws a 2.4 m boulder and a 30 m pitch from `Route` data |
| R2 | Recreates real climbs as geography: the block's shape, the line, where the holds are and what kind they are, the wall's angles | Real crags are a pillar ([01](01-pillars-scope-roadmap.md)) | Someone who has done the problem recognises it |
| R3 | Shows the climber's movement: each limb move, body position, dynamic moves, slips, falls, top-outs | The playback *is* the attempt (24 §5) | Every step in the attempt log has a visible cause on screen |
| R4 | Shows the mechanics: pump, power, fear against the climber's band, each move's odds, why it failed | The build is the game; the player is the coach | A player can say why an attempt failed without reading the log |
| R5 | Reads on a phone in portrait, one thumb | [17](17-ui-ux.md) | Text ≥ 11 px, controls ≥ 44 px, 360–390 px wide |
| R6 | Deterministic: the same attempt always looks the same | Saves are replays ([18](18-tech-architecture.md)) | Rendering never draws from the engine's streams; texture noise is seeded per style |
| R7 | Affordable for one developer: drawn from data, no hand art per route | Content scale is a listed risk (01) | Adding a route adds data only |
| R8 | Runs at 60 fps on a low-end Android | 18 budgets | Frame time per style, measured on a device (not yet done, §5) |
| R9 | Reduced motion: a still and the result | 17 §7 | Playback starts paused on the key moment |

---

## 2. The mockup attempt

One real problem, two attempts on one run, exported from the engine by `scripts/dev/export-scene.ts`:

| | |
|---|---|
| Problem | La Marie-Rose 6A, Bas Cuvier (DI 12.88). A signature problem: its holds and line are hand-authored and tuned to the canon grade (`scripts/build-signatures.ts`), **not traced from the rock** |
| Climber | The reference athlete for DI 12.5, so the problem is just above their level |
| Attempt 1, flash | Ten moves, one of them sketchy; the deadpoint to the top sloper is caught, then the left hand slips off: **off at 86%** |
| Attempt 2, redpoint | Three slips held (left foot, right hand, right foot), fear rising from 27 to a peak of 48; the deadpoint caught at the apex but sketchy; the mantle: **sent** |
| How it was picked | The script tries 400 dice seeds for the run and keeps the sequence with the most to watch (a fall high up, then a send, slips and a dynamic move). It is a chosen sequence, not a typical one |

---

## 3. The data contract

What a renderer gets for one attempt sequence. Axes: x across the face, y up, z out from the foot of the wall (towards the viewer), metres. Body points are the engine's (`bodyPoints`, 05a §4), set out from the face by 0.28 m (shoulders) and 0.22 m (hips) as the shipped wall view does.

| Field | Contents | From |
|---|---|---|
| `source` | Route id, name, area, crag, grade, DI, climber DI, mode, a note on where the holds came from | `Route`, bundle |
| `wall` | Segments `(y0, y1, angle)`, top, lateral extent | `Route.wall` |
| `holds[]` | id, x, y, z, type, size, orientation, hands/feet allowed, start, finish, place in the line | `Route.holds`, `RouteGeom` |
| `line[]` | limb, hold, move class per step | `Route.beta_line` |
| `attempts[].frames[]` | Pose (shoulder, hip, four limb ends, which limbs are on, body scale), pump, power and its maximum, chalk, skin, fear, the fear band, the step's text, event, limb, class, outcome, commit result, odds `p`, margin, `T`, the last three fear sources, the next move, feet cut, posture | `simulateAttempt(..., onStep)` |
| `attempts[].result` | Outcome, the line in the journal, progress | `RunState.last_attempt` |

What the mockups add that the engine does not have (all authored for the mockups, so not yet data):

| Added | How | To become data |
|---|---|---|
| The block's outline and top | A smoothed outline from the face's lateral extent; a cap pushed back 1.3–1.5 m | `Route.outline` (proposed below) |
| Elbows and knees | Two-bone IK in 3D with poles: elbows out, down and off the wall; knees out and off the wall, up when seated | A rule in the playback core |
| The fall and the landing | The hand skids 0.09 m, an accelerating drop, a seated pose on the pads | An engine ending (`fell` already exists; the landing pose is a rule) |
| The top-out | Press, step through, stand on the top, arms up | A rule from the finish hold and the cap |
| The pads | Two pads under the problem | `protection` pad zones already exist in `Route` |

**Proposed fields** (not in [schemas](schemas.md) until a style is chosen): `Route.outline: [x, y][]` (the block's front silhouette in metres), `Route.cap_depth` (m), and a `Crag.look` block (rock colours, lichen, vegetation) per rock type for the styles that texture the rock.

### 3.1 Playback rules (one core, every style)

| Piece | Rule | |
|---|---|---|
| Step time | 0.8 s at 1× in the mockups (the shipped Watch screen: 750 ms, 24 §5); deadpoint or dyno ×1.3, slip ×1.35, sketchy ×1.15 | **(tune)** |
| Moving limb | Eased; arcs out from the wall by 0.35 × distance, at most 0.22 m | **(tune)** |
| Deadpoint, dyno | The body rises 0.13 k, 0.22 k m at mid-move (k = height / 170 cm) | **(tune)** |
| Slip held | The limb goes for the hold, comes off 0.13 m down and out, and is caught back where it was; the body sags 5 cm | |
| Sketchy | The body shakes as the hold is taken | |
| Camera | Follows the hips, smoothed over ±1 s; styles that show the whole problem do not move | |
| HUD | Attempt, move n of N, the step's text, pump, power, fear on its band, the move and its odds; changes once a step | |

The core keeps the engine's frames as keyframes and only interpolates between them, so it cannot show anything the simulation did not do (R3, R6). The endings above are the exception until they become rules.

---

## 4. The ten styles

All ten draw the same frames. "Shows the mechanics" is what each does beyond the HUD under the wall, which every style has.

| # | Style | View | Look | Shows the mechanics as |
|---|---|---|---|---|
| 1 | Painted realism | Front, a little from above | Brushed sandstone with streaks, scoops and lichen; a forest out of focus; pads on white sand | Chalk on the holds touched, forearms flushing with pump, edges darkening with fear, dust when a limb skates, a trail on the deadpoint |
| 2 | Low-poly 3D | Three-quarter, the camera drifting ±7° | Faceted block, trees and climber, flat-shaded | A ring over the climber (pump and power arcs, a heartbeat dot for fear), a marker over the target, the deadpoint's arc |
| 3 | Cinematic silhouette | Side on, against a low sun | Black shapes with a warm rim; the block's profile | The wall's real angles and the hips' distance from the rock; pump glowing in the forearms; fear as a heartbeat at the edges; breath; slow motion and closing bars on the crux and the fall; subtitles |
| 4 | Isometric diorama | Isometric, whole sector | The block on a floating tile of forest floor, tilt-shifted | Status bubbles over a small climber (move, "!", "!!", a heart with the fear jump), sweat drops, stars after a fall, the high point marked on the line |
| 5 | Flat Dusk 2 | The shipped oblique side view | The game as it ships ([23 §4](23-move-types-and-art-direction.md)): dusk bands, warm rock toned by angle, teal jacket | Teal rings on holds in use turning coral with pump, the target in yellow with the move and its odds, fear jumps with their source, the deadpoint's arc and apex, the end word over the wall |
| 6 | Cartoon | Front | Saturday-morning colours, thick outlines, a big-headed climber | Gags: squash on the landing, a stretch on the slap, sound effects (WHOA!, SKRRT!, SLAP!, THUD!), sweat drops, a tremble on a fear jump, stars |
| 7 | Pixel art | Front, a quarter of the resolution | A fixed palette with ordered dithering, scaled up crisp | Sprites: sweat drops, a "!" box, stars, a flag; TRY and FLASH or REDPOINT lettering |
| 8 | Sketchbook | Front | Pencil on graph paper, a line that redraws eight times a second | Onion-skin poses behind the climber; handwritten notes: the move and its odds, "sketchy!", "foot popped. held it.", fear +8 (slip), pump, "off here (86%)", the attempts so far in the margin |
| 9 | Guidebook topo | Front, the whole problem | A guidebook's line drawing; the line in red with its number; neighbouring lines as numbered placeholders; a steepness glyph | The climbed part of the line, a small figure on it, each try's high point, the crux, the move and its odds |
| 10 | Blueprint | Front elevation and a side section | A technical drawing on blueprint blue | The reach envelope of the moving limb and the distance to the target, joint angles, the centre of mass over the feet, the hips' distance from the wall, the deadpoint's hip path and apex, odds and margin in the title block |

### 4.1 Measured

Headless Chromium on a desktop container, 1× pixel ratio: relative costs only, **not a phone**.

| Style | Setup (ms) | Frame (ms) | Style | Setup (ms) | Frame (ms) |
|---|---|---|---|---|---|
| Painted realism | 30 | 0.4 | Cartoon | 6 | 0.3 |
| Low-poly 3D | 4 | 1.5 | Pixel art | 6 | 0.7 |
| Cinematic silhouette | 5 | 0.6 | Sketchbook | 59 | 1.3 |
| Isometric diorama | 10 | 0.4 | Guidebook topo | 5 | 0.2 |
| Flat Dusk 2 | 2 | 0.5 | Blueprint | 11 | 0.4 |

All ten styles, the core and the scene bundle to 126 KB minified (43 KB gzipped); one style alone would be a fraction of that. The painted style's first build blurred its forest with canvas filters and took 1.4 s; drawing the forest small and scaling it up brought that to 30 ms, which is the kind of cost a phone would expose.

---

## 5. Evaluation

Scores 1–5, the author's judgement from the mockups, to be replaced by the owner's and by playtests. Art cost: 5 is cheapest.

| Style | Real climbs (R2) | Movement (R3) | Mechanics (R4) | Phone (R5) | Art cost (R7) | Routes and walls (R1) | Tone ([00](00-vision.md)) | Total |
|---|---|---|---|---|---|---|---|---|
| 1 Painted realism | 5 | 3 | 2 | 3 | 1 | 2 | 5 | 21 |
| 2 Low-poly 3D | 4 | 4 | 3 | 3 | 2 | 3 | 4 | 23 |
| 3 Cinematic silhouette | 3 | 4 | 2 | 4 | 4 | 3 | 5 | 25 |
| 4 Isometric diorama | 3 | 2 | 3 | 3 | 3 | 4 | 4 | 22 |
| 5 Flat Dusk 2 | 3 | 4 | 5 | 5 | 5 | 3 | 4 | **29** |
| 6 Cartoon | 2 | 4 | 3 | 4 | 3 | 2 | 2 | 20 |
| 7 Pixel art | 2 | 3 | 3 | 4 | 4 | 3 | 4 | 23 |
| 8 Sketchbook | 3 | 4 | 4 | 3 | 4 | 4 | 5 | 27 |
| 9 Guidebook topo | 5 | 2 | 3 | 4 | 5 | 5 | 5 | **29** |
| 10 Blueprint | 4 | 4 | 5 | 2 | 5 | 3 | 4 | 27 |

Reasons behind the low scores:

| Style | Held back by |
|---|---|
| Painted realism | Every rock type needs its own texture work to look right; holds are hard to read at phone size; the mechanics stay subtle by design |
| Low-poly 3D | A real block needs a 3D shape, which no data has; the meters float rather than belong |
| Cartoon | The vision's tone is grounded and respectful; a cartoon reads as a different game |
| Pixel art | At a quarter resolution a 6 cm crimp is about 2 px; hold types stop being readable |
| Isometric diorama | The climber is about 60 px tall, too small to read moves; good for a sector map instead |
| Blueprint | Dense: too much at once as the default view |

---

## 6. Recommendation

**Proposal:** one renderer core and three lenses on it, not one style for everything.

| Lens | Style | Where | Why |
|---|---|---|---|
| The wall | Flat Dusk 2 | Watching an attempt (24 §5) | It is what ships and reads on a phone; the additions are the on-wall mechanics only |
| The overview | Guidebook topo | Route screen, attempt summary in the report, every route longer than a screen | It is how real climbs are recorded, it scales to pitches and walls without new art, and it is the authoring view for real problems (§7) |
| The analysis | Blueprint, as an overlay | A toggle while watching | Shows *why*: reach, the centre of mass over the feet, odds and margin. The player is the coach; this is the coach's view |

Later, if wanted: the sketchbook's onion-skin key frames as the illustration in the session report; the silhouette for highlights (the send, the fall); the diorama as a sector map.

---

## 7. Recreating real climbs

The renderers can only be as real as the data. Today three real problems exist, their holds are authored by hand rather than traced from the rock, and every other problem is generated with a made-up name (24 open questions).

| Step | Input | Output | Rule |
|---|---|---|---|
| 1 Profile | Own photos side-on and face-on, or own sketches on site | `wall` segments (heights, angles), `outline` | Never copy guidebook topos or other people's photos into the game |
| 2 Holds | A dev-only page: a photo underlay, tap to place holds, pick type, size and orientation | `holds[]` | Positions are approximations, about ±5 cm |
| 3 Line | The usual beta: which hold, which limb, which move | `beta_line` | Authored, as the signatures are now |
| 4 Grade | The grade engine on the result ([05c](05c-grade-engine.md)) | `di_graded` against the consensus grade | Within ±1.0 DI (C7), as `build-signatures.ts` checks now |
| 5 Look | Rock type and setting | `Crag.look` | Procedural per rock type: no per-route art (R7) |
| 6 Names | Real problem and route names as geography only | `name` | No first-ascensionists or other real people ([CLAUDE.md](../CLAUDE.md) content rules) |

| Kind of climb | Size | Wall view | Overview |
|---|---|---|---|
| Boulder | 2–6 m | One screen, follow camera | Topo of the block, neighbouring lines |
| Sport pitch | 15–35 m | Follow camera; the topo as a strip down the side with the climber's position | Topo with bolts and the high point |
| Multi-pitch | 2–15 pitches | One pitch at a time | Pitch topo with belays; the day's progress |
| Big wall | Days | Key pitches only | Pitch topo, bivies, weather |

At 0.8 s a step a 30-move sport pitch plays in about half a minute plus rests; longer routes need the speed button and a summary by default.

---

## 8. If adopted: build order

| Step | Work | Size |
|---|---|---|
| 1 | Playback frames from the engine: body points in 3D and the event per step, with the landing and top-out as rules | S |
| 2 | Port the playback core (timeline, interpolation, slips, falls, mantle, IK) to TypeScript in `src/ui/wall`, replacing the current tween | M |
| 3 | Flat Dusk 2's on-wall mechanics in `render.ts` | S |
| 4 | Topo: route overview and attempt summary in the Routes, Result and Report screens | M |
| 5 | Blueprint overlay toggle on the Watch screen | M |
| 6 | Real-problem authoring page (§7 steps 1–3), dev only | L |
| 7 | Frame time on a low-end Android for each lens; budget from 18 | S |

---

## 9. The prototype

| Path | What |
|---|---|
| `scripts/dev/export-scene.ts` | Exports an attempt sequence as scene JSON (§3): `npx tsx scripts/dev/export-scene.ts <out.json> [route seed] [climber DI] [mode]` |
| `scripts/dev/visual-styles/scene.json` | The mockup attempt (§2) |
| `scripts/dev/visual-styles/src/core.js` | Timeline, interpolation, endings, 3D IK, projections, HUD |
| `scripts/dev/visual-styles/src/kit.js` | Shared drawing: layers, cameras, hold shapes, depth-sorted body parts, the block mesh |
| `scripts/dev/visual-styles/src/s01-…s10-*.js` | The ten styles |
| `scripts/dev/visual-styles/src/mount.js` | Playback driver: plays a style in a canvas and reports the HUD |
| `scripts/dev/visual-styles/build.sh`, `index.html` | Bundles to `dist/cwt-viz.js`; the page plays all ten, or one with `?s=<id>`, or a still with `?m=<moment>` |

Plain browser JavaScript, outside the TypeScript build and never shipped: a prototype to choose from, not code to keep. Whatever is chosen gets ported (§8 step 2).

---

## Open questions

1. **Which lenses?** §6 is a proposal; the scores in §5 are one person's reading of the mockups.
2. **Side or front for the wall?** The side view shows the wall's angle and how far the hips hang off the rock; the front view shows the line and the holds. Flat Dusk's oblique view is a compromise; the silhouette and the blueprint's section show what a pure side view adds.
3. **Real problems:** which crag and how many first; whether the owner's own photos can be the source; whether the three existing signatures get re-authored from photos.
4. **The block's shape** is invented in every mockup. `Route.outline` needs a source per real problem, and a rule for generated ones.
5. **Endings as rules:** the landing and top-out poses are authored for the mockups; making them rules (by height, pads, the finish hold's type) is step 1 of §8.
6. **Phone performance** is unmeasured. The painted and low-poly styles are the likeliest to miss 60 fps.
7. **Long routes:** a 30-move pitch at 0.8 s a step is long to watch. Default to the summary and offer the playback, or play at 2×?
8. **Highlights** (24 open questions): sessions and sieges show no playback. The sketchbook's key frames or the silhouette could be the highlight.
