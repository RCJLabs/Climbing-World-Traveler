# Move Types, Controls and Art Direction

The climbing overhaul. Different moves ask different things of a climber, so they get different controls: a dyno is aimed, launched and caught; a balance move is held in balance; an ordinary reach is gripped and placed. The look moves to **Flat Dusk** on the three-quarter camera. The character builder, the career, training, the route generator and the grade engine stay; this doc says how the new controls feed the same engine.

**Status:** design. Only a throwaway dyno prototype exists (§6). Until the steps in §5 land, P1a keeps the turn-based wall of [05b](05b-move-resolution-and-attempt-loop.md) and [17](17-ui-ux.md).

**Supersedes, once built:** [05b §8](05b-move-resolution-and-attempt-loop.md#8-commit-window) (the commit window) and [17 §2–§4](17-ui-ux.md) (wall input, HUD, commit bar). **Amends:** [01 §3](01-pillars-scope-roadmap.md#3-non-goals) (non-goals) and the input rules in `CLAUDE.md`.

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
| **Dyno** | `deadpoint`, `dyno` | Always | **Swing and Catch** (§2.3) | `{ kind: 'dyno', power, angle_deg, catch_ms }` | the 05b §8.4 roll, unchanged |

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

### 3.3 Dyno (prototyped, §6)

```
top speed    v_max (m/s) = (2.6 + 0.024 × power) × (1 − 0.3 × pump/100) × (0.88 + 0.12 × commitment/100)
launch       v = power_fraction × v_max at angle_deg                                         power_fraction from the pull
flight       centre of mass ballistic from the loaded position; shoulder 0.5 m along the line to the hold
in reach     |hold − shoulder| ≤ arm × ape_index        (arm = 0.66 m, to come from the body model of 05a §4)
catch speed  s_max (m/s) = 1.0 + 0.03 × contact_strength
outcome      catch_ms outside the in-reach window by ≤ 60 ms → slap; further, or no tap → cut (05b §8.3)
             inside: hand speed > s_max → slap; < 0.6 × s_max → apex (deadpoint); else caught
Auto         05b §8.4 unchanged (p_apex roll, 0.10 tax), so dyno grades do not move
```

`power_fraction` also scales the move's power cost, so overpowering a dyno is paid for.

### 3.4 Logging, replay and grading

- The `move` action gains an optional `perf` ([schemas §8](schemas.md), proposed). Absent `perf` means Auto. `commit` actions go away with the commit window; old logs stay readable through a reducer version bump ([18 §5](18-tech-architecture.md)).
- Replay recomputes everything from the logged numbers: the flight and the drift are pure functions of `perf` and the state.
- The grade engine ([05c](05c-grade-engine.md)) evaluates every move with Auto. The generator's legality and margin checks ([06 §2.3](06-procedural-routes.md)) are unchanged.
- [19](19-balance-and-simulation-testing.md) C8 generalises: for each move type, expert minus novice send rate `≤ 8` points, and Auto within `±2` of an average player. The harness gets a skill model per type.

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
| 1 | Dyno prototype (§6), throwaway | The feel is judged on a phone; the numbers in §3.3 are confirmed or retuned here |
| 2 | Flat Dusk renderer: palette, figure, sky, move-type chip | 390 and 360 px screenshots; no engine change |
| 3 | `perf` in the schema and engine; Dyno replaces the commit window | C1–C9 pass; replay identity; old saves rejected cleanly by version |
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

- **Flight speed.** A real dyno reaches its dead point in about 0.35 s. At full speed a 250 ms window may be too short to read on a phone; the prototype defaults to 60%. Whether slow motion is a setting, a stat (commitment slows time) or fixed is open.
- **How much arc to show.** Showing the whole arc makes aiming trivial; showing none makes it guesswork. The prototype shows 0.2 s; route reading could lengthen it.
- **Pace.** If most crux moves ask for Two-Thumb Grip, a problem may take longer than today. Auto-climb covers safe moves; a playtest decides.
- **The stance test.** The `0.08 m` edge and the smear rule are guesses; the harness should report how often Balance triggers, by style.
- **Dyno Auto.** Keeping 05b §8.4 leaves grades untouched; deriving Auto from the flight model instead would make Auto honour reach and power directly but would move dyno grades and need a recalibration.
- **Arm length.** The prototype uses 0.66 m × ape index; the engine should take it from the body model ([05a §4](05a-wall-and-kinematics.md)) so the reach the dyno uses matches the reach the generator checked.
- **Time-of-day palettes.** Session time or the device clock.
