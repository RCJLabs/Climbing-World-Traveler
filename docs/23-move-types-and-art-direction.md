# Move Types, Controls and Art Direction

The climbing overhaul. Different moves ask different things of a climber, so they get different controls: a dyno is aimed, launched and caught; a balance move is held in balance; an ordinary reach is gripped and placed. The look moves to **Flat Dusk** on the three-quarter camera. The character builder, the career, training, the route generator and the grade engine stay; this doc says how the new controls feed the same engine.

**Status:** steps 1–4 of §5 are built: the dyno prototype (§6), the Flat Dusk look, Swing and Catch for dynos and deadpoints (§3.3), and Two-Thumb Grip for every other move (§2.1, §3.1). Two-Thumb Grip has not been played on a phone yet. Balance is still design; until it lands, balance moves play as Reach.

**Supersedes:** [05b §8](05b-move-resolution-and-attempt-loop.md#8-commit-window) (the commit window; replaced by §3.3, Auto-commit kept) and [17 §4](17-ui-ux.md) (the commit bar); [17 §2](17-ui-ux.md)'s *Go* for every move (§2.1); the rest of [17 §2–§3](17-ui-ux.md) (wall input, HUD) once Balance is built. **Amends:** [01 §3](01-pillars-scope-roadmap.md#3-non-goals) (non-goals) and the input rules in `CLAUDE.md`.

Related: [05a Wall and Kinematics](05a-wall-and-kinematics.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [05c Grade Engine](05c-grade-engine.md) · [17 UI/UX](17-ui-ux.md) · [18 Tech Architecture](18-tech-architecture.md) · [19 Balance Testing](19-balance-and-simulation-testing.md) · [schemas](schemas.md)

---

## 1. Principles

1. **The engine stays the referee.** Real-time input produces a few numbers per move (`perf`, §3), logged in the action the way `tap_offset_ms` is today. The engine resolves the move from them, so replays reproduce exactly and saves stay event-sourced ([18 §5](18-tech-architecture.md)).
2. **Timing is never required.** Every move type has an Auto path whose expected value sits a little below good play, as Auto-commit does today ([05b §8.4](05b-move-resolution-and-attempt-loop.md)). The grade engine and the harness use Auto, so grades do not depend on thumbs.
3. **The control matches the move.** What the thumb does is what the climber does: hold on, reach, stay over the feet, commit and catch.
4. **Only the moves that matter ask for input.** Auto-climb ([05b §10](05b-move-resolution-and-attempt-loop.md#10-auto-climb)) still plays margin-safe moves; the controls appear at cruxes.
5. **One thumb is enough.** Two-thumb grip has a one-thumb mode (§2.1); Balance and Dyno are one-thumb by design.

---

## 2. Move types

| Type | Engine classes ([05b §2](05b-move-resolution-and-attempt-loop.md#2-move-classification-from-geometry)) | When | Control | `perf` logged | Auto |
|---|---|---|---|---|---|
| **Reach** (built) | `static`, `high_step`, `heel_hook`, `toe_hook`, `match`, `jam`, `bump`, `mantle` | Default for any move that is not Balance or Dyno | **Two-Thumb Grip** (§2.1) | on the `move` action: `perf: { kind: 'reach', time_ms, place }` | no `perf`: the move exactly as it resolved before Reach |
| **Balance** | the same static classes | The stance test (§2.2) fails | **Lean** (§2.2) | `{ kind: 'balance', out_ms }` | drift paused, `out_ms` from stats |
| **Dyno** (built) | `deadpoint`, `dyno` | Always | **Swing and Catch** (§2.3) | on the `commit` action: `swing: { power, angle_deg, catch_ms }` | `swing: null`, the 05b §8.4 roll, unchanged |

### 2.1 Reach: Two-Thumb Grip

- **Pick** the move as before: tap a hold (and a class chip); the decision triangle shows its odds. A move that is not a dyno is then armed, with a yellow placement ring on the hold.
- **Drag anywhere on the wall:** the limb follows by the same amount, so the thumb never covers the hold, and the camera holds still. Let go on the ring to place it. A release up to 1.5 rings out still lands, on the edge; further out and the limb goes back, with the time already spent kept against this move.
- **Two-thumb mode, hand moves:** a grip pad for the holding hand replaces the limb buttons (*HOLD LH* bottom left for the left hand, bottom right for the right). The drag starts only while the pad is held. Lift it mid-drag and the hand goes back. The pad is needed only for the drag, not while reading the move. A foot move needs no pad: both hands hold.
- **The grip budget** drains as a ring round the holding hand: teal while there is grip left, then coral filling toward letting go at twice the budget. Feet run no clock.
- **One-thumb mode** (title screen → *Reach moves*; the default where the device reports fewer than two touch points): no pad. The engine sees the same two numbers either way.
- **Auto** (the button where *Go* was) plays the move with no input; so does auto-climb.

Not built from the first proposal: letting go of both pads as a jump-off (*Jump off* stays a button), pads held while reading a move, and the mockup's feet that follow the hands on their own.

### 2.2 Balance: Lean

- **Stance test** (when a move is a Balance move, **(tune)**): with the moving limb released, project the remaining anchors front-on (lateral `x`, height `y`; [05a §1](05a-wall-and-kinematics.md)) and take their convex hull as the base. The move is Balance if the wall angle at the hips is `≤ 90°` and the centre of mass sits within `0.08 m` of the base edge, or if a foot in the base is on a `smear`.
- The centre of mass drifts at `v_d` (§3.2). The player drags the hips to keep it inside the base. The moving limb unlocks only in balance; outside the base for too long is a barn door.
- The three-quarter camera compresses side to side, so a **BASE** inset (front view of the base and the centre of mass) is always shown on Balance moves.
- **Pause the drift** (setting): the centre of mass moves only when the player moves it, so no timing is needed.

### 2.3 Dyno: Swing and Catch

- **Load and aim:** drag back anywhere; the pull sets direction and power. The start of the flight path is drawn (0.2 s of it by default); the dashed circle around the hold is where the shoulder must get to for the hand to reach.
- **Flight:** the centre of mass flies ballistically; the feet cut on steep ground.
- **Catch:** a ring closes on the hold as the hand nears it; tap anywhere while the hold is in reach. The slowest moment in reach is the dead point and the cleanest catch.

---

## 3. How a move resolves

The margin, outcome bands and costs of [05b §4–§5](05b-move-resolution-and-attempt-loop.md#4-resolution) stay. Each move type adds a performance term `Δ` (DI) to the margin and may scale costs. All constants **(tune)**.

### 3.1 Reach (built)

Code: `src/sim/reach.ts`; judged in `resolveMove` (`src/sim/attempt.ts`).

```
grip budget  G = 3200 × clamp(0.5 + margin / (2T), 0.4, 1.5) × (1 − pump/200)  ms       margin and T of the move itself, before Δ
overrun      o = max(0, time_ms − G) / G                                                 hand moves only; a foot move runs no clock
pump cost    × (1 + o)                                                                   slow reaches pump you out
pop          o > 1 → the holding hand opens: the 05b §4.5 slip branch with one anchor fewer; the move does not land
placement    Δ = 0.03 − 0.09 × min(1, place)                                             place = landing distance / ring radius
Auto         no perf: Δ = 0, pump × 1, no pop                                            the same as place = 1/3, time = 0.6 G
```

| `margin / T` | `G` fresh | `G` at pump 60 | pops after (fresh) |
|---|---|---|---|
| ≤ −0.2 | 1,280 ms | 900 ms | 2.6 s |
| 0 | 1,600 ms | 1,120 ms | 3.2 s |
| 1 (where auto-climb takes over) | 3,200 ms | 2,240 ms | 6.4 s |

Departures from the first proposal, and why:

- **Auto is the move as it was.** The proposal made Auto `Δ = −0.05` with nothing above 0; here Auto is `0` and a dead-centre placement earns `+0.03`. Auto still sits below good play, and grades, the grade engine, the harness's Auto runs and saved runs do not move.
- **`place` is a share of an on-screen ring, not centimetres.** At the default zoom 2 cm of rock is under a millimetre of screen.
- **The budget comes from the move's margin, not the weakest holding hand's.** The move's margin already carries pump, fear, the holds and the posture; a budget per held hold (slopers draining faster, as the mockup said) is open.
- **Base 1,600 → 3,200 ms, lower clamp 0.25 → 0.4, placement range 0.15 → 0.09 (+0.03 to −0.06).** With the proposal's budget a novice (19 §3) overran on 40% of hand moves, and Swing and Catch plus Reach put the expert − novice gap at 9.1 points on dynamic problems, against C8's 8. With a range of 0.12 the 30-problem sample read 8.0.

### 3.2 Balance

```
drift speed  v_d (m/s) = 0.04 × slab_term × (1 + overgrip) × (1 + pump/200) × (1 − (hip_mobility + footwork + core) / 450)
  slab_term = 1 + max(0, 85 − angle) / 30                                                    the further past vertical toward slab, the faster you tip
out of base  Δ = −0.3 × min(1, out_ms / 600);  out_ms > 900 → barn door (slip branch, the moving side)
Auto         drift paused; Δ = −0.05 − 0.10 × (1 − footwork/100)
```

### 3.3 Dyno (built)

The flight is in the engine's surface coordinates (`x` across the rock, `s` up it, gravity along `−s`), from the engine's own body points and reach, so the hold the generator checked as in reach for a dyno is the hold the flight can reach. The pull a dyno needs comes from its margin, not from a second stat formula, so margins, grades and the Auto rule do not move. Code: `src/sim/swing.ts`.

```
setup        com0 = CoM, shoulder = |shoulder − CoM| with the launching hand released (05a §4.2); R = hand reach (05a §5)
in reach     |hold − CoM(t)| ≤ shoulder + R                                                 a disc around the hold
good launch  apex on the line to the hold, 0.10 m inside the disc (at least 0.05 m above com0): v_s = √(2g·rise), v_x = run / (v_s/g)
need         p_need = clamp(0.62 − 0.18 × margin/T + 0.10 × pump/100, 0.40, 0.95)            hard dyno: nearly a full pull
top speed    v_top = |v_good| / p_need;  launch v = power × v_top at angle_deg                power and angle from the pull
catch speed  apex_speed = |v_x of the good launch|
             s_max = apex_speed + clamp((0.35 + 0.003 × contact_strength + 0.1 × margin/T) × commit_window_width, 0.15, 0.8) × (|v_good| − apex_speed)
outcome      never in reach → cut ("short"); no grab → cut
             grab ≤ 80 ms outside the in-reach window → slap; further → cut
             inside: speed > s_max → slap ("ripped off"); speed ≤ apex_speed + 0.35 × (s_max − apex_speed) → apex; else caught
power cost   × clamp(power / p_need, 0.7, 1.5)                                              overpowering is paid for
Auto         swing: null → the 05b §8.4 roll (p_apex, 0.10 tax), unchanged
```

The 05b §8.3 outcomes then apply as before: apex `margin +0.4` and pump ×0.8, slap forced sketchy with pump ×1.5 and skin ×2, cut releases the hand and, on steep ground, the feet. A good launch leaves an in-reach window of about 290 ms of flight (p10–p90 280–300 ms on synthetic dynos); the game plays it at 60% speed by default (*Dyno speed* in settings: slower 46%, faster 75%), so about 480 ms on screen.

The prototype (§6) used a stat-based top speed (`(2.6 + 0.024 × power) × …`) and a fixed arm; it is kept for feel, not for judging.

### 3.4 Logging, replay and grading

- Dyno: choosing a dynamic move still sets the attempt `pending`, now with the swing setup it will be judged against; the `commit` action carries the swing (`null` = Auto). `REDUCER_VERSION` 2 and `DATA_VERSION` `p1a-12`: runs saved before cannot continue ([22 §4](22-p1a-implementation-notes.md)).
- Reach: the `move` action carries an optional `perf` ([schemas §8](schemas.md)); a `perf` on a dyno, or a malformed one, is an invalid action. A move without `perf` resolves exactly as before, so no version changed and `p1a-12` runs replay as they were. Balance will add its own `perf` kind.
- Replay recomputes everything from the logged numbers: the flight and the drift are pure functions of `perf` and the state.
- The grade engine ([05c](05c-grade-engine.md)) evaluates every move with Auto. The generator's legality and margin checks ([06 §2.3](06-procedural-routes.md)) are unchanged.
- [19](19-balance-and-simulation-testing.md) C8 runs on Swing and Catch and Reach skill models together (19 §3), every non-dyno move dragged: on the normal sample Auto 32%, novice 28%, average 32%, expert 34%, expert − novice 6.1 points (also 6.1 with Swing and Catch alone, inside the sample's noise; 6.9 with the commit bar); on the 30-problem full sample 7.6 (Auto 33%, novice 29%, average 34%, expert 37%; 6.6 with Swing and Catch alone, 7.9 with the commit bar). Reach alone adds 1.4 points, on dynamic problems and on problems with no dynamic moves alike (`scripts/dev/probe-reach.ts`). That leaves Balance about 0.4 points under C8's bar on the full sample; per-type C8 is step 6.

---

## 4. Art direction: Flat Dusk

**Camera:** the three-quarter view of [05a §1.4](05a-wall-and-kinematics.md) with the follow camera of [17 §2](17-ui-ux.md) (pinch, pan, recentre). Overhangs lean left, the rock body sits to the right.

**Shape language:** flat fills, no outlines; two tones per surface, lit and shade; round-capped limbs; the far limbs a tone darker and behind the torso; steepness shown by face tone.

**Signals** (never change with time of day; they also differ in lightness, so they survive colour blindness):

| Signal | Colour | Means |
|---|---|---|
| Target | `#FFE066` | where to go, the next hold, the catch |
| Safe | `#2EC4B6` | holding, in balance, in reach |
| Danger | `#FF8C6B` | barn door, overrun grip, high pump, a fall |
| Neutral | `#F5F2FF` | labels, a free hand |

**Dusk palette** (the default; dawn, day and night swap the rows marked *):

| Token | Colour | Token | Colour |
|---|---|---|---|
| sky bands* | `#2B2D42 #46385E #7A4B6E #C0607A #F28F6B #F7B267` | rock, slab* | `#F6B56E` |
| sun* | `#FFD08A` | rock, vertical* | `#F2A65A` |
| hills, trees* | `#3D3A5C`, `#26263F` | rock, steep* | `#E58F4E` |
| ground* | `#2A2A45` | rock edge, body* | `#C8553D`, `#8E3B46` |
| hold, hold shade | `#FFE8C2`, `#B8553E` | pad | `#1B998B` |
| jacket, shade | `#2EC4B6`, `#20A396` | trousers, far | `#1B1B3A`, `#121230` |
| skin, far | `#F4C095`, `#E0A97F` | shoes, far | `#FFE066`, `#E6C84F` |
| UI ground, panel | `#1B1B3A`, `#2D2D55` | UI text, muted | `#F5F2FF`, `#B9B4D6` |

**Type and HUD:** a heavy grotesque in caps for labels (the mockups use Archivo 800), bars `12 px` tall and rounded, every control `≥ 44 px`, controls in the bottom third. A move-type chip (`DYNO`, `SLAB · BALANCE`) sits under the problem name.

**Mockups:** the canvas "Climbing Overhaul Mockups", page *Flat Dusk: dyno and balance* (load and aim, catch, off balance, balanced). The mechanics and the nine other visual directions are on its other pages.

---

## 5. Build order

| Step | What | Exit |
|---|---|---|
| 1 ✓ | Dyno prototype (§6), throwaway | The feel is judged on a phone; the numbers in §3.3 are confirmed or retuned here |
| 2 ✓ | Flat Dusk renderer: palette, figure, sky (the move-type chip waits for Reach and Balance) | 390 and 360 px screenshots; no engine change |
| 3 ✓ | Swing and Catch in the engine and on the wall; the commit window removed | C1–C9 pass; replay identity; old saves rejected cleanly by version |
| 4 (built) | Reach: Two-Thumb Grip and its one-thumb mode | playtest: crux moves feel quicker, not slower (**not yet played on a phone**) |
| 5 | Balance: stance test, Lean, BASE inset | the stance test flags 5–15% of moves on Font problems (harness) |
| 6 | Harness: per-type skill models; C8 per type | C8 within limits for every type |

---

## 6. The dyno prototype

Open the app with `#proto-dyno` on the end of the address (for example the Pages URL plus `#proto-dyno`). It is lazy-loaded and does not touch the run or the save.

- Rainbow Rocket's finishing jump on a 125° wall, or a moderate dyno 0.4 m lower on the same wall.
- Drag back anywhere to load, release to launch, tap anywhere to catch. *Auto* plays a good launch and catch from the stats.
- Readouts: power, the launch a good climber would pick, the catch window and how far the tap was from the dead point. The last eight tries are listed.
- *Tuning* holds the stats (power, contact strength, commitment, pump, ape index), the flight speed (60% by default) and whether the whole arc shows while aiming.
- The model is `src/ui/proto/dyno.ts`, pure and unit-tested (`tests/dyno-proto.test.ts`); the screen is `src/ui/proto/DynoProto.tsx`.

Measured on the model (game time, best launch): a strong build (power 75, contact 70, commitment 70) reaches Rainbow Rocket with about 91% power and a 250 ms window; an average build (50 across) cannot reach it but makes the moderate dyno at about 76% power, also with about 250 ms. At the default 60% speed a 250 ms window lasts about 420 ms on screen.

---

## Open questions

- **Flight speed.** A real dyno reaches its dead point in about 0.35 s. The game plays flights at 60% by default with a setting either side; whether it should also be a stat (commitment slows time) is open.
- **How much arc to show.** Showing the whole arc makes aiming trivial; showing none makes it guesswork. The prototype shows 0.2 s; route reading could lengthen it.
- **Pace.** Two-Thumb Grip asks for a drag on every move auto-climb does not play: tap the hold, then drag, against tap, tap, *Go* before. Whether that feels quicker is the step 4 playtest.
- **Grip budget per hold.** The budget follows the move's margin. A budget from the hold being held (slopers drain faster, as the Two-Thumb Grip mockup said) would read better but needs a hold-level margin the engine does not compute.
- **Ring size.** The placement ring is 24 px on screen whatever the zoom, so zooming in does not make placement easier. Whether it should scale with the hold's size is open.
- **Feet.** Feet run no clock, so a foot move is a placement only. The mockup's "feet follow you" (feet placed for you) would cut moves per problem roughly in half; it would also take the footwork decisions away.
- **The stance test.** The `0.08 m` edge and the smear rule are guesses; the harness should report how often Balance triggers, by style.
- **Dyno Auto.** Keeping 05b §8.4 leaves grades untouched; deriving Auto from the flight model instead would make Auto honour reach and power directly but would move dyno grades and need a recalibration.
- **Power and the pull.** The pull a dyno needs comes from its margin, so a strong climber and a weak one with the same margin pull the same share. A stat-based top speed (as in the prototype) would make power felt in the pull directly, but would let manual play and Auto disagree about what is reachable.
- **Reduced motion.** Swing and Catch has no reduced-motion form beyond Auto; a stepped flight could be one.
- **Time-of-day palettes.** Session time or the device clock.
