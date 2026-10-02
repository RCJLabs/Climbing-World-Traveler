# Move Resolution and the Attempt Loop

This is the rulebook for a single attempt: what a turn is, how a chosen move is classified and resolved against the climber's numbers, what it costs, how rests, fear, falls and the real-time commit window work, and how attempts chain into sessions. One difficulty function (`MoveDifficulty`) and one effectiveness function (`EffectiveStat`) are defined here and reused unchanged by the grade engine ([05c](05c-grade-engine.md)), which is what keeps generated grades honest. Geometry (reach, postures, position quality, friction) is defined in [05a](05a-wall-and-kinematics.md); attributes, Body modifiers and resources in [02](02-character-model.md); every identifier is from [schemas](schemas.md).

Related: [schemas](schemas.md) · [02 Character Model](02-character-model.md) · [05a Wall and Kinematics](05a-wall-and-kinematics.md) · [05c Grade Engine](05c-grade-engine.md) · [06 Procedural Routes](06-procedural-routes.md) · [13 Injury and Health](13-injury-and-health.md) · [17 UI/UX](17-ui-ux.md) · [18 Tech Architecture](18-tech-architecture.md) · [19 Balance](19-balance-and-simulation-testing.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

Numbers marked **(tune)** are design proposals for the balance harness. Research citations refer to the plan appendix (A1–A4).

---

## 1. Turns and actions

An attempt is a sequence of turns. Each turn the player (or auto-climb, §10) takes exactly one action. Time on the wall advances by the action's duration; `aerobic_reserve` falls `1` per `10 s` ([02 §D](02-character-model.md#d-resources)).

| Action | Log entry ([schemas §8](schemas.md#8-save-game-and-run)) | Time (s) | Pump | Power | Skin | Roll? |
|---|---|---|---|---|---|---|
| Move a hand | `{t:'move', limb, hold}` → class `static`/`deadpoint`/`dyno`/`jam`/`bump` | 4 / 3 / 3 / 5 / 2 | §5 | 0 / 8 / 15 / 0 / 0 (+3 if hard static) | §5 | yes |
| Move a foot | `{t:'move', limb, hold}` → class `static`/`high_step`/`heel_hook`/`toe_hook` | 2 / 3 / 3 / 3 | 0 | 0 (+3 if hard) | 0 | yes |
| Match | `{t:'move', limb, hold}` onto an occupied hold → `match` | 3 | §5 ×0.7 | 0 | §5 ×0.5 | yes |
| Kneebar | `{t:'move', limb, hold}` with kneebar geometry → `kneebar` | 4 | 0 | 0 | 0 | yes (establish) |
| Mantle | `{t:'action', kind:'mantle'}` | 6 | §5 ×1.2 | 5 | §5 | yes |
| Shake / rest | `{t:'action', kind:'rest'}` | 10 per shake | §6 (negative or positive) | +2 | §6 hold cost | no |
| Chalk up | `{t:'action', kind:'chalk'}` | 4 | hold cost as a rest ×0.4 | 0 | 0 | no |
| Clip | `{t:'action', kind:'clip'}` | `6 − 0.03 × rope_craft` | `2.0 × pc(hold) × angle_pump × (1.2 − 0.4 × rope_craft/100)` | 0 | 0 | no (P1b) |
| Place gear | `{t:'action', kind:'place_gear'}` | `20 − 0.12 × gear_placement` | as clip ×2.5 | 0 | 0 | quality roll (P3) |
| Downclimb | `{t:'action', kind:'downclimb'}` | 4 per hold | §5 ×0.8 | 0 | §5 ×0.5 | yes (as static, +1.0 MD) |
| Take (rope) | `{t:'action', kind:'take'}` | 15 | resets to `pump × 0.4` after 60 s hang | reset | 0 | no; attempt becomes `work` |
| Jump off (boulder) | `{t:'action', kind:'jump_off'}` | 2 | — | — | — | fall roll at reduced consequence (§11) |
| Commit tap | `{t:'commit', tap_offset_ms}` | within the move | — | — | — | §8 |

**RNG discipline.** Every roll draws from `RngStream(hash(run_seed, route.id, attempt_index, move_index))` ([18](18-tech-architecture.md)). Taking an identical action at an identical `(attempt, move_index)` therefore always produces the identical result; reloading cannot re-roll, and replaying the action log reproduces the attempt exactly. A retry after a recovered slip is a new `move_index` and a new draw.

Hard static moves (margin `< 0.5 T`, §4.4) also cost `3` power, which is how the anaerobic pool limits strings of hard moves ([02 §B.1](02-character-model.md#b1-physical-12)). Boulderers test 26–53 % higher on max/explosive strength than lead climbers with equal finger endurance (A1), which is why power and pump are separate pools.

---

## 2. Move classification from geometry

Given a free limb, the current `State` and a target hold, the legal `MoveClass`es are derived; the player picks among them when more than one is legal (the default is the first listed). `r = d / R` is the relative reach from [05a §5.1](05a-wall-and-kinematics.md#51-free-limb-reach).

| Limb | Condition | Classes offered (default first) |
|---|---|---|
| hand | target is `crack_*` | `jam` |
| hand | target occupied by the other hand and `matchable(type)` | `match` |
| hand | `r ≤ 0.9`, target within `0.35 m` of the current hold of that hand, same direction of travel | `bump`, `static` |
| hand | `r ≤ 1.00` | `static`, `deadpoint` (if `deadpoint_legal`), `dyno` (if `dyno_legal`) |
| hand | `1.00 < r ≤ 1.15` | `deadpoint`, `dyno` (if `dyno_legal`) |
| hand | `1.15 < r ≤ 1.50` and `dyno_legal` | `dyno` |
| hand | target is the `finish` `top_out` and a hand is on a `lip`/`ledge` hold at `s ≥ shoulder.s` | `mantle` |
| foot | target at `s ≥ hip.s − 0.10` and angle `≤ 130` | `high_step` |
| foot | target is `jug`/`edge`/`sloper`/`horn`/`volume`/`pocket3`/`sidepull`/`crack_*`, `quality ≥ 0.4`, at `s ≥ hip.s − 0.30`, lateral offset `≥ 0.20 m` | `heel_hook`, `static` |
| foot | angle `≥ 120` and target is `jug`/`horn`/`volume`/`undercling`/`crack_*`/`edge` with a usable underside (`quality ≥ 0.5`) | `toe_hook`, `static` |
| foot | target has an opposing surface per [05a §6](05a-wall-and-kinematics.md#6-posture-classes) kneebar rule | `kneebar`, `static` |
| foot | otherwise, `r ≤ 1.0` | `static` |

```
deadpoint_legal = at least one foot anchored OR posture == 'hang' with both hands on holds of quality ≥ 0.5
dyno_legal      = at least one foot anchored AND (target.hands_ok) AND target.type ∉ {pocket1, undercling, gaston, crack_*}
```

A `dyno` keeps at most one hand on the wall during flight; the engine marks the launching hand as released, so a missed dyno resolves as a `cut` (§8) rather than a plain slip.

---

## 3. The attribute × hold-type × move-class matrix

Each cell lists the attributes that build the raw composite for that move, with weights summing to `1.0`, plus the Body-slider rules from [02 §A.1](02-character-model.md#a1-sliders-and-modifiers) that fire for it. The implementation stores this as `matrix[move_class][hold_type] = { weights, body_terms }`. Cells marked `—` are illegal combinations (never offered by §2).

Codes: **FS** finger_strength · **FE** finger_endurance · **PP** pull_power · **LO** lockoff · **CT** core_tension · **HM** hip_mobility · **SM** shoulder_mobility · **LP** leg_power · **CS** contact_strength · **SD** skin_durability · **FW** footwork · **BP** body_position · **DM** dynamic_movement · **TC** tech_crimps · **TS** tech_slopers · **TP** tech_pinches · **TK** tech_pockets · **TX** tech_cracks · **TB** tech_slab.

Body terms (sign = direction that **helps**): **FL+/FL−** finger_length long helps/hurts · **FG+/FG−** finger_girth thick helps/hurts · **LT+** long legs help · **LT−(roof)** long legs hurt on roof · **MS−** mass hurts (`mass_mod`, dynamic and roof moves) · **AP+** ape index helps on `overhang`/`roof`/`compression` · **HT±** height direction-flips by terrain · **SK** skin thickness/moisture friction rules · **BF** `bf_mod` (applies to every cell, listed once here). The friction sensitivity `fs` per hold type is in [05a §2.2](05a-wall-and-kinematics.md#22-hold-types-silhouettes-norms-defaults).

### 3.1 `static` — hand

| Hold | Weights | Body terms |
|---|---|---|
| `crimp` | FS .50 · LO .20 · TC .30 | FL−, FG+, HT± |
| `edge` | FS .35 · LO .20 · TC .25 · BP .20 | FL− (half: `∓1.5 %`), HT± |
| `sloper` | CS .30 · CT .30 · TS .40 | SK, FL+, AP+ |
| `pinch` | FS .30 · CS .20 · TP .35 · CT .15 | FL+ |
| `pocket1` | FS .50 · TK .35 · LO .15 | FG− (6 %), FL+ |
| `pocket2` | FS .45 · TK .35 · LO .20 | FG− (4 %), FL+ |
| `pocket3` | FS .40 · TK .35 · LO .25 | FG− (2 %), FL+ |
| `jug` | PP .40 · LO .20 · BP .25 · CT .15 | MS− on roof, AP+ |
| `sidepull` | LO .35 · CT .25 · BP .25 · FS .15 | AP+ |
| `undercling` | SM .25 · LO .25 · CT .30 · BP .20 | AP+ |
| `gaston` | SM .35 · LO .35 · BP .20 · FS .10 | — |
| `horn` | PP .35 · CS .20 · BP .25 · TP .20 | — |
| `volume` | TS .30 · BP .30 · CT .25 · CS .15 | SK |
| `crack_*` | — (use `jam`) | |
| `foot_chip`, `smear` | — | |

### 3.2 `static` — foot

| Hold | Weights | Body terms |
|---|---|---|
| `foot_chip` | FW .50 · TB .25 · BP .25 | — |
| `smear` | FW .35 · TB .40 · BP .15 · HM .10 | SK (thin skin `+3 %` as friction sensitivity on the shoe-rock contact is modelled on the climber, see 02) |
| `edge`, `crimp` | FW .50 · BP .30 · CT .20 | — |
| `jug`, `horn`, `volume` | FW .40 · BP .30 · CT .30 | — |
| `sloper` | FW .35 · TB .25 · BP .20 · CT .20 | SK |
| `pinch`, `pocket2`, `pocket3`, `sidepull`, `undercling`, `gaston` | FW .45 · BP .30 · CT .25 | — |
| `crack_finger`, `crack_hand`, `crack_fist`, `crack_offwidth` | TX .40 · FW .30 · BP .30 | — |
| `pocket1` | — (feet_ok false) | |

### 3.3 `deadpoint` (hand)

| Hold | Weights | Body terms |
|---|---|---|
| `crimp` | FS .35 · CS .25 · DM .25 · TC .15 | FL−, FG+, MS− |
| `edge` | FS .25 · CS .25 · DM .30 · TC .20 | FL− (half), MS− |
| `sloper` | CS .35 · TS .25 · DM .25 · CT .15 | SK, FL+, MS− |
| `pinch` | CS .30 · TP .25 · DM .25 · FS .20 | FL+, MS− |
| `pocket1`, `pocket2`, `pocket3` | FS .40 · CS .30 · TK .30 | FG− (6/4/2 %), FL+, MS− |
| `jug` | PP .35 · CS .25 · DM .30 · CT .10 | MS− |
| `sidepull` | LO .30 · CS .25 · DM .30 · CT .15 | MS− |
| `undercling` | CT .30 · CS .25 · DM .25 · SM .20 | MS− |
| `gaston` | SM .30 · LO .25 · DM .25 · CS .20 | MS− |
| `horn` | PP .30 · CS .30 · DM .25 · TP .15 | MS− |
| `volume` | CS .30 · TS .25 · DM .25 · CT .20 | SK, MS− |
| `crack_hand`, `crack_fist` | TX .40 · CS .30 · DM .30 | MS− |
| `crack_finger`, `crack_offwidth`, `foot_chip`, `smear` | — | |

### 3.4 `dyno` (hand; launch and catch)

| Hold | Weights | Body terms |
|---|---|---|
| `jug` | PP .40 · LP .30 · DM .30 | MS− |
| `edge` | CS .30 · PP .20 · LP .20 · DM .30 | MS−, FL− (half) |
| `crimp` | CS .35 · FS .20 · LP .15 · DM .30 | MS−, FL− |
| `sloper` | CS .35 · TS .15 · LP .20 · DM .30 | MS−, SK |
| `pinch` | CS .35 · TP .15 · LP .20 · DM .30 | MS− |
| `pocket2`, `pocket3` | CS .35 · FS .20 · LP .15 · DM .30 | MS−, FG− |
| `horn` | PP .35 · CS .20 · LP .20 · DM .25 | MS− |
| `volume` | CS .30 · TS .15 · LP .25 · DM .30 | MS−, SK |
| `sidepull` | CS .30 · LO .20 · LP .20 · DM .30 | MS− |
| `pocket1`, `undercling`, `gaston`, `crack_*`, `foot_chip`, `smear` | — | |

### 3.5 `high_step` (foot)

| Hold | Weights | Body terms |
|---|---|---|
| `smear` | HM .40 · FW .30 · TB .30 | LT+ |
| `foot_chip` | HM .40 · FW .35 · TB .25 | LT+ |
| `edge`, `crimp` | HM .40 · FW .35 · BP .25 | LT+ |
| `jug`, `horn`, `volume` | HM .35 · FW .30 · LP .20 · BP .15 | LT+ |
| `sloper` | HM .35 · FW .30 · TB .20 · BP .15 | LT+, SK |
| `pinch`, `pocket2`, `pocket3`, `sidepull`, `undercling`, `gaston` | HM .40 · FW .35 · BP .25 | LT+ |
| `crack_*` | HM .35 · TX .35 · FW .30 | LT+ |
| `pocket1` | — | |

### 3.6 `heel_hook` (foot)

| Hold | Weights | Body terms |
|---|---|---|
| `jug`, `horn` | CT .30 · HM .25 · FW .20 · LP .25 | LT+ |
| `edge` | CT .30 · HM .25 · FW .30 · LP .15 | LT+ |
| `sloper`, `volume` | CT .30 · HM .25 · TS .20 · FW .25 | LT+, SK |
| `pocket3` | CT .30 · HM .30 · FW .25 · LP .15 | LT+ |
| `sidepull` | CT .35 · HM .25 · FW .25 · LP .15 | LT+ |
| `crack_hand`, `crack_fist`, `crack_offwidth` (heel-toe) | CT .25 · TX .35 · FW .25 · HM .15 | LT+ |
| others | — | |

### 3.7 `toe_hook` (foot)

| Hold | Weights | Body terms |
|---|---|---|
| `jug`, `horn`, `undercling` | CT .45 · FW .30 · HM .15 · LP .10 | LT−(roof) |
| `edge`, `volume`, `sloper` | CT .40 · FW .35 · TS .10 · HM .15 | LT−(roof) |
| `crack_*` | CT .35 · TX .35 · FW .30 | LT−(roof) |
| others | — | |

### 3.8 `mantle` (hand; the hold under the hands)

| Hold | Weights | Body terms |
|---|---|---|
| `jug`, `horn` | PP .30 · LO .25 · CT .20 · BP .25 | — |
| `edge`, `crimp` | LO .30 · PP .20 · CT .20 · BP .20 · FS .10 | FL− |
| `sloper`, `volume` | TS .30 · CT .25 · PP .20 · BP .25 | SK |
| `pinch` | TP .25 · LO .25 · CT .25 · BP .25 | — |
| others | — | |

### 3.9 `jam` (hand)

| Hold | Weights | Body terms |
|---|---|---|
| `crack_finger` | FS .30 · TX .45 · LO .15 · FE .10 | SD scales skin cost ×1.6 |
| `crack_hand` | TX .50 · CT .20 · BP .20 · FE .10 | skin ×1.5 |
| `crack_fist` | TX .45 · CT .25 · BP .20 · PP .10 | skin ×1.4 |
| `crack_offwidth` | TX .40 · CT .30 · PP .15 · BP .15 | skin ×1.2 |
| others | — | |

### 3.10 `match` (second hand onto an occupied hold)

| Hold | Weights | Body terms |
|---|---|---|
| `crimp`, `edge` | FS .35 · LO .20 · TC .25 · BP .20 | FL−; size `≤ s` adds `+1.0` MD |
| `sloper`, `volume` | CS .25 · CT .25 · TS .30 · BP .20 | SK |
| `pinch` | FS .25 · CS .20 · TP .35 · BP .20 | FL+ |
| `pocket2`, `pocket3` | FS .40 · TK .35 · LO .25 | FG− |
| `jug`, `horn` | PP .30 · LO .25 · BP .30 · CT .15 | — |
| `sidepull`, `gaston`, `undercling` | LO .30 · CT .25 · BP .30 · SM .15 | — |
| `crack_*` | TX .50 · BP .30 · CT .20 | — |
| `pocket1`, `foot_chip`, `smear` | — | |

### 3.11 `bump` (hand; quick re-grab to a nearby hold)

| Hold | Weights | Body terms |
|---|---|---|
| `crimp`, `edge` | CS .30 · FS .25 · TC .25 · LO .20 | FL− |
| `sloper`, `volume` | CS .35 · TS .30 · CT .20 · BP .15 | SK |
| `pinch` | CS .30 · TP .30 · FS .20 · CT .20 | FL+ |
| `pocket1`, `pocket2`, `pocket3` | CS .30 · FS .30 · TK .30 · LO .10 | FG− |
| `jug`, `horn` | CS .25 · PP .30 · LO .25 · BP .20 | — |
| `sidepull`, `gaston`, `undercling` | CS .25 · LO .30 · CT .25 · BP .20 | — |
| `crack_*`, `foot_chip`, `smear` | — | |

### 3.12 `kneebar` (leg; the foothold of the pair)

| Hold | Weights | Body terms |
|---|---|---|
| `edge`, `jug`, `horn`, `volume`, `foot_chip`, `sloper`, `crack_*`, `pocket3`, `sidepull`, `undercling` | HM .35 · CT .25 · BP .25 · LP .15 | LT+ |
| others | — | |

### 3.13 Per-hold-type cost constants

| `HoldType` | `pc` pump mult | `sk` skin mult | | `HoldType` | `pc` | `sk` |
|---|---|---|---|---|---|---|
| `crimp` | 1.10 | 1.2 | | `horn` | 0.60 | 0.5 |
| `edge` | 0.90 | 1.0 | | `crack_finger` | 1.00 | 1.6 |
| `sloper` | 1.20 | 0.8 | | `crack_hand` | 0.70 | 1.5 |
| `pinch` | 1.20 | 0.9 | | `crack_fist` | 0.80 | 1.4 |
| `pocket1` | 1.30 | 1.2 | | `crack_offwidth` | 1.10 | 1.2 |
| `pocket2` | 1.15 | 1.1 | | `volume` | 0.80 | 0.5 |
| `pocket3` | 1.00 | 1.0 | | `foot_chip` | 0 | 0.1 |
| `jug` | 0.50 | 0.4 | | `smear` | 0 | 0.1 |
| `sidepull` | 1.00 | 0.9 | | `undercling` | 1.10 | 0.8 |
| `gaston` | 1.10 | 0.8 | | | | |

---

## 4. Resolution

> **Amended by [23 §3](23-move-types-and-art-direction.md):** a move played by hand adds its move type's performance term `Δ` to the margin below and may scale its pump cost (Reach: placement and grip overrun, 23 §3.1; Balance: placement and time out of the base, 23 §3.2; Dyno: the commit outcomes of §8.3 via Swing and Catch, 23 §3.3). A move played on Auto resolves exactly as written here.

### 4.1 Move difficulty (DI units)

```
MoveDifficulty = H + S + Qh + A + Rch + C + Fe + O
```

| Term | Formula | Notes |
|---|---|---|
| `H` | base DI by hold type and limb (table below) | "a normal example of this hold, vertical wall, comfortable reach, static" |
| `S` | size: `xs +3.0 · s +1.5 · m 0 · l −1.5 · xl −3.0` | |
| `Qh` | `4 × (0.5 − quality)` | positive holds easier |
| `A` | hand: `0.09 × (angle − 90)` · foot: `0.06 × (angle − 90)` · `smear`: `0.3 × (angle − 80)` | overhang costs 0.9 DI per 10°; slab makes hand holds easier |
| `Rch` | `3.0 × clamp((r − 0.7)/0.3, 0, 1)^1.5`, `r = d/(R × class_reach)`; `0` for `mantle` | full-extension move is +3.0 |
| `C` | class: `static 0 · deadpoint +1.0 · dyno +2.0 · high_step +0.5 · heel_hook +0.5 · toe_hook +1.0 · mantle +1.5 · jam 0 · match 0 (+1.0 if size ≤ s) · bump +0.5 · kneebar −1.0` | |
| `Fe` | feature of the segment: `arete −1.0 (hand) · corner −1.5 (hand) · lip +0.5 (hand), −1.0 (mantle) · ledge −2.0 (hand) · hueco −1.0 (hand) · tufa −0.5 (hand) · crack 0 · none 0` | |
| `O` | `2.0 × (1 − cos(orientation − canonical(type)))` for hand moves; `0` for cracks, feet, arête/hueco holds | a crimp turned 30° off-axis is +0.27 |

Base `H`:

| Hold | `H` hand | `H` foot | | Hold | `H` hand | `H` foot |
|---|---|---|---|---|---|---|
| `jug` | 7 | 5 | | `pinch` | 13 | 11 |
| `horn` | 9 | 6 | | `pocket3` | 13 | 11 |
| `crack_hand` | 10 | 9 | | `undercling` | 13 | 10 |
| `crack_fist` | 11 | 9 | | `crack_offwidth` | 13 | 9 |
| `volume` | 11 | 8 | | `gaston` | 14 | 10 |
| `edge` | 12 | 9 | | `sloper` | 14 | 12 |
| `sidepull` | 12 | 10 | | `crack_finger` | 14 | 9 |
| `pocket2` | 15 | 11 | | `crimp` | 15 | 11 |
| `pocket1` | 18 | — | | `foot_chip` | — | 12 |
| `smear` | — | 13 (at 80°) | | | | |

All values **(tune)**; they are the generator's starting guesses and the grade engine, not this table, decides a route's DI.

### 4.2 Effective stat

Built in the order of [02 §B.5](02-character-model.md#b5-effect-application-order):

```
attr'_i   = attr_i × attr_mult_i                                  one trait multiplier per attribute, else 1
S_cell    = Σ_i w_i × attr'_i                                     matrix weights, §3
M_trait   = 1 + Σ_j (m_j − 1)                                     hold_mult, move_mult, condition_mult from traits (additive)
M_body    = Π body rules that fire (02 §A.1): height, ape, finger_length, finger_girth, leg_torso, bf_mod, mass_mod, skin
Q         = position_quality(State) × (1 − k_stretch × stretch)   05a §7; stretch = clamp((r − 0.85)/0.15, 0, 1); k_stretch = 0 (tune)
M_cond    = 1 + fs(type) × (friction_mod − 1)                     friction_mod = 1 + 0.6 × (F_eff − 0.55); F_eff from 05a §2.3
            × (1 − 0.001 × max(0, 50 − skin)) × (0.90 if skin < 30 and type ∈ {sloper, smear, volume} else 1)
            × (1 + 0.001 × rock_knowledge[rock])
M_state   = pump_mod × fear_mod × hesitation × power_mod × energy_mod
  pump_mod   = 1 − 0.35 × (pump/100)²                              pump ≥ 100 → hands open, fall
  fear_mod   = 1 − 0.12 × overgrip − 0.06 × under                  §9
  hesitation = 1 − 0.10 × max(0, 1 − commitment/70)                deadpoint and dyno only (02 §B.3)
  power_mod  = 1 − 0.30 × max(0, 1 − power/power_cost)             dynamic moves only; empty pool = −30 % (02 §D)
  energy_mod = 0.90 if energy < 25 else 1.0                        02 §D
S_eff     = S_cell × M_trait × M_body × Q × M_cond × M_state
EffectiveStat = di_equiv(S_eff)                                   stat points → DI, §4.3
margin    = EffectiveStat − MoveDifficulty
```

`k_stretch` was `0.10`. It charged for stretch a second time, after the reach term `Rch` in §4.1, and near full reach the two together moved a crux 0.6–0.8 DI for a 2–3 cm shift of one hold ([05c §4](05c-grade-engine.md#4-calibration-tests) C5). It is now `0`; the golden tests keep `0.10`, the independent calculator's value, and the worked examples of §14 were computed with it.

`bf_mod` is applied to the whole composite, a deliberate simplification of 02's "all physical EffectiveStats". `Q` multiplies the composite, so a ★ stance (`0.85`) is worth about `−1.5 DI` at V4 and `−2.5 DI` at V10 — bad positions hurt more as the climbing gets harder.

### 4.3 Stat points to DI

`di_equiv` is the inverse of the reference climber's stat curve `S_ref(DI)` defined in [05c §1](05c-grade-engine.md#1-the-reference-climber), anchored to the Lattice finger-strength benchmarks (A1):

```
S_ref(DI) = 8 + 2.0 × (DI − 8)         8 ≤ DI ≤ 12
          = 16 + 3.0 × (DI − 12)       12 < DI ≤ 16
          = 28 + 4.6 × (DI − 16)       16 < DI ≤ 29
          = 87.8 + 3.0 × (DI − 29)     29 < DI ≤ 33
di_equiv(S) = piecewise inverse; S ≤ 8 → 8 + (S − 8)/2 (can go below 8); S ≥ 99.8 → 33 + (S − 99.8)/3
```

Anchor check: `S = 28 → DI 16 (V4)`, `51 → 21 (V8)`, `64.8 → 24 (V10)`, `74 → 26 (V12)`, `87.8 → 29 (V15)`. One stat point is worth `0.5 DI` below V2, `0.33 DI` to V4, `0.22 DI` to V15 and `0.33 DI` above; a 10 % multiplier is therefore worth about half a grade at the bottom of the scale and one to one and a half grades from V4 upwards, so conditions, posture and pump matter more the harder the climbing gets.

### 4.4 Auto-success band and outcome probabilities

```
T = 1.2 − 0.6 × focus_meter/100          DI, from 02 §B.3; focus_meter starts at `focus`
```

| Zone | Condition | `P_clean` | `P_sketchy` | `P_slip` |
|---|---|---|---|---|
| auto-success | `margin ≥ T` | 1 | 0 | 0 — no roll, no RNG draw |
| roll band | `−T < margin < T`, `u = (margin + T)/(2T)` | `u` | `0.5 × (1 − u)` | `0.5 × (1 − u)` |
| auto-sketchy | `−2T ≤ margin ≤ −T` | 0 | `0.5 × (margin + 2T)/T` | `1 − P_sketchy` |
| auto-slip | `margin < −2T` | 0 | 0 | 1 — no roll |

The curve of `P_complete = P_clean + P_sketchy` is continuous: `1.0` at `+T`, `0.75` at `0`, `0.50` at `−T`, `0.25` at `−1.5T`, `0` at `−2T`. At `focus 50`, `T = 0.90`, so the whole interesting region spans `±1.8 DI` around the climber's level: dice decide only moves within about one grade of the limit, as the plan requires.

### 4.5 Outcomes

| Outcome | Effect |
|---|---|
| **clean** | Move completed. `focus_meter +2` if the move was a crux (`margin < 0.5T`). Fear decays by `0.08 × composure`. Technique XP per [02 §B.2](02-character-model.md#b2-technique-12--2-later) with `outcome_factor 1.0` |
| **sketchy** | Move completed. Pump cost `×1.5`, skin cost `×1.5`, `focus_meter −3`, `fear +4` (source "sketchy move"). Position quality of the resulting state `−0.03` for the next move (bad body position). XP `×0.7` |
| **slip** | Hand or foot pops. Recovery check: hand slip with ≥2 other anchors `P_rec = clamp(0.25 + 0.5 × core_tension/100, 0, 0.90)`; foot slip `P_rec = clamp(0.5 + 0.4 × core_tension/100, 0, 0.95)`; hand slip with <2 other anchors `P_rec = 0`. **Recovered**: climber is back on the previous anchors, pump cost `×1.5` paid, `fear +8`, feet set `feet_cut` if a foot slipped on angle `≥ 110` (foot_deficit 1 until a foot is replaced), and the move may be retried at the new `move_index`. **Not recovered** → **fall**. XP `×0.5` |
| **fall** | Attempt ends (boulder) or rope catches (§11). Resolved by `FallKind` → consequence → injury roll in [13](13-injury-and-health.md) |

Dynamic moves add the commit-window outcomes (§8) on top: `apex` improves the margin before the roll; `slap` forces the sketchy branch; `cut` goes straight to the slip-recovery check with the launching hand released.

---

## 5. Costs

```
pump_cost  = 1.6 × pc(type) × angle_pump × margin_pump × fe_mod × fw_mod × size_mod × posture_pump × overgrip_pump   (tune)
  angle_pump   = 1 + 0.025 × max(0, angle − 90)        slab: 1 − 0.01 × (90 − angle)
  margin_pump  = clamp(1.4 − 0.4 × margin/T, 0.6, 2.2)  a move at +T costs 1.0×, at 0 1.4×, at −T 1.8×
  fe_mod       = 1.3 − 0.6 × finger_endurance/100
  fw_mod       = 1 − 0.002 × footwork                   02 §B.2: −2 % per 10 footwork
  size_mod     = xs 1.2 · s 1.1 · m 1.0 · l 0.95 · xl 0.9
  posture_pump = 05a §6 column
  overgrip_pump= 1 + 0.5 × overgrip                      §9
power_cost = deadpoint 8 · dyno 15 (25 if r > 1.3) · mantle 5 · hard static 3 · else 0;   recovers +2 per rest turn
skin_cost  = 0.8 × sharpness × sk(type) × skin_body × (1.3 − 0.6 × skin_durability/100) × (1 + 0.3 × overgrip) × (2 if skin < 30)   per hand move   (tune)
  skin_body  = thin 1.3 · normal 1.0 · thick 0.8          02 §A.1
time       = §1 table
```

Scale check (reference climber at DI 20, `fe_mod 1.02`, `fw_mod 0.91`): a vertical `edge` move at margin `+0.3` costs `1.6 × 0.9 × 1.0 × 1.27 × 1.02 × 0.91 ≈ 1.7` pump; a `jug` on a 150° roof at the same margin `1.6 × 0.5 × 2.5 × 1.27 × 1.02 × 0.91 ≈ 2.4`; a `pocket3` on that roof at margin `−0.8` with a sketchy outcome `≈ 10`. A 35-hand-move route at the climber's limit without rests reaches `≈ 80` pump, i.e. pump is the primary failure mode on routes and almost irrelevant on a six-move boulder (`≈ 15`), which matches the design intent and [08 §2](08-grades.md#2-boulder-grades).

`pump_mod` reference: pump `30 → −3 %`, `50 → −9 %`, `70 → −17 %`, `85 → −25 %`, `100 → fall`.

---

## 6. Rest model

Resting is the `rest` action: a 10-second shake on the current stance. It draws on the aerobic reserve and is governed by the recovery formula of [02 §C.4](02-character-model.md#c4-pump-recovery-per-10-s-of-rest-see-05b-6), which is the **trickle rate of a stale stance**; a fresh stance recovers a multiple of it that halves with every shake:

```
R10      = 1.2 × aerobic_capacity/100 × rest_value × (aerobic_reserve/100)^0.5 × (1 − 0.6 × overgrip)   pump points per 10 s   (02 §C.4)
fresh_k  = 12 × 0.5^(k−1)                     k = 1, 2, 3… = shake index at this stance; resets when a hand or foot moves to a new hold   (tune)
hold_cost= 1.0 × pc(type) × angle_pump × (1 − rest_value) × posture_pump        pump cost of hanging on for 10 s; 0 in `rest_stance`   (tune)
Δpump_k  = −(R10 × fresh_k) + hold_cost
aerobic_reserve −= 1 per 10 s; fear and skin follow §9 and §5 (lingering sources)
power   += 2 per shake
```

Worked, reference climber at DI 20 (`aerobic_capacity 46.4`), reserve `85`, no overgrip:

| Stance | `rest_value` | `R10` | shake 1 | shake 2 | shake 3 | shake 4 | stance total |
|---|---|---|---|---|---|---|---|
| `jug`, 100° | 0.8 | 0.41 | `−4.9 + 0.1 = −4.8` | `−2.5 + 0.1 = −2.4` | `−1.2 + 0.1 = −1.1` | `−0.6 + 0.1 = −0.5` | **−8.8 pump in 40 s** |
| `edge`, 95° | 0.3 | 0.15 | `−1.8 + 0.7 = −1.1` | `−0.9 + 0.7 = −0.2` | `+0.2` | `+0.5` | −1.3, then net negative |
| `crimp`, 95° | 0.1 | 0.05 | `−0.6 + 1.1 = +0.5` | `+0.8` | | | **net negative from the first shake** |
| `ledge` (`rest_stance`) | 1.0 | 0.51 | `−6.2` | `−3.1` | `−1.5` | `−0.8` | −11.6 in 40 s, no hold cost |

Properties this produces: the first shake per stance recovers most; recovery dies off geometrically so "rest forever" is impossible; sub-jug rests are net-negative after at most one shake; everything scales with `aerobic_capacity` and shrinks as the reserve drains. The **per-hold rest value** shown on hover is `Δpump_1` for that hold from the current state, e.g. "shake: −4.8" or "no rest (+0.6)".

---

## 7. The decision triangle

Every hold in a free limb's envelope shows three numbers before the player commits:

| Facet | Value shown | Source |
|---|---|---|
| **Success band** | `P_complete` as a percentage, or a band label (§13) | §4.4, incl. the Auto-commit expectation for dynamic moves |
| **Pump cost** | expected `Δpump` including the sketchy/slip risk: `pump_cost × (P_clean + 1.5 × (1 − P_clean))`, and `−Δpump_1` if the hold is a rest | §5, §6 |
| **Position after** | ★ rating of `position_quality` in the resulting state, which becomes the next move's `Q` | [05a §7](05a-wall-and-kinematics.md#7-position-quality-carried-forward) |

A dyno shows `power −15`, "no mid-air correction" (its `cut` branch) and its commit-window width; a deadpoint is the cheaper middle (`+1.0` MD, `power −8`, window); a static move to the same hold, when legal, has no window and no power cost but carries the full `Rch` term. The triangle is the whole game at the hold-to-hold scale: a safer move that leaves a ★ stance makes the next crux harder; a riskier move that sets up a ★★★★ stance may be the better line.

---

## 8. Commit window

> **Superseded by [23 §3.3](23-move-types-and-art-direction.md)** (Swing and Catch) since `p1a-12`: §8.2 and §8.5 no longer apply, §8.1 (trigger), §8.3 (outcomes and their effects) and §8.4 (Auto-commit) still do.

### 8.1 Trigger

Opens on `dyno`, `deadpoint`, `bump` with `r > 0.8`, and the optional recovery after a foot cut on angle `≥ 110` (`feet_cut` re-establish). Never on `static`, `match`, `jam`, `kneebar`, `mantle`, `rest`, `chalk`, `clip`, `place_gear`. Frequency target: on a typical generated route **≤ 10–15 % of moves** open a window; [06 §2](06-procedural-routes.md#2-the-pipeline) enforces this through the move grammar, and the harness ([19](19-balance-and-simulation-testing.md)) reports the realised rate.

### 8.2 Geometry and timing

```
sweep_ms     = clamp(750 × RunOptions.sweep_speed, 600, 900)                          one pass of the marker, player-adjustable
speed        = 1 × (1 + overgrip) × (1 + pump/200)                                   marker speed multiplier (fear outside the IZOF band, pump)
effective_ms = sweep_ms / speed
target_width = W_base × (0.6 + commitment/250 + dynamic_movement/250) × margin_factor   fraction of the bar
  W_base        = 0.22                                                                (tune)
  margin_factor = clamp(1 + 0.5 × margin/T, 0.5, 1.5)
target_ms    = target_width × effective_ms;  inner_ms = 0.35 × target_ms;  slap_ms = 0.12 × effective_ms beyond each target edge
target centre = 0.62 × effective_ms (apex of the arc; the marker sweeps left → right once)
```

Examples: `commitment 50, dynamic_movement 50, margin 0, pump 0` → width `0.22 × 1.0 × 1.0 = 22 %` of a 750 ms bar = `165 ms` target, `58 ms` inner. `commitment 100, dynamic_movement 100, margin +T` → `0.22 × 1.4 × 1.5 = 46 %` = `347 ms`. `commitment 20, dynamic_movement 20, margin −T, pump 60, overgrip 0.5` → `0.22 × 0.76 × 0.5 = 8.4 %` of `750/(1.5 × 1.3) = 385 ms` = `32 ms` — desperate, as it should be.

Cues ([17](17-ui-ux.md) owns layout): a short haptic tick and a rising tone at window open; a second haptic pulse at `target_centre − 120 ms` (anticipation cue, constant lead so it can be learned); zone colours inner/outer/slap drawn before the sweep starts; the launch keyframe of the pose animation plays over the first 40 % of the sweep, the catch keyframe at the tap.

### 8.3 Outcomes

| Tap offset `|δ|` from target centre | Outcome | Effect |
|---|---|---|
| `≤ inner_ms/2` | **apex** | `margin += 0.4` before the roll; pump cost `×0.8`; `confidence` session counter +1 |
| `≤ target_ms/2` | **caught** | nominal roll |
| `≤ target_ms/2 + slap_ms` | **slap** | sketchy branch forced (`P_clean = 0`, the roll decides sketchy vs slip); pump `×1.5`, skin `×2.0`, `fear +3` |
| beyond, or no tap before the sweep ends | **cut** | launching hand released; on angle `≥ 100` both feet cut; straight to the slip-recovery check with `P_rec × 0.6`; on failure → fall |

### 8.4 Auto-commit

When `RunOptions.auto_commit` is on, when the attempt is auto-climbing with Auto-commit enabled, when the app is backgrounded mid-window ([18](18-tech-architecture.md)), and always in the grade engine and harness, the tap is replaced by a stat roll that never slaps or cuts:

```
p_apex  = 0.25 + 0.25 × (commitment + dynamic_movement)/200
outcome = apex with p_apex, else caught
expected margin bonus = 0.4 × p_apex − 0.10 (tax)      e.g. 50/50 → +0.10 DI; 100/100 → +0.20; 0/0 → 0.00
expected pump factor  = 1 − 0.2 × p_apex
```

The expectation sits between **caught** (0) and **apex** (+0.4) minus a `0.10` tax, so a player who taps well gains a little over Auto-commit and a player who taps badly loses a little; the harness target is that timing explains **≤ 10 % of send variance** ([19](19-balance-and-simulation-testing.md)). The log entry is `{t:'commit', tap_offset_ms: null}`.

### 8.5 Logging and replay

Every manual tap is logged as `{t:'commit', tap_offset_ms: δ}` (signed, ms). Replay recomputes zones from the replayed state and applies the stored offset, so outcomes reproduce exactly regardless of device timing. A missing tap is logged as `tap_offset_ms: +effective_ms` (cut).

---

## 9. Fear

### 9.1 Baseline and sources

```
fear0 = 40 − 0.3 × confidence + Σ context sources at attempt start      02 §B.3
```

Every change to `fear` carries a **source label** shown on the meter. Sources (all **(tune)**):

| Source label | Δfear | When |
|---|---|---|
| "height" | `+2` per 2 m above 3 m of the climber's `CoM.y` (boulder); `+1` per metre of potential fall length beyond 4 m (rope) | continuous, recomputed per turn |
| "runout" | `+3` | next clip/placement more than 3 m above the last clipped one |
| "lead" | `+7 × (1 − min(1, rope_falls_logged/60))` | on lead; vanishes with fall experience (Fryer 2013: advanced climbers show no lead–toprope gap; intermediates 40.1 vs 33.1, A3) |
| "last fall" | `+2`, decays `−1` per attempt | fell on this route earlier today |
| "highball" / "bold" / "deadly" | `+3` / `+6` / `+15` | route `style_tags` / `danger` |
| "onsight" | `+3` | mode `onsight` (unknown terrain; A3: uncertainty impairs reading) |
| "wet" | `+2` | any hold on the line with `state.wet > 0.3` |
| "crowd" | `+4` | competition isolation/arena ([07](07-disciplines.md)) |
| "belayer" | `+3 × (1 − belay_quality/100)` | rope, from the partner |
| "spray" | `−1` | a trusted partner (`trust ≥ 60`) gives beta |
| "sketchy move" / "slip" / "slap" | `+4` / `+8` / `+3` | outcomes (§4.5, §8.3) |
| "lingering" | `+1` per 10 s | resting while a "runout" or "highball" source is active |
| "composure" | `−0.08 × composure` | per rest turn or clean move (02 §B.3) |

### 9.2 IZOF band and its effects

The Individual Zone of Optimal Functioning is not quantified for climbers (A3), so the band is a labelled design choice from [02 §D](02-character-model.md#d-resources):

```
centre     = 50 − 0.2 × composure
half_width = 15 + 0.1 × composure
overgrip   = clamp((fear − (centre + half_width)) / 30, 0, 1)       above the band
under      = clamp(((centre − half_width) − fear) / 30, 0, 1)       below the band (flat, under-aroused)
```

At `composure 50` the band is `20–60`; at `composure 90` it is `8–56`. Effects of `overgrip`: `fear_mod = 1 − 0.12 × overgrip` on EffectiveStat; pump cost `× (1 + 0.5 × overgrip)`; recovery `× (1 − 0.6 × overgrip)`; foot-slip probability `× (1 + overgrip)` (footwork precision loss; anxiety lengthens grip time and movement time, Pijpers 2003, A3 unverified); commit-window marker speed `× (1 + overgrip)`; skin `× (1 + 0.3 × overgrip)`. Effects of `under`: `fear_mod −0.06 × under` and `focus_meter −1` per turn. The band is drawn on the meter; the meter turns from green to amber to red as `overgrip` goes `0 → 0.5 → 1`.

---

## 10. Auto-climb

Toggled per attempt (`attempt_start.auto_climb`). While on, the engine resolves a move automatically when **all** hold: the best legal option has `margin ≥ T` (guaranteed clean), it is not a `dyno`/`deadpoint`/`bump > 0.8 r` (unless Auto-commit is on), no `clip`/`place_gear` is available, no stance with `Δpump_1 ≤ −3` is available while `pump ≥ 40`, `fear` is inside the band, and `pump < 60`. Otherwise it stops and hands control to the player with the envelope shown. Auto-climb's choice policy: maximise `margin`, then `position_quality` of the resulting state, then minimal pump. It never takes `take`, `jump_off` or `downclimb`.

---

## 11. Falls

A fall produces a **consequence** `κ ∈ [0, 1]` from the `FallKind`, which [13](13-injury-and-health.md) turns into an injury roll via [02 §C.5](02-character-model.md#c5-base-fall-injury-risk-see-13): `p_injury = base(fall_kind, κ) × age_mod × (1 − 0.3 × body_position/100) × (1 + 0.01 × (mass − ref_mass)) × Π trait_mults`.

| `FallKind` | Consequence | Notes |
|---|---|---|
| `boulder` | `h = CoM.y − pad_top`; `κ = clamp(0.03 × h² × (1 − 0.6 × coverage) × (1 − 0.3 × spot_quality/100) × landing, 0, 1)` **(tune)**; `landing = 1.0` flat, `1.5` sloping/rocky (the crag's landing field, default flat) | A 3 m Font problem (`h 2.5`, coverage `0.8`, one spotter at 50) gives `0.083` (safe); a 6 m highball onto a `0.4` pad with no spotter gives `0.69` (bold), `1.0` if the landing is rocky (deadly). `jump_off` uses `h − 0.5` and `landing × 0.7`. Indoor bouldering falls: ankle fracture 40 % of diagnoses (A2), reflected in 13's site table |
| `rope` | `fall_len = 2 × (CoM.y − y_lastclip) + slack + 0.08 × rope_out`, `slack = 1.5 × (1.2 − 0.4 × rope_craft/100)`; `κ = clamp(0.015 × fall_len + 0.4 × [ledge in path] + 0.2 × (1 − belay_quality/100) + 0.3 × [clip skipped], 0, 1)` **(tune)**; ground contact (`CoM.y − fall_len ≤ 0`) → `κ = 1` | Bolts every 3 m: the worst fall before a clip is `7.5 m` → `0.11` (safe); a 5 m runout → `11.5 m` → `0.17` (spicy); a ledge in the path adds `0.4` (bold) |
| `trad_rope` | as `rope`, but each piece between the climber and the last bolt-equivalent is tested top-down: `P_hold = placement_quality^(1 + fall_len/5)`; a rip adds its spacing to `fall_len` and cascades | placement quality from the `place_gear` roll: `clamp(Protection.quality × (0.5 + 0.5 × gear_placement/100) + N(0, 0.1), 0, 1)` |
| `water` | `κ = clamp(0.05 × (CoM.y − water_y) × (1 − quality) + 0.3 × swell + 0.4 × [rotation: fell from a `toe_hook`/`kneebar`], 0, 1)` | S-grade display from `κ` ([08 §3](08-grades.md#3-other-systems)) |
| `alpine` | `κ = max(rope κ, objective_hazard)` | [07](07-disciplines.md) |

A fall ends a boulder attempt; on a rope the attempt continues in `work` mode from the hanging position (pump `× 0.4` after 60 s, `fear +8` "last fall", power reset), or ends if the player lowers.

---

## 12. Attempt and session loop

### 12.1 Modes and tick styles

| `attempt_start.mode` | Pre-conditions | What the player knows | Tick on success |
|---|---|---|---|
| `onsight` | first attempt ever on this route, no beta received, no one seen climbing it today | hidden holds hidden; types of holds beyond `route_reading` reveal shown as "?" | `onsight` |
| `flash` | first attempt, beta received or watched an ascent | hidden holds on the beta line revealed; `fam = 0.30 × beta_quality` | `flash` |
| `redpoint` | prior attempts exist | everything touched before is known; `fam` from attempts | `redpoint` (first) / `repeat` |
| `work` | any | as redpoint; `take`, continue from the hanging point, and `lower` are allowed; `fam` accrues `×1.5` | never a tick; logs `attempt` |

A rope attempt in `onsight`/`flash`/`redpoint` that falls or takes becomes `work` for the rest of the attempt. A boulder attempt that falls ends.

### 12.2 Familiarity and beta

```
fam = 1 − (1 − fam_beta) × e^(−k × attempts_equivalent)       k = 0.35 boulder, 0.25 route   (tune)
attempts_equivalent = Σ (1.0 per redpoint-style attempt, 1.5 per work attempt)
fam_beta = 0.30 × beta_quality                                   beta sets the starting familiarity; attempts grow it
effects: MoveDifficulty −0.3 × fam on every move; displayed band width × (1 − 0.5 × fam); hidden holds on touched sections revealed
beta_quality = trust/100 × [route in the partner's ticklist] × (1 − 0.5 × [spray > 70 and trust < 40])     Relationship.trust, Climber.ticklist, NPC.spray
```

Five working attempts on a boulder give `fam = 1 − e^(−1.75) = 0.83` and `−0.25 DI` on every move — a quarter grade, which is what redpointing a boulder you know buys you (the onsight gap in [02 §C.3](02-character-model.md#c3-grade-estimates-display-on-the-character-sheet) is the larger, information-driven part).

### 12.3 Session limits

```
energy_cost(attempt) = 1.5 + 0.1 × moves (boulder) · 4 + 0.1 × moves (route) · plus the activity block cost from 02 §D
skin: §5 per move; the session ends when skin ≤ 0; skin < 30 doubles skin cost and cuts sloper friction (02 §D)
power pool at attempt start = anaerobic_capacity × (0.5 + energy/200) if energy < 50, else anaerobic_capacity
rest between attempts: boulder ≥ 3 min restores pump to 0; routes ≥ 15 min; shorter rests carry over 50 % of the remaining pump
```

Energy below `25` applies `energy_mod 0.90` (02 §D); the player may keep trying until energy `10`. Typical Font day (reference climber DI 16, `skin_durability 50`): a 6-move sloper problem costs `≈ 1.4` skin per attempt, so skin allows 40–50 attempts; energy allows about 25 in a 45-energy block — energy is the normal limiter, skin on sharp rock or after three days on.

---

## 13. Information rules

| Shown | Condition | Otherwise |
|---|---|---|
| Exact `P_complete` % | `route_reading ≥ 60` **(tune)**, or `fam ≥ 0.8` | band label: **solid** `≥ 0.90` · **probably** `0.65–0.90` · **sketchy** `0.35–0.65` · **desperate** `< 0.35` |
| Band label sharpness | always | the displayed band is computed from `P_complete + N(0, 0.15 × (1 − route_reading/100) × (1 − fam))`, so weak readers see mislabelled moves |
| Hidden holds | `hidden: true` holds within the envelope are revealed with probability `route_reading/100 × 0.6` when first inside an envelope, always when touched, on the beta line in `flash` | drawn only after reveal |
| Hold type of far holds | holds farther than `1.5 × R` from any anchor show type only if `route_reading ≥ 40` | generic silhouette "?" |
| Danger preview (fall consequence κ, landing, runout) | displayed `κ_shown = clamp(κ + N(0, 0.30 × (1 − risk_judgement/100)), 0, 1)`; the noise is drawn once per route per day so the label is consistent within a session | — |
| Rest value | always exact (you can feel a hold) | — |

Noise draws use `RngStream(hash(run_seed, route.id, day, 'info'))`.

---

## 14. Worked examples

Both problems below were produced by the generator and graded by [05c](05c-grade-engine.md) at **DI 15.9**, which displays as **Font 6B+ / V4 (DI 16)**. Conditions are the grading reference: chalked, dry, 12 °C. Trait multipliers are omitted (`M_trait = 1`) so the arithmetic stays visible; `energy_mod = 1`, fear inside the band, `focus_meter = focus`. Distances `d` are from the moving limb's root (shoulder or hip) in the stated posture. Probabilities are the expected-value mode of 05c (one retry after a recovered slip, Auto-commit on dynamic moves); live play rolls dice at every in-band step.

The numbers below use the original stretch penalty `k_stretch = 0.10` (§4.2). At the current `0` the same holds give: Build A on the Font problem `0.832` (was `0.788`), Build B `0` on the deadpoint line and `0.082` on the dyno line (`0.186` after five attempts; were `0.051` and `0.134`), Build A on the Hueco roof `0.311` (unchanged).

### 14.1 Example 1 — two builds on one Font 6B+ sloper/compression problem

**Problem: "Le Compresseur" (procedural, `sandstone_font`, `friction 0.60`, `F_ref = 0.72`, `friction_mod = 1.102`).** Wall: `0–1.7 m @ 100°`, `1.7–2.4 m @ 95° feature lip`, top-out. Start matched-ish on two `sloper` (m, 0.45) at `y 1.15`, feet on a `foot_chip` and a small `edge` at `y ≈ 0.4`, posture `compression`.

| # | Limb | Target | Class | Posture after |
|---|---|---|---|---|
| 1 | RH | `sloper` m, q 0.35, 100° | `static` | `compression` |
| 2 | LH | `sloper` m, q 0.35, 100° | `static` | `compression` |
| 3 | RF | `foot_chip` s, 100° | `high_step` | `compression` |
| 4 | RH | `sloper` m, q 0.50, 95° (below the lip) | `deadpoint` (window) | `hang` |
| 5 | LH | `edge` m, q 0.60 on the `lip`, 95° | `static` | `hang` |
| 6 | both | top-out over the lip edge | `mantle` | — |

**Build A, "Compression Monster"**: m, 178 cm, ape 1.05, `mass 55.7 kg` (ref 51.7, `player_shift +4`), bf 11 %, `finger_length +1`, thin skin. Attributes used: CS 44, CT 46, TS 42, FS 24, LO 30, TC 16, BP 36, HM 32, FW 26, TB 18, DM 34, LP 34, FE 30, SM 38, anaerobic 36, skin_durability 30; composure 50, focus 40 (`T = 0.96`), commitment 60 (hesitation `0.986`), DM 34.
Reach: `arm_len = 0.44 × 1.78 × 1.05 = 0.822`; `shoulder_reach_factor = 0.85 + 0.15 × 0.38 = 0.907`; `R_hand(compression) = 0.822 × 0.907 × 0.90 = 0.671 m`, `R_hand(hang) = 0.746`; `R_foot(compression) = 0.837 × (0.7 + 0.3 × 0.32 = 0.796) × 0.95 = 0.633 m`.

**Build B, "Crimp Machine"**: m, 168 cm, ape 1.00, `mass 48.4 kg` (= ref), bf 11 %, `finger_length −1`, `finger_girth +1`, thick skin. FS 46, TC 44, LO 42, CS 32, CT 28, TS 22, BP 34, HM 28, FW 36, TB 26, DM 26, LP 28, FE 34, SM 30, anaerobic 30, skin_durability 40; composure 40, focus 60 (`T = 0.84`), commitment 35 (hesitation `0.95`).
Reach: `arm_len = 0.739`; factor `0.895`; `R_hand(compression) = 0.595`, `R_hand(hang) = 0.662`; `R_foot(compression) = 0.790 × 0.784 × 0.95 = 0.588 m`.

**Difficulty side** (`MD = H + S + Qh + A + Rch + C + Fe`; `r` differs per build because `R` does):

| # | d (m) | Build A: `R`, `r`, `Rch` → `MD` | Build B: `R`, `r`, `Rch` → `MD` |
|---|---|---|---|
| 1 | 0.52 | `0.671`, `0.775`, `3 × (0.25)^1.5 = 0.37` → `14 + 0 + 0.6 + 0.90 + 0.37 = 15.87` | `0.595`, `0.873`, `1.32` → **16.82** |
| 2 | 0.50 | `0.745`, `0.17` → `15.67` | `0.840`, `0.95` → `16.45` |
| 3 | 0.56 | foot `0.633`, `0.885`, `1.45` → `12 + 1.5 + 0 + 0.60 + 1.45 + 0.5 = 16.05` | `0.588`, `0.952`, `2.31` → `16.91` |
| 4 | 0.63 | deadpoint `R × 1.15 = 0.772`, `r 0.816`, `0.72` → `14 + 0 + 0 + 0.45 + 0.72 + 1.0 = 16.17` | `0.685`, `0.920`, `1.88` → `17.33` |
| 5 | 0.48 | hang `0.746`, `0.644`, `0` → `12 + 0 − 0.4 + 0.45 + 0 + 0 + 0.5 (lip) = 12.55` | `0.662`, `0.726`, `0.07` → `12.62` |
| 6 | — | mantle → `12 − 0.4 + 0.45 + 1.5 − 1.0 = 12.55` | `12.55` |

The short climber's problem is already visible: every reach term is `0.6–1.4 DI` larger for Build B.

**Build A, stat side** (`S_eff = S_cell × M_body × Q × M_cond × M_state`, `ES = di_equiv(S_eff)`):

| # | `S_cell` (weights × attrs) | `M_body` | `Q` | `M_cond` | `M_state` | `S_eff` | `ES` | margin | Outcome |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `.3×44 + .3×46 + .4×42 = 43.8` | height `−0.2 % × 8 = 0.984` · ape `+5 %` · FL+1 sloper `+2 %` · thin skin `+3 %` = `1.085` | `0.97 × (0.95 + 0.036) = 0.956` | sloper `fs 1.0` → `1.102` | `1.000` | `50.11` | `16 + (50.11 − 28)/4.6 = 20.81` | **+4.93** | auto-clean, pump `+1.5` |
| 2 | `43.8` | `1.085` | `0.956` | `1.102` | `1.000` | `50.11` | `20.81` | **+5.13** | auto-clean, pump `+1.5` |
| 3 | `.4×32 + .35×26 + .25×18 = 26.4` | ape `1.05` × height (compression) `0.984` = `1.033` | `0.956 × (1 − 0.1 × (0.885−0.85)/0.15) = 0.934` | foot_chip `fs 0.5` → `1.051` | `1.000` | `26.77` | `12 + (26.77−16)/3 = 15.59` | **−0.47** | roll: `u = (−0.47+0.96)/1.92 = 0.26` → `P_clean .26 · P_sketchy .37 · P_slip .37`; foot `P_rec = 0.5 + 0.4×0.46 = 0.68`; retry `P = .63`; **P_move = .63 + .37 × .68 × .63 = 0.788**; power `−3` |
| 4 | `.35×44 + .25×42 + .25×34 + .15×46 = 41.3` | `1.085 × mass_mod (1 − 0.003×4 = 0.988) = 1.072` | `0.956` | `1.102` | hesitation `0.986` × pump_mod(3.1) `1.000` = `0.985` | `46.00` | `19.91` | **+3.74** (+0.05 Auto-commit) | auto-clean; **commit window opens**; power `−8` → `25`; pump `+1.3` |
| 5 | `.35×24 + .2×30 + .25×16 + .2×36 = 25.6` | FL+1 edge `−3 %` = `0.970` | `1.00 × 0.986 = 0.986` | edge `fs 0.4` → `1.041` | `0.999` | `25.47` | `15.16` | **+2.61** | auto-clean |
| 6 | `.3×30 + .2×40 + .2×46 + .2×36 + .1×24 = 35.8` | `0.970` | `0.95 × 0.986 = 0.937` | `1.041` | `0.999` | `33.63` | `17.27` | **+4.72** | auto-clean |

`P_send(A) = 1 × 1 × 0.788 × 1 × 1 × 1 = 0.79`. Pump at the top `6.4`, skin `2.0`, power `36 → 25`. The only thing between this climber and a flash is a foot: the high step at `r = 0.885` on a small chip with `hip_mobility 32`. The commit window at move 4 is wide: `target_width = 0.22 × (0.6 + 60/250 + 34/250) × clamp(1 + 0.5 × 3.79/0.96, 0.5, 1.5) = 0.215 × 1.5 = 0.32` of a `750/1.016 = 738 ms` sweep → a `238 ms` target with an `83 ms` apex zone. Auto-climb would stop twice: at move 3 (margin below `T`) and at move 4 (window).

**Build B, stat side**:

| # | `S_cell` | `M_body` | `Q` | `M_cond` | `M_state` | `S_eff` | `ES` | margin | Outcome |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `.3×32 + .3×28 + .4×22 = 26.8` | height below 170 flips: compression `+0.2 % × 2 = 1.004` · FL−1 sloper `−2 %` · thick skin sloper `−3 %` = `0.954` | `0.97 × 0.984 × (1 − 0.1 × 0.023/0.15) = 0.940` | `1.102` | `1.000` | `26.49` | `15.50` | **−1.32** | auto-sketchy zone (`−T = −0.84`, `−2T = −1.68`): `P_sketchy = 0.5 × (−1.32 + 1.68)/0.84 = .21`, `P_slip .79`; hand `P_rec = 0.25 + 0.5 × 0.28 = 0.39`; **P_move = .21 + .79 × .39 × .20 = 0.275**; pump `+9.3` |
| 2 | `26.8` | `0.954` | `0.954` | `1.102` | `0.997` | `26.82` | `15.61` | **−0.85** | just below `−T`: `P_sketchy .50 · P_slip .50`; **P_move = 0.588**; pump → `17.0` |
| 3 | `.4×28 + .35×36 + .25×26 = 30.3` | `1.004` | `0.97 × 0.984 × (1 − 0.1 × 0.102/0.15) = 0.889` | `1.051` | `0.990` | `28.15` | `16.03` | **−0.88** | `P_sketchy .48 · P_slip .52`, foot `P_rec 0.61`; **P_move = 0.629** |
| 4a | deadpoint `.35×32 + .25×22 + .25×26 + .15×28 = 27.4` | `0.954 × height (vertical, reach marginal: −0.25 % × 2 = 0.995) = 0.950` | `0.97 × 0.984 × (1 − 0.1 × 0.07/0.15) = 0.910` | `1.102` | hesitation `0.95` × pump_mod(17) `0.99` = `0.940` | `24.53` | `14.84` | **−2.49** | below `−2T`: certain slip. **P_move = 0** |
| 4b | dyno `.35×32 + .15×22 + .20×28 + .30×26 = 27.9` | `0.954` (not reach-marginal: `r = 0.63/0.893 = 0.705`) | `0.954` | `1.102` | `0.940` | `26.34` | `15.45` vs **MD `14 + 0.45 + 0.01 + 2.0 = 16.46`** | **−1.01** (+0.03) | `P_sketchy .42 · P_slip .58`, `P_rec .39`, retry `.37`; **P_move = 0.501**; power `21 → 6` |
| 5 | `.35×46 + .2×42 + .25×44 + .2×34 = 42.3` | FL−1 edge `+3 %` = `1.030` | `0.984` | `1.041` | `0.980` | `43.72` | `19.42` | **+6.79** | auto-clean |
| 6 | `36.4` | `1.030` | `0.935` | `1.041` | `0.978` | `35.68` | `17.67` | **+5.12** | auto-clean |

`P_send(B) = 0.275 × 0.588 × 0.629 × 0.501 = 0.051` on the dyno line, **0** on the deadpoint line. The preview tells Build B exactly this: the deadpoint reads "desperate" with a `0.093 × 691 ms = 64 ms` window (`margin_factor` clamped at `0.5`, marker `× 1.085` from pump), the dyno reads "desperate" too but with a non-zero number, so the dyno — more power, a cut-loose risk, no mid-air correction — is the better bet for the short, hesitant climber. After five working attempts (`fam = 0.83`, every `MD −0.25`), B's odds rise to `0.449 × 0.666 × 0.714 × 0.628 = 0.134`. Build A flashes this problem four times in five; Build B will spend a session on it. Same grade, same holds, visibly different outcomes — the P1a success criterion.

### 14.2 Example 2 — one build on a Font sloper problem vs a Hueco roof problem of equal DI

**Problem: "Low Tide Roof" (procedural, `syenite`, `friction 0.58`, `F_ref = 0.696`, `friction_mod = 1.088`).** Wall: `0–0.6 m @ 95°`, `0.6–1.8 m @ 150° (roof, feature hueco)`, `1.8–2.3 m @ 110° feature lip`, `2.3–2.8 m @ 95°`, top-out. Graded **DI 15.85 → 6B+ / V4**. Build A as above.

| # | Limb | Target | Class | d | `R`, `r`, `Rch` | `MD` |
|---|---|---|---|---|---|---|
| 1 | RH | `jug` l, q 0.70, 150° | `static` | 0.55 | hang `0.746`, `0.737`, `0.13` | `7 − 1.5 − 0.8 + 5.40 + 0.13 = 10.23` |
| 2 | LF | `jug` l, q 0.70, 150° | `heel_hook` | 0.60 | foot `0.633`, `0.948`, `2.26` | `5 − 1.5 − 0.8 + 3.60 + 2.26 + 0.5 = 9.06` |
| 3 | LH | `pocket3` l, q 0.50 in a hueco, 150° | `static` | 0.58 | `0.746`, `0.778`, `0.39` | `13 − 1.5 + 0 + 5.40 + 0.39 − 1.0 = 16.29` |
| 4 | RF | `jug` m, q 0.60, 150° | `toe_hook` | 0.62 | `0.633`, `0.980`, `2.71` | `5 + 0 − 0.4 + 3.60 + 2.71 + 1.0 = 11.91` |
| 5 | RH | `edge` l, q 0.60, 150° | `static` | 0.50 | `0.746`, `0.670`, `0` | `12 − 1.5 − 0.4 + 5.40 = 15.50` |
| 6 | LH | `edge` m, q 0.60 on the `lip`, 110° | `deadpoint` (window), one foot on | 0.67 | `0.858`, `0.781`, `0.42` | `12 − 0.4 + 1.80 + 0.42 + 1.0 + 0.5 = 15.32` |
| 7 | RH | `jug` m, q 0.70, 95°, feet cut | `static` | 0.52 | `0.746`, `0.697`, `0` | `6.65` |
| 8 | both | top-out | `mantle` | — | — | `7 − 0.8 + 0.45 + 1.5 = 8.15` |

| # | `S_cell` | `M_body` | `Q` | `M_cond` | `M_state` | `S_eff` | `ES` | margin | Outcome |
|---|---|---|---|---|---|---|---|---|---|
| 1 | jug static `.4×40 + .2×30 + .25×36 + .15×46 = 37.9` | roof: height `0.984` · ape `1.05` · mass `0.988` = `1.021` | `0.986` | jug `fs 0.1` → `1.009` | `1.000` | `38.48` | `18.28` | **+8.05** | auto |
| 2 | heel `.3×46 + .25×32 + .2×26 + .25×34 = 35.5` | `1.021` | `0.986 × (1 − 0.1 × 0.098/0.15) = 0.921` | `1.009` | `1.000` | `33.68` | `17.23` | **+8.17** | auto |
| 3 | pocket3 static `.4×24 + .35×18 + .25×30 = 23.4` | `1.021 × FL+1 pocket +3 % = 1.051` | `0.986` | pocket3 `fs 0.3` → `1.026` | `1.000` | `24.90` | `14.97` | **−1.33** | auto-sketchy zone (`−2T = −1.92`): `P_sketchy = 0.5 × 0.59/0.96 = .31`, `P_slip .69`, `P_rec .48`, retry `.28`; **P_move = 0.401**; pump `+15.1` (sketchy roof pocket), power `−3` |
| 4 | toe `.45×46 + .3×26 + .15×32 + .1×34 = 36.7` | `1.021` | `0.901` | `1.009` | `0.991` | `33.71` | `17.24` | **+5.34** | auto |
| 5 | edge static `25.6` | `1.021 × FL+1 edge −3 % = 0.990` | `0.986` | `1.035` | pump_mod(16.3) `0.991` | `25.63` | `15.21` | **−0.29** | roll: `u = 0.35` → `P_clean .35 · P_sketchy .33 · P_slip .33`; **P_move = 0.776**; pump → `24.8`, power `−3` |
| 6 | edge deadpoint `.25×24 + .25×44 + .30×34 + .20×16 = 30.4` | overhang: ape `1.05` × FL−3 % × mass `0.988` = `1.006` | one foot: `0.986 × (1 − 0.05 × 0.5 × 0.77) = 0.967` | `1.035` | hesitation `0.986` × pump_mod(24.8) `0.978` = `0.965` | `29.53` | `16.33` | **+1.01** (+0.05) | auto; **window**: `0.215 × 1.5 = 32 %` of `750/1.124 = 667 ms` = `215 ms`; power `−8` → `22` |
| 7 | jug `37.9` | `1.000` | feet cut `0.948` | `1.009` | `0.975` | `35.33` | `17.59` | **+10.94** | auto |
| 8 | mantle `.3×40 + .25×30 + .2×46 + .25×36 = 37.7` | `1.000` | `0.937` | `1.009` | `0.974` | `34.68` | `17.45` | **+9.30** | auto |

`P_send(A, roof) = 0.401 × 0.776 = 0.31`, against `0.79` on the Font problem of the same grade. Where the numbers come from:

| | Font sloper 6B+ | Hueco roof 6B+ |
|---|---|---|
| Where A's margin is spent | high step (`hip_mobility`, `footwork`) | the hueco `pocket3` (`finger_strength 24`, `tech_pockets 18`) and a roof `edge` |
| Body terms | ape `+5 %`, thin skin `+3 %`, FL+1 `+2 %` all help on slopers; height `−1.6 %` | ape `+5 %` helps, FL+1 `+3 %` on the pocket, but `−3 %` on edges and `mass_mod 0.988` on every roof move |
| Friction | Font `F_ref 0.72` → `+10 %` on slopers | syenite `0.696` → `+9 %`, but `fs` is `0.1–0.4` on jugs/pockets/edges, so friction barely matters |
| Pump at the top | `6.4` | `28.0` (angle_pump `2.5` on the roof; a sketchy pocket costs `15`) |
| Power | `36 → 25` | `36 → 22` (two hard statics, one deadpoint) |
| Skin | `2.0` | `3.0` (sharper syenite, `sk` of edges and pockets) |
| Reference climber at DI 16 | `P_send 0.41` | `P_send 0.43` |

The grade engine sees both as 6B+ because a balanced climber at DI 16 has the same expected odds on both. Build A is not balanced, and the matrix is what makes that matter: the same `28`-point gap between its contact/core/sloper composite (`43.8`) and its finger/pocket composite (`23.4`) is worth `+4.9 DI` on one problem and `−1.3 DI` on the other.

---

## Open questions / proposed schema additions

1. **`Action` `move` needs an optional `class?: MoveClass`** — when §2 offers more than one legal class (static/deadpoint/dyno, heel/static) the player's choice must be logged for exact replay. Proposed: `{ t:'move'; limb: Limb; hold: string; class?: MoveClass }`.
2. **`Route.beta_line?: { limb: Limb; hold: string; class: MoveClass; posture: Posture }[]`** — the generator's intended sequence, used by the grade engine's expected-value walk ([05c §2](05c-grade-engine.md#2-grading-algorithm)) and by the `flash` reveal rule. Signature routes need it hand-authored.
3. **Recovery constant in [02 §C.4](02-character-model.md#c4-pump-recovery-per-10-s-of-rest-see-05b-6).** Used verbatim here as the stale-stance trickle; the `fresh_k = 12 × 0.5^(k−1)` multiplier carries the actual recovery. If the harness confirms the pump-cost scale in §5, 02's constant should be restated as "per shake with freshness" or raised to about `12` so the two documents read the same.
4. **`ref_mass` in 02 §A.1** gives `51.7 kg` for a 178 cm male at 11 % body fat (BMI ≈ 16). The examples respect the formula (Build A `+4 kg` shift), but the constant should be revisited (something near `0.42 × height_cm − 20`) before real anthropometric sliders ship; only `mass_mod` and fall injury depend on it.
5. **Hard-static power cost** (`3` when margin `< 0.5T`) uses the margin before `power_mod` to avoid circularity; confirm with the harness that power, not pump, is what limits 10–15-move roof boulders.
6. **Cross-through moves** are forbidden by [05a §5.2](05a-wall-and-kinematics.md#52-reachable-set-and-reasons); if wanted, add a class with `C +1.0` and the `bump` matrix cells.
7. The `0.6` recovery factor on `cut` outcomes and the `slap_ms = 0.12` zone are untested on device; tune with the first-dyno tutorial in [17](17-ui-ux.md).
8. Expected-value mode truncates slip retries at one; live play allows unlimited retries at rising pump and fear. The harness should report how much the truncation biases grades (expected `< 0.1 DI`).
9. **Career counter `rope_falls_logged`** (§9.1 "lead" source) is not in `Climber`; propose a `counters: Record<string, number>` field on `Climber` for this and similar evolving-trait thresholds in [03](03-traits.md).
10. **Shoe stiffness.** The plan's example cell `smear/high_step` carries a "shoe stiffness ×" term; shoes live in the gear model ([14](14-economy-gear-logistics.md)), so the matrix lists only Body terms here. Proposal: a `GearInstance` multiplier on `smear`/`foot_chip`/`edge`-as-foot cells of `0.95–1.05`, applied inside `M_cond`.
