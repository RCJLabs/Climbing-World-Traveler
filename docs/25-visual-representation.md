# 25 · Watching the simulation: visual representation

**Status (2026-10-03):** decided and built for the wall. The owner chose the **cartoon** (style 6), with natural legs and every problem drawn as a cartoon of its own climb; §10 is the spec as built and replaces Flat Dusk on the Watch screen. §1–§9 are the proposal it was chosen from, kept as the record: the scores and the recommendation in §5–§6 were the author's, not the decision. The topo and blueprint lenses of §6 are not adopted; they stay options (open questions).

Since [24](24-simulation-game.md) the wall is only ever watched, never played, so the picture no longer has to serve as an input surface. This doc sets what the picture must do, the data a renderer gets from the engine, ten candidate styles mocked up on one simulated attempt, how real climbs get recreated, and the cartoon wall that was built.

**Mockups:** the Design canvas *Climbing Simulator Visual Styles*: ten phone artboards (390 × 844), each playing the same attempt sequence live with Play, Replay and a speed button, ordered from realistic to stylised. The renderers behind them are in `scripts/dev/visual-styles/` (§9).

Related: [05a Wall and Kinematics](05a-wall-and-kinematics.md) · [06 Procedural Routes](06-procedural-routes.md) · [07 Disciplines](07-disciplines.md) · [17 UI](17-ui-ux.md) · [18 Tech](18-tech-architecture.md) · [22 Implementation Notes](22-p1a-implementation-notes.md) · [23 §4 Flat Dusk](23-move-types-and-art-direction.md) · [24 The Simulation Game](24-simulation-game.md)

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

Written for the proposal (Flat Dusk 2 on the wall). With the cartoon chosen, steps 1–3 became §10.

| Step | Work | Size | Status |
|---|---|---|---|
| 1 | Playback frames from the engine: body points in 3D and the event per step, with the landing and top-out as rules | S | ✓ §10.5, §10.6 |
| 2 | Port the playback core (timeline, interpolation, slips, falls, mantle, IK) to TypeScript in `src/ui/wall`, replacing the current tween | M | ✓ §10 |
| 3 | Flat Dusk 2's on-wall mechanics in `render.ts` | S | Replaced by the cartoon renderer; `render.ts` removed |
| 4 | Topo: route overview and attempt summary in the Routes, Result and Report screens | M | Not adopted |
| 5 | Blueprint overlay toggle on the Watch screen | M | Not adopted |
| 6 | Real-problem authoring page (§7 steps 1–3), dev only | L | Open |
| 7 | Frame time on a low-end Android for each lens; budget from 18 | S | Open for the cartoon |

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

Plain browser JavaScript, outside the TypeScript build and never shipped: a prototype to choose from, not code to keep. The cartoon was ported (§10); the prototypes stay as the record of the comparison.

---

## 10. The cartoon wall (as built)

The look of the mockup the owner chose, rebuilt in TypeScript on the engine's frames: thick ink outlines, flat toon shading, a big-headed climber in a yellow shirt with a star, blue trousers, red shoes and a red headband, white chalky hands, comic lettering in bursts. Two things changed from the mockup at the owner's request: the legs (§10.4) and the rock, which is now each problem's own block (§10.2) rather than one invented dome. Code in `src/ui/wall/`: `block.ts`, `camera.ts`, `rig.ts`, `moves.ts`, `pitch.ts`, `playback.ts`, `toon.ts`, `WallCanvas.tsx`; all but the last two are pure and tested (`tests/cartoon.test.ts`, and for routes `tests/pitch-wall.test.ts`).

### 10.1 One frame

| Layer, back to front | From |
|---|---|
| Sky, drifting clouds, two bands of hills, lollipop trees, sand; a little parallax with the camera. Under limestone: the sea, an island on the horizon, a dusty path with scrub and stones (§10.8) | Seeded by the problem, so a problem keeps its scenery; the look by rock type |
| The block: its side (the profile in cross-section), its top with moss, the face in strips | `Route.wall`, the holds, the seed (§10.2) |
| Holds by type, drawn 1.5× size; white chalk popcorn on every hold held so far; hidden holds not drawn until held (05b §13) | `Route.holds`, the frames |
| On a route: the bolts' hangers, a quickdraw on each bolt clipped, the anchor's chains and ring | `protection`, the frames (§10.8) |
| The hold the move goes for, ringed (dashed and moving; longer dashes for a dynamic move) until the move lands | The step |
| The circuit's paint mark (a disc and an arrow) by the start; two pads at the pad zone | `Route.circuit`, `protection` |
| On a route: the rope bag, the rope, the belayer; the nearer of belayer and climber drawn last | §10.8 |
| The climber, depth-sorted part by part; a harness on a route | §10.4 |
| Effects: the word, speed lines, chalk and dust puffs, sweat, strain marks, stars | §10.5, §10.6 |

### 10.2 The block is the problem

Built by `buildBlock(route)`; the seed is `stream('toon-block', route.id)`, so the same problem is always the same block. **(tune)** throughout.

| On screen | From the data | Rule |
|---|---|---|
| The face, row by row | `wall` segments | 22 rows to the shoulders and 10 over them; each row at `z = zOfY(wall, y)` with the segment's angle, so a slab leans back, a roof juts out over the pads and a lip noses over |
| Its shading | Each row's angle | Four flat tones by the face's normal against a light from up-left-front `(−0.35, 0.8, 0.5)`: lit, base, shade, deep; roof undersides take the deep tone; an ink crease where the tone changes |
| Its width | The holds' x, `width_m` | The holds plus seeded margins of 0.38–0.75 m each side; at least the route's width |
| Its top corners | Seed | Round on circles of 0.25–0.55 m, never far enough in to reach a hold |
| An arête | `feature: arete` | The face's left edge is 0.14 m left of the leftmost hold all the way up, so the line climbs the block's corner, which the camera sees; its top corner 0.08 m |
| A lip | `feature: lip` | The block's nose over the top is 0.1 m (0.04 m without) |
| The side and back | Seed, the steepest overhang | Depth `1.3–2.1 + 0.4 × max z` m; a crown 0.06–0.28 m; the back narrows by 0.05–0.2 m |
| Markings | `crack`, `hueco`, `ledge` features; seed | Features become marks where they are; three cracks, four scoops (kept 0.35 m off the line) and fourteen texture flicks; nine moss blobs on top |
| The pads | The `pad_zone` | Two pads across its width, colours by seed |
| The colours | `rock` | Sandstone warm, limestone grey-blue, granite grey; each problem's tint shifted ±7% |

A real problem's own outline (§3, §7) is not in the data; generated and signature problems alike get the seeded block above.

### 10.3 The camera

| Piece | Rule | |
|---|---|---|
| View | Orthographic three-quarter from the front-left, tilted down 8°: `X = x cos ψ + z sin ψ`, `Y = y cos 8° − (−x sin ψ + z cos ψ) sin 8°` | |
| Turn `ψ` | `clamp(24° + 0.55 × (steepest angle − 92°), 24°, 56°)`: a vertical face nearly head-on, a roof nearly in profile so the moves under it are not hidden behind the body | **(tune)** |
| Framing | The head, shoulders, hips, hands, knees and feet and the target hold, padded 1.2 m across and 1.0 m up, at least 2.2 × 2.8 m (2.6 × 3.4 m on a route, so the quickdraws below show), never wider than the whole problem at zoom 1 | **(tune)** |
| Follow | Eases to the framing with a 140 ms time constant; a drag holds until the next step starts, then eases back over 500 ms; double-tap recentres | **(tune)** |
| Zoom | 0.6–2.5× by pinch or wheel, on a route out to the whole pitch; the view is clamped to the problem | 17 §2 |

### 10.4 The body, and the knees

The engine's body model is for reach: it puts the hips 0.35 m below the middle of the hands and feet (05a §4.2), which on most problems leaves the hips level with the feet. Drawn flat from the front, as in the mockup, that folded the legs sideways with the shins horizontal: the knees the owner called unnatural. The rig keeps every hand and foot on its hold and re-poses the rest in 3D for the picture only; the engine's reach model is unchanged.

| Part | Rule | |
|---|---|---|
| Off the rock | Shoulders 0.28 k and hips 0.22 k out along the face's normal (k = height / 1.7 m), so under a roof the body hangs below it, not in it | **(tune)** |
| Hips sit back | Along the normal until each placed foot is at least 0.74 leg lengths away, at most 0.62 k off the rock, so a high foot bends the knee instead of splaying it | **(tune)** |
| Stretch | A hand or foot past 1.06 × its limb's length pulls the body after it | **(tune)** |
| Bones | Upper arm 0.46, forearm 0.54 of the arm; thigh and shin half the leg each (02 §C); two-bone IK in 3D towards a pole | |
| Knees | Forward to the rock, up along the body and a little out, more up as the leg folds; a high step drives the knee up to the chest; a heel hook opens it out and up; a drop knee turns it in and down; a foot off the rock hangs with the knee towards the rock | |
| Knees never in the rock | A knee nearer the rock than 8 cm turns round the hip-to-foot line, 15° at a time the shorter way first, until it clears; failing that, as far off as it goes | Tested on every frame |
| Feet | Toes into the rock on a hold, up and out on a heel hook, along the rock on a toe hook, pointed down hanging; a hook stays hooked until that foot moves | |
| Elbows | Down, out and off the wall; up and back pressing a mantle | |
| Head | Up the spine, leaning in to the rock; seen from behind (hair, spikes, the headband), its face coming round on the side the climber looks to: an eye, the nose, the mouth, the expression | |
| Torso | An egg from just below the hips to above the shoulders, shorts at the bottom, so the thighs show where they leave the hips | |

### 10.5 The moves

Each step plays from the engine's pose before it to the pose after it (tested), for its own time at 1×, then holds 250 ms so the commentary can be read. 2× and 4× divide both. **(tune)** throughout.

| Step | ms | What it looks like | Word |
|---|---|---|---|
| Static, hand / foot | 600 / 480 | The weight shifts first, then the limb arcs off the rock (0.38 × distance, at most 0.24 m) and lands | |
| Match, bump | 620 / 700 | A short reach; a bump touches a hold on the way | |
| High step | 950 | The knee comes to the chest and the foot lands high, then the body rocks over it towards the foot | |
| Heel hook, toe hook | 850 | The leg swings out and up onto the hold, then pulls the hips in | |
| Deadpoint | 850 | Load (sink and sit back, 30%), drive (hips in and up 0.13 k), the slap at the top of the movement, settle | STICK!, CATCH! or SLAP! |
| Dyno | 1150 | A deeper load; the feet push until the legs straighten, then trail; the other hand lets go; up 0.24 k; the catch, the feet swing out from the rock and come back if there are footholds | HUP!, then STICK!, CATCH! or SLAP! |
| Sketchy | +250 | A barn-door wobble as the hold is taken | NNGH! |
| Slip held | +450 | The limb gets to the hold, pops off down and out, and is caught back; a dynamic one launches the body and drops it back | WHOA! (hand), SKRRT! (foot) |
| Shake-out | 1300 | One hand drops, hangs and shakes, and goes back | |
| Chalk | 850 | A hand to the bag at the hips, a puff | |

The words follow the engine's result: STICK! for a catch at the apex, CATCH! for a catch, SLAP! when the move was sketchy. The face goes with the move: focus, strain on the effort, scared or surprised on a slip, calm on a rest.

### 10.6 The endings

| Ending | ms | Phases | Word |
|---|---|---|---|
| Send | 2600 | Hands to the lip; press until the shoulders are over them while the feet walk up to smears under the lip; the right foot onto the lip; stand on top facing out, arms up, grinning | SENT! |
| Fall | 2300 | The failed move replayed as a near miss (a slap or a strain); the hands come off; peel and drop, feet under the body; land sitting on the pads with a squash, dust and dizzy stars | WHOA!, WAAAH!, THUD! |
| Pumped | 2300 | As a fall, letting go | ARGH! |
| Jump | 1500 | Let go and drop feet first into a crouch on the pads | |

The start pose shows for 600 ms before the first move and the ending's last frame 450 ms before the result. Reduced motion skips the Watch screen (24 §5).

### 10.7 Checking it

| Check | Where |
|---|---|
| Hands and feet on their holds mid-move; knees at least 8 cm off the rock; upper limbs at their lengths; every step starts and ends on the engine's poses; a dyno lifts the hips above a static move's; endings stand on top or land on the pads; the camera keeps the climber in frame at 390 × 460, 360 × 400 and 800 × 600 and the view on the problem; the block is the same every time, differs between problems, follows the wall profile and holds every hold | `tests/cartoon.test.ts`, on attempts on the signatures and every eighth benchmark |
| On a route (§10.8): the cliff's rows at every change of angle and no pads; the first bolt clipped from the start and the engine's clips in order; the rope from the belayer through every clipped quickdraw, in order, to the climber; every rope step starts and ends on the engine's poses; a fall drops the engine's fall length and stops short of the ground; a take and a lower; every attempt ends at the foot of the route; the camera keeps the climber and the quickdraw in frame and zooms out to the whole route; the pacing | `tests/pitch-wall.test.ts`, three attempts on every fourth Kalymnos benchmark |
| By eye: every problem's block, every move of an attempt at any point through it, the endings, live playback; `skel=1` draws the bones over the picture; `bench` times a frame. `crag=kalymnos` puts routes on any sheet; `rope` shows every rope step and the ending (`kind=send`, `fall`, `worked`, `ground`) | `scripts/dev/cartoon/` on the dev server: `?sheet=blocks`, `moves`, `at`, `ending`, `rope`, `play`, `bench` |
| The joints in numbers for one attempt | `npx tsx scripts/dev/cartoon/probe-rig.ts [route seed] [DI offset]` |

### 10.8 Pitches

A route climbed on a rope (`discipline: sport`) plays on the same wall: the block becomes a buttress of the cliff, and the frames and the attempt log add the rope. Code in `pitch.ts`, read by `playback.ts`; drawn by `toon.ts`. Everything is rebuilt from the frames with the engine's own functions (`fallLength`, `reachesGround`, `bodyPoints`, `applyMove`), so a fall drawn is the fall the engine took, and nothing in the engine or the data changed for it. **(tune)** throughout.

**The cliff.**

| On screen | Rule |
|---|---|
| The face | The route's wall plus a headwall of 1.8–3.2 m over the anchor at the last segment's angle; a row at every change of angle and none taller than 0.5 m (a 30 m profile keeps its creases); only the strips on the canvas drawn |
| Its width | The holds plus 0.55–0.85 m to the left, so the buttress's side (the profile) stays next to the climber, and 1.1–1.8 m to the right; the base flares over its bottom metre |
| Markings | As a boulder's, as many to the square metre; on limestone, `round(top / 5) + 2` streaks of orange or blue-grey 3–12 m long; a tufa column on each `tufa` segment where the line climbs it |
| Scenery | Under limestone: the sea, its horizon 42% down the screen and sinking a little as the camera climbs, an island, the path at the foot of the rock. By rock type, not by crag (open question 10) |
| No pads | — |

**The hardware and the rope.**

| Piece | Rule |
|---|---|
| Bolts | A hanger at each bolt, drawn larger than life like the holds |
| Quickdraws | A sling and two karabiners, 0.22 m long, hanging straight down (lying on the rock under a slab), on each bolt from the moment the clip puts it there. The first bolt is stick-clipped (26 §2) |
| The clipped bolts | After each frame: the bolt the rope last came tight to is found by its height (`rope.last_clip_y`), every frame; generated routes are bolted so no line passes a bolt, so the count equals the engine's `rope.next` (tested) |
| The anchor | Two hangers, three chain links each, a ring; a quickdraw on the ring once clipped |
| The rope | From the belayer's device up through each clipped quickdraw in the order they rise, the anchor's ring once clipped, a bight in the clipping hand while it clips, to the tie-in at the front of the harness. It sags with slack: `(1 − tight) × min(0.6 m, 0.16 × span)` per span; tight while the rope holds the climber |
| The rope bag | A tarp and coils by the belayer, the slack end up to the brake hand |
| The belayer | The 15 §1.4 stub, drawn: 1.63 m, teal shirt, purple trousers, standing 1.25 m right of the first bolt and 1.0 m out from the steepest of the bottom 2.2 m of rock; guide hand up the rope, brake hand low, looking at the climber; lifted off the ground up to 0.45 m by a catch (`min(0.45, 0.07 × fall + 0.08)` m); hands working while it lowers the climber |

**The rope's steps.** A step that adds a rope entry to the log (it can add several: a fall, then the take) plays as a sequence of beats; the log keeps its last 40 entries, so a step's entries are found as the shortest new tail (`freshOf`).

| Beat | ms at 1× | What it looks like | Word |
|---|---|---|---|
| Clip | 1200 | A hand to the gear loop, a quickdraw up onto the hanger, the hand down to the tie-in for the rope and up to clip it, back to its hold. The hand on a hold the bolt is clipped from holds on (the cheaper one if both); a bolt out of reach of the other hand and the climber locks off and rises towards it, up to 0.3 m | CLIP! |
| Try | ¾ of the move | The move that fails, as a near miss | SLAP! or NNGH! |
| Fall | 260 + (300 + 150 × fall, to 8 m) + 700 | Hands off, peel off the rock, drop the engine's fall length towards hanging under the top quickdraw, the rope comes tight, a bounce of `min(0.35, 0.05 × fall + 0.1)` m, the belayer pulled up. The feet stop short of the ground; off the first moves the climber only sags onto the rope | WHOA! or ARGH! (pumped), WAAAH! past 2.5 m, TWANG! |
| Hang | 700 | Sitting in the harness, hands on the rope over the knot, feet on the rock if it is in reach, a hand dropped to shake out | |
| Back on | 700 + 90 per metre (8 m at most) | Hand over hand up the rope to under the stance, then hands and feet onto the holds the fall left | |
| Take | 1100 | The call, then off the holds and sitting back onto the tight rope (a tight belay: the drop is `fallLength` at belay quality 100) | TAKE! |
| Pull through | 1300 | A hand to the nearest quickdraw if it is in reach, pull up, the limb on to its hold | |

**The endings.**

| Ending | Beats | Word |
|---|---|---|
| Chains (sent) | Clip the anchor's ring; a fist in the air; sit back and lower off; land facing out, arms up, grinning | CLIP!, SENT!, LOWER! |
| Chains (worked) | As sent, without the fist; land facing out | CLIP!, LOWER! |
| Fall, pumped | The fall, a short hang, the lower, land facing the rock looking up at the route | as the fall |
| Lower | Take, the lower, land | TAKE! |
| Ground | Off the first moves (centre of mass under 1.5 m): a drop onto the feet and up. From higher: a hard landing, sitting, a dust puff, no words and no stars (open question 2) | |
| The lower | `1300 + 75 × height` ms (3.6 s at most): sitting in the harness, past each clipped quickdraw 0.7 k under it, walking down the rock where it is in reach, to the foot of the route left of the belayer | |

**Pacing.** A Kalymnos pitch is 120–340 steps, about 85% of them routine; at a boulder's pace one played for 1.5–5 minutes at 1×. On a route a routine move (clean, inside the auto-success margin, not dynamic) plays at 0.2 of its time and runs on into the next without a hold; another clean static move at 0.6 with a 100 ms hold; shake-outs and chalking at 0.55 with 80 ms; dynamic and sketchy moves, slips and the rope's beats in full (`PITCH_PACE`). Measured on 48 attempts on the benchmarks: sends 41–79 s at 1× (median about a minute), everything median 70 s, p90 112 s (worked routes with several falls).

**Frame time.** Headless desktop Chromium, 390 × 470: 3.9 ms a frame on a pitch at 1× pixel ratio and 7.8 ms at 2× (1,680 frames over five routes), against 2.3 and 4.4 ms on the Font problems in the same run. The tall face is culled to the canvas (strips, marks, holds).

---

## Open questions

1. **The other lenses.** The cartoon is the wall. The topo overview and the blueprint overlay of §6 are not adopted; whether either is wanted, drawn in the cartoon's look, is open.
2. **Tone.** The vision ([00](00-vision.md)) is grounded and respectful; §5 marked the cartoon down for that, and the owner chose it. The gags (THUD!, dizzy stars) suit pad falls; serious injuries, highball falls and the `deadly` routes and objective hazard of P3–P4 need their own treatment in this look, never played for laughs (CLAUDE.md content rules).
3. **Real problems:** which crag and how many first; whether the owner's own photos can be the source; whether the three existing signatures get re-authored from photos. Until then the block is seeded from the data (§10.2), not traced.
4. **The block's outline** is generated (§10.2). A real problem's own silhouette would need `Route.outline` (§3) and a source.
5. **The engine's body model** keeps the hips 0.35 m under the middle of the hands and feet (05a §4.2), which the rig corrects for the picture (§10.4). If the reach model ever moves the hips by the legs' fold, the rig's sit-back should shrink to match.
6. **Phone performance** is unmeasured. Headless desktop Chromium draws a 390 × 470 wall in 3.7 ms a frame at 1× pixel ratio and 7.2 ms at 2× (4,080 frames over the 12 problems of the dev gallery's `?sheet=bench`); a pitch costs about 1.7 times a boulder's frame (§10.8); the canvas is capped at 2× pixel ratio. A low-end Android is the test (18). If it misses 60 fps, the first saving is to draw the scenery and the block once per step instead of every frame.
7. **A pitch's length** (§10.8). Compressed, a send plays in about a minute at 1× and a worked route with several falls in up to two; whether a route should default to 2×, or skip to the crux, is a call for playtesting. The engine's line is long (a hand or foot move per step, about 200 steps for 25 m), so pacing, not the drawing, sets the watch time.
8. **Highlights** (24 open questions): sessions and sieges show no playback.
9. **The rest of the app** keeps the Flat Dusk theme ([23 §4](23-move-types-and-art-direction.md)); only the Watch screen is cartoon. Whether the cartoon becomes the whole game's look is the owner's call.
10. **Scenery by crag.** The sea is drawn under every limestone route and the forest under sandstone and granite, because P1b has one crag of each; Frankenjura or Céüse would want inland limestone. A `look` on the crag (schemas first) is the fix when a third crag arrives.
11. **The belayer and the clipping hand** are pictures of rules the engine does not have: the belayer stub stands where the wall puts it and catches every fall the same way, and the hand that clips is the one not holding the clipping stance. When partners and belay skill arrive (15), the catch (soft or hard, how far the belayer is lifted) should come from the belayer, and the clip from the engine's choice of hand if it ever makes one.
12. **Volumes on rock.** The generator's `volume` holds are drawn as the boulder renderer's triangles, which read as gym plastic on a limestone face; a rounded flake or blob would read as rock.
