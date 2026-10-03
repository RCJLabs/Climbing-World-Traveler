# UI and UX

The game is played one-handed on a phone in portrait, in sessions of five to twenty minutes, often outdoors. The wall view has to make a turn-based tactical decision readable in a glance and the only real-time input, the commit window, has to be fair under a thumb. This doc specifies the wall view interaction, the HUD, the commit-window bar, the screen map, onboarding and accessibility. Visual values (sizes, timings) are starting points marked **(tune)** for on-device testing.

Related: [05a Wall and Kinematics](05a-wall-and-kinematics.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [02 Character Model](02-character-model.md) · [03 Traits](03-traits.md) · [16 Meta-progression](16-meta-progression-and-runs.md) · [18 Tech Architecture](18-tech-architecture.md)

> **Simulated play ([24](24-simulation-game.md)):** the wall plays attempts back and takes no input. Limb selection, previews, *Go*, the commit-window bar and the auto-climb toggle (§2–§4) are gone; what stays from §2–§3 is the camera, the rig, the HUD meters and the fear sources. The screen map gains the training week and simulate controls on the Planner, a Watch screen and a Report screen ([24](24-simulation-game.md) §2–§5).

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason. **P1b** has no World Map yet: the Crag screen lists the other live crags as travel cards (fare, days, legs, why a trip cannot start now), each sector card shows the grade its routes start from, and route grades are French on sport crags ([26 §5](26-p1b-implementation-notes.md)).

---

## 1. Principles

1. **Portrait, thumb-first.** All confirm and cancel targets live in the bottom 35% of the screen; the wall occupies the top 65%. Minimum tap target 48 × 48 dp.
2. **Nothing hidden behind timing except the commit window**, and even that has an Auto-commit off-switch.
3. **Every number has a label.** Fear sources, pump costs and success bands say why, not just how much.
4. **One decision at a time.** The wall view asks: which limb, which hold, go. Everything else is a tap away, not on screen.

---

## 2. Wall view

> **Input superseded by [23](23-move-types-and-art-direction.md)** (move types, Flat Dusk) as its build order lands: dynos and deadpoints use Swing and Catch, moves the stance test flags use Lean, every other move is dragged with Two-Thumb Grip after it is picked (*Go* is now *Auto*), and the look is Flat Dusk ([23 §4](23-move-types-and-art-direction.md)). Picking a limb and a hold, the decision triangle, the camera and motion below stay.

The core loop, left to right in time:

| Stage | What the player sees | Input |
|---|---|---|
| Idle | The route, the climber rig posed on current holds, holds drawn as type silhouettes ([05a](05a-wall-and-kinematics.md)). Current holds carry the limb glyph (LH/RH/LF/RF). | Pinch to zoom 0.6×–2.5×, drag to pan; double-tap recentres on the climber |
| Limb select | Tap the climber's hand or foot, a limb glyph, or one of four limb buttons in the bottom bar. The **reach envelope** for that limb shades the wall; reachable holds brighten, unreachable holds dim and show a reason on long-press ("too far 0.3 m", "blocked by LH", "wrong side"). | Tap limb; tap again to deselect |
| Hold highlight | Tap a reachable hold. The **preview triangle** appears beside it: success band · pump cost · resulting position quality. Move class is named ("deadpoint") with a small icon; a commit-window glyph appears if the move is dynamic. | Tap hold |
| Confirm | A large **Go** button in the thumb zone; a pale ghost of the rig shows the pose a clean landing leaves until the move is played. | Tap Go, or tap another hold to re-preview |
| Resolve | Outcome text and meter deltas animate (≤ 400 ms); on dynamic moves the commit window opens first (§4). | — |

Other actions (match, bump, shake, chalk, clip, place gear, kneebar, downclimb, take, jump off) sit in a horizontal action strip above Go, each with its pump/time cost; a disabled action answers a tap with why it is off. The **preview triangle** uses three fixed slots so the eye learns positions: left success band (text and icon: *solid* / *probably* / *sketchy* / *desperate*, or a percentage above the `route_reading` threshold), centre pump cost as a bar segment drawn onto the pump meter itself, right position quality as a 1–5 stance icon. Rest value is shown on hold long-press as "shake −1.1 pump": the change in pump from a first shake hanging on that hold, negative when it recovers, the same number the Shake button shows for the current stance. Long-press is off while a Reach or Balance move is armed, so a thumb resting before its drag is never read as a question.

**Camera.** The wall is the oblique side view of [05a](05a-wall-and-kinematics.md): a hold at lateral `x` and height `y` projects to `X = −z(y) + 0.5·x`, `Y = y`, so an overhang leans out to the left and the rock body sits to the right. The camera frames the climber: shoulders, hips and the four limb ends, plus 0.9 m of rock above the shoulders and 1.0 m below the hips, padded 1.2 m across and 0.8 m up, never smaller than 2.2 × 2.8 m and, at zoom 1, never wider than the whole problem. Zoom (0.6×–2.5×, of which the lower end stops at 0.8× the whole problem) and pan sit on top of that frame, and the view is clamped so it never leaves the problem. After a move the pan eases back to the climber **(tune)**.

**The rig.** Torso as a tapered capsule, head, two-bone arms and legs posed from the same body points the reach check uses ([05a §4.2](05a-wall-and-kinematics.md#42-anchors-body-centre-hips-and-shoulders)), so what is drawn is what was measured. Elbows drop and sit back off the wall; knees point into it. The far-side limbs (LH, LF) are drawn behind the torso a tone darker, the near-side limbs in front; the selected limb is amber. Hold rings, target rings and limb glyphs are drawn above the body, so the climber never hides a choice. Face segments shade darker as the rock steepens.

**Motion** (all **(tune)**). Since [24](24-simulation-game.md) the wall is only watched, and since 2026-10-03 it is the cartoon of [25 §10](25-visual-representation.md): its camera (§10.3), rig (§10.4), per-move timings (§10.5) and endings (§10.6) replace the camera, rig and table below, which describe the Flat Dusk wall as it was built:

| Event | Animation |
|---|---|
| Static move, rest, chalk | 250 ms ease-in-out between poses; the moving limb travels an arc out from the wall and up (`min(0.25, 0.35·d)` m at mid-move) |
| Deadpoint, dyno | 420 ms; the body lifts on a half-sine through the move, 0.10 (deadpoint) or 0.22 (dyno) × body scale at mid-flight |
| Sketchy move, recovered slip | 320 ms shake of the torso, even when no hold changed |
| Fall, jump off | 700 ms: hands and feet let go, the body drops to the pads accelerating from rest and lands at 65% of the time; *FELL* or *OFF* above the body |
| Send | 700 ms: up and over the lip; *SENT* below the body |
| Reduced motion | every pose change snaps; no ending animation, straight to the result |

The attempt screen stays up through the ending and then hands over to the result screen (ending + 250 ms).

**Auto-climb toggle** sits top-right of the wall. On, margin-safe moves animate at 250 ms each until the next intervention point (crux band, clip, rest, gear); a bar at the top shows "auto" and any tap pauses it. When it hands back, the reason (crux, dynamic move, pumped, fear, a good shake, an unseen hold) shows in the preview line. Auto-climb never plays a commit window unless `auto_commit` is on; it stops and hands the window to the player.

---

## 3. Meters HUD

A thin stack along the left edge, labelled with icons and short text, legible at arm's length:

| Meter | Drawing | Detail on tap |
|---|---|---|
| Pump | vertical bar, fills upward; preview cost drawn as a hatched segment; the band above 80 is marked | pump recovery rate at this hold |
| Power | small bar beside pump | cost of the previewed dynamic move |
| Aerobic reserve | thin bar under pump | time on route |
| Skin | icon with a number | sharpness of previewed hold |
| Fear | horizontal bar at the bottom of the stack with the **IZOF band** drawn as a bracket (centre and half-width from `composure`, [02 §D](02-character-model.md)); the needle colour-shifts only outside the band | list of **labelled sources**: "runout +3 · height +2 · last fall +2 · partner spray −1 · warm-up −2" |
| Focus | small ring around the limb buttons | — |
| Chalk | hand icon, dims as chalk runs out | — |

Fear sources are always shown as a list, never a single number, so the player learns what moves it. When `risk_judgement` is low the danger label and consequence preview are shown with visible uncertainty ("probably safe?").

---

## 4. Commit-window bar

> **Superseded by [23 §2.3](23-move-types-and-art-direction.md)** (Swing and Catch) since `p1a-12`. Kept for the record.

Opens only for `dyno`, `deadpoint`, slaps and optional foot-cut recoveries ([05b](05b-move-resolution-and-attempt-loop.md)).

- **Two taps: launch, then catch.** Confirming a dynamic move opens the window in a *ready* state with the zones drawn and no marker. The first tap (*launch*) starts the sweep; the second (*catch*) stops it, and the offset is measured from the launch. The player chooses when the sweep starts, so it never runs while the thumb is elsewhere, and the input follows the move: you commit, then you catch. Either tap can land anywhere on the bar or the large button below it. While ready, an **Auto** button resolves this one window as Auto-commit; that is the per-move escape hatch, separate from the global setting. A sweep that ends with no catch is a *cut*.
- **Placement:** a horizontal bar across the bottom 20% of the screen, 84% of screen width, 56 dp tall; the entire bar and the 120 dp below it are the tap target, so a thumb anywhere low on the screen registers. The wall dims 30% behind it; the target hold stays bright.
- **Sweep:** a marker travels left → right once (mirrored for the left-handed setting), duration 750 ms default, device-tuned range **600–900 ms**; `RunOptions.sweep_speed` scales it 0.6×–1.6× as an accessibility setting with no scoring penalty. Marker speed and zone width are then modulated by the build and state as in 05b (fear outside the IZOF band speeds the marker; pump speeds it; `commitment` and `dynamic_movement` widen the zone).
- **Zones:** outer zone (*caught*) drawn as a solid mid-luminance block; inner zone (*apex*) as a brighter block with a diagonal hatch so it is distinguishable without colour; the bar outside the zones is dark with a dotted texture; the marker is a high-contrast white line with a 2 dp dark outline. Zone edges are labelled above the bar on the first ten windows of a run ("apex" / "caught" / "slap").
- **Cues:** a 10 ms haptic pulse and a short tick on launch; a 20 ms pulse on the catch. No cue is tied to the marker entering the zone, so haptics never leak timing. The optional "assist tick" (settings, default off) plays a sound at zone entry for players who cannot see the bar; it is an accessibility aid and does not change the resolution.
- **Resolution display:** the marker freezes where the tap landed, the zone it hit flashes, and the result word (*apex / caught / slap / cut*) appears for 500 ms with the margin delta.
- **Auto-commit:** when on, the bar is replaced by a 400 ms "commit" animation with the stat-roll result; the player never has to tap. Backgrounding the app with a window open resolves it as Auto-commit ([18 §5](18-tech-architecture.md)).
- **Logging:** the tap offset (ms from the inner-zone centre) is written to the action log as `{ t: 'commit', tap_offset_ms }`; `null` for Auto-commit.

---

## 5. Screen map

| Screen | Purpose (one line) | Key controls |
|---|---|---|
| Create Climber | Build the run: background, body, allocation, traits, identity ([16 §1](16-meta-progression-and-runs.md)) | Step tabs, Quick-build chips, slider trade-off panel, trait filter by tag and cost, budget counter pinned to the top |
| World Map | Choose where to be: crags by season colour, travel edges with cost and days | Pinch-zoom globe-to-region, filter by discipline and season, tap crag for card, "Go" with cost confirmation |
| Crag | Live at a place: sectors, conditions, who is here, access rules, lodging | Sector list, conditions strip (temperature, humidity, wet days), NPC row, lodging picker, access warnings |
| Route Select | Pick a line: procedural and signature routes with grade, style tags, danger, your history | Sort by DI or style, filter, route card with topo thumbnail, mode picker (onsight / flash / redpoint / work), auto-climb default |
| Attempt | The wall view (§2–4) | Limb buttons, action strip, Go, auto-climb toggle, pause |
| Day Planner | Fill two activity blocks: climb, train, rest, work, social, travel, admin, physio | Drag chips into two slots, energy and money forecast, weather for the day, "Sim day" button |
| Training | Choose activities by facility, see load (acute:chronic) and the three adaptation clocks | Activity cards with stimulus tags, load gauge, deload suggestion |
| Character Sheet | Everything about the climber: body, 36 attributes, traits, estimated grades, age curves | Grouped accordions, attribute history sparkline, "helps with / hurts with" from tags |
| Journal / Tick List | The story so far: ticks, pyramid, events, journal lines | Filter by style and discipline, pyramid chart, share card |
| Social | People: partners, mentor, rivals, companion, reputation per region, following | NPC cards with trust and familiarity, plan-a-day button, reputation list |
| Shop | Buy, sell and resole gear; insurance; vehicle | Catalogue tabs, condition bars on owned gear, sell value preview |
| Run Summary | The legacy screen: `RunSummary`, score, unlocks, legacy NPC, seed copy | Hall of Fame button, "New run with this seed", share code |

Navigation: a bottom tab bar with five entries (Planner, Crag, Climber, Social, More); the Attempt screen is modal and hides the tab bar.

---

## 6. Onboarding

- **Quick-build presets.** Six archetype chips (Font Technician, Power Boulderer, Endurance Sport, Bold Trad, Comp Kid, Late Starter) fill body, allocation and traits; each shows three one-line consequences ("slopers +, crimps −, money tight"). Players can accept, then edit any step.
- **Progressive disclosure.** The 36 attributes (12 physical, 12 technique with two phase-gated, 6 mental, 5 lifestyle, one per-rock knowledge panel) are shown as four group totals first; a group expands on tap. The 150 traits open in a filtered list: the 24 most legible traits first, then "show all", with filters by category, cost sign and tag. Hidden-trait opt-in is one toggle with its bonus stated.
- **Tooltips from the tag vocabulary.** Every tag renders a one-line tooltip (`crimp` → "small edges held with bent fingers; finger strength and crimp technique"); traits, holds, events and style profiles reuse the same text, so the vocabulary is learned once.
- **First session.** A three-boulder tutorial at the start crag: boulder one teaches limb select, envelope, preview, Go (static only); boulder two introduces pump, rest and the fear list on a highball-looking but padded problem; boulder three is the **first-dyno tutorial**: the commit window opens with the sweep at 0.7× speed, zones labelled, a free retry, and the Auto-commit option offered immediately after regardless of result. Tutorial boulders are real procedural problems with the tutorial flags on, so they count for ticks.

---

## 7. Accessibility

- **Colour-blind-safe hold states.** State is encoded by outline weight and texture, never colour alone: reachable = solid outline, selected = thick pulsing outline, unreachable = thin dashed outline at 40% luminance, wet = droplet glyph, chalked = speckle, hidden = not drawn. The success band uses text plus a four-step icon; the commit bar uses hatching and luminance. Palettes are tested against deuteranopia, protanopia and tritanopia simulations before each release.
- **Auto-commit.** A single settings toggle; when on, no timing input is ever required anywhere in the game, and the expected value is between *caught* and *apex* minus a small tax ([05b](05b-move-resolution-and-attempt-loop.md)). It is offered during the first-dyno tutorial and never buried.
- **Adjustable sweep speed.** `sweep_speed` 0.6×–1.6× with a live preview bar in settings; no scoring effect.
- **Text scaling.** Respects the OS font scale up to 200%; layouts reflow, the preview triangle collapses to a vertical list above 150%.
- **Haptics and audio** are independently switchable; nothing depends on hearing.
- **Reduced motion** replaces the sweep with a discrete 8-step marker and keeps the ghost pose, which is a still image.
- **Screen-reader labels** on every control; the wall exposes a hold list by distance for non-visual play of static moves.

---

## Open questions

- Whether the limb buttons should be mirrored for left-handed players (default: yes, with the setting shared with sweep direction).
- Should the preview show a numeric success percentage at all before `route_reading` reaches the threshold in 05b, or only bands? This doc assumes bands only below the threshold.
- Landscape support for tablets: proposed as a P2 stretch; portrait-only until then.
- Whether the launch tap should be able to time out (a window left in *ready* for minutes is harmless now, but a later phase with a running clock on the wall may want it to resolve as Auto-commit).
- The figure is drawn at one body shape for everyone (proportions scale with height only). Showing ape index, mass and leg length on the rig would make builds visible on the wall; it needs the anthropometric proportions from 02 §A wired into the pose.
