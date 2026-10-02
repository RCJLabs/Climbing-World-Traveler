# Move Types, Controls and Art Direction

The climbing overhaul. Different moves ask different things of a climber, so they get different controls: a dyno is aimed, launched and caught; a balance move is held in balance; an ordinary reach is gripped and placed. The look moves to **Flat Dusk** on the three-quarter camera. The character builder, the career, training, the route generator and the grade engine stay; this doc says how the new controls feed the same engine.

**Status:** steps 1–3 of §5 are built: the dyno prototype (§6), the Flat Dusk look, and Swing and Catch for dynos and deadpoints in the game (§3.3). Reach and Balance are still design; until they land, other moves keep the tap-to-select wall of [05b](05b-move-resolution-and-attempt-loop.md) and [17](17-ui-ux.md).

**Supersedes:** [05b §8](05b-move-resolution-and-attempt-loop.md#8-commit-window) (the commit window; replaced by §3.3, Auto-commit kept) and [17 §4](17-ui-ux.md) (the commit bar); [17 §2–§3](17-ui-ux.md) (wall input, HUD) once Reach and Balance are built. **Amends:** [01 §3](01-pillars-scope-roadmap.md#3-non-goals) (non-goals) and the input rules in `CLAUDE.md`.

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
| **Reach** | `static`, `high_step`, `heel_hook`, `toe_hook`, `match`, `jam`, `bump`, `mantle` | Default for any move that is not Balance or Dyno | **Two-Thumb Grip** (§2.1) | `{ kind: 'reach', time_ms, place_cm }` | time at 60% of the grip budget, `place_cm = 2` |
| **Balance** | the same static classes | The stance test (§2.2) fails | **Lean** (§2.2) | `{ kind: 'balance', out_ms }` | drift paused, `out_ms` from stats |
| **Dyno** (built) | `deadpoint`, `dyno` | Always | **Swing and Catch** (§2.3) | on the `commit` action: `swing: { power, angle_deg, catch_ms }` | `swing: null`, the 05b §8.4 roll, unchanged |

### 2.1 Reach: Two-Thumb Grip

- Each holding hand has a grip pad in the thumb zone; holding a thumb on it is holding on. Lift both and you let go (a deliberate jump-off).
- The free hand is dragged to its target on the wall; a foot move drags the foot while both hands hold on their own.
- Each holding hand drains a grip budget while the free limb travels. Running past it costs pump; far past it, the weakest hand pops.
- **One-thumb mode** (settings, and the default when the OS reports a single-touch device): holding hands grip by themselves; the thumb only drags the moving limb. Nothing is lost but the feel.

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

The margin, outcome bands and costs of [05b §4–§5](05b-move-resolution-and-attempt-loop.md#4-resolution) stay. Each move type adds a performance term `Δ` (DI) to the margin and may scale costs. All constants **(tune)**; only Dyno has been prototyped.

### 3.1 Reach

```
grip budget  G_ms = 1600 × clamp(0.5 + margin_hold / (2T), 0.25, 1.5) × (1 − pump/200)     per holding hand, the weakest counts
overrun      o    = max(0, time_ms − G_ms) / G_ms
pump cost    × (1 + o)                                                                       slow reaches pump you out
pop          o > 1 → the weakest holding hand slips (05b §4.5 slip branch)
placement    Δ = −0.15 × min(1, place_cm / 6)                                                a hand off the sweet spot grips worse
Auto         time_ms = 0.6 × G_ms, place_cm = 2  →  Δ = −0.05, no overrun
```

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

- Dyno: choosing a dynamic move still sets the attempt `pending`, now with the swing setup it will be judged against; the `commit` action carries the swing (`null` = Auto). `REDUCER_VERSION` 2 and `DATA_VERSION` `p1a-12`: runs saved before cannot continue ([22 §4](22-p1a-implementation-notes.md)). Reach and Balance are proposed as an optional `perf` on `move` ([schemas §8](schemas.md)).
- Replay recomputes everything from the logged numbers: the flight and the drift are pure functions of `perf` and the state.
- The grade engine ([05c](05c-grade-engine.md)) evaluates every move with Auto. The generator's legality and margin checks ([06 §2.3](06-procedural-routes.md)) are unchanged.
- [19](19-balance-and-simulation-testing.md) C8 runs on Swing and Catch skill models (19 §3): on the normal sample Auto 32%, novice 28%, average 31%, expert 34%, expert − novice 6.1 points (6.9 with the commit bar); on the 30-problem full sample 6.6 (7.9). It generalises per move type as Reach and Balance land.

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
| 4 | Reach: Two-Thumb Grip and its one-thumb mode | playtest: crux moves feel quicker, not slower |
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
- **Pace.** If most crux moves ask for Two-Thumb Grip, a problem may take longer than today. Auto-climb covers safe moves; a playtest decides.
- **The stance test.** The `0.08 m` edge and the smear rule are guesses; the harness should report how often Balance triggers, by style.
- **Dyno Auto.** Keeping 05b §8.4 leaves grades untouched; deriving Auto from the flight model instead would make Auto honour reach and power directly but would move dyno grades and need a recalibration.
- **Power and the pull.** The pull a dyno needs comes from its margin, so a strong climber and a weak one with the same margin pull the same share. A stat-based top speed (as in the prototype) would make power felt in the pull directly, but would let manual play and Auto disagree about what is reachable.
- **Reduced motion.** Swing and Catch has no reduced-motion form beyond Auto; a stepped flight could be one.
- **Time-of-day palettes.** Session time or the device clock.
