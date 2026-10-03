# Wall and Kinematics

This document defines the physical stage the climbing engine plays on: how a wall is described, what a hold is, what protection is, how the climber's rig is posed, and which holds a free limb can reach from a given state. It contains no probabilities and no dice. Everything here is deterministic geometry that [05b](05b-move-resolution-and-attempt-loop.md) turns into move difficulty and that [06](06-procedural-routes.md) generates. Body lengths come from [02 §C.1](02-character-model.md#c1-kinematics-see-05a); every identifier is from [schemas](schemas.md).

Related: [schemas](schemas.md) · [02 Character Model](02-character-model.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [05c Grade Engine](05c-grade-engine.md) · [06 Procedural Routes](06-procedural-routes.md) · [10 Weather](10-weather-and-conditions.md) · [17 UI/UX](17-ui-ux.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

Numbers marked **(tune)** are design proposals for the balance harness ([19](19-balance-and-simulation-testing.md)).

---

## 1. Wall model

### 1.1 Coordinates

A route lives on a **developable surface**: a strip of lateral width `W` whose profile is a chain of `WallSegment`s. Three coordinate systems are used and only the first two matter for play logic.

| System | Axes | Used for |
|---|---|---|
| Surface coordinates | `x` lateral (m, + = climber's right), `s` arc length up the profile (m) | All kinematics: distances, reach circles, centroids, drift bounds |
| World profile | `y` height above ground (m), `z` horizontal offset from the wall base (m, + = out towards the climber) | Fall heights, pad and bolt heights, rendering |
| Screen | oblique projection of `(x, y, z)` | Rendering only (see 1.4) |

A `WallSegment { y0, y1, angle, feature }` covers heights `y0..y1` at a constant `angle` (degrees, `90` = vertical, `<90` slab, `>90` overhang). Its profile length and horizontal run are:

```
L_seg  = (y1 − y0) / sin(angle)                    arc length of the segment
Δz_seg = −(y1 − y0) × cot(angle)                   horizontal run (negative on slabs, positive on overhangs)
s(y)   = Σ L of segments fully below y  +  (y − y0_current) / sin(angle_current)
z(y)   = Σ Δz of segments fully below y +  −(y − y0_current) × cot(angle_current)
```

Segments are stored bottom-up and must tile `0..length_m` without gaps. `angle` is limited to `60..170` for all P1–P2 content: at `170°` one metre of height is `5.76 m` of roof, which is enough for Hueco-style roofs; a true horizontal roof (`180°`) cannot be expressed with `y0/y1` alone (see Open questions).

`Hold.x, Hold.y` are world coordinates on the surface; the engine derives `hold.s = s(hold.y)` and `hold.z = z(hold.y)` once at route load. All distances between holds and body points are computed in `(x, s)`:

```
d(a, b) = sqrt((a.x − b.x)² + (a.s − b.s)²)
```

### 1.2 Angle bands

Bands are what the rest of the design means by "slab", "vertical", "overhang", "roof". They set the terrain `Tag` of every move made in the segment and feed the angle terms in [05b §4](05b-move-resolution-and-attempt-loop.md#4-resolution).

**A hold's angle blends across segment boundaries.** Rock does not kink at a hold's scale, so within `0.10 m` of a boundary, measured along the surface, a hold takes an angle blended linearly between the two segments: their mean at the boundary, its own segment's angle `0.10 m` in **(tune)**. Without the blend, a 2 cm shift across a 90°/110° boundary changed one move by 3.3 DI. A hold's `feature` (lip, arête) stays its segment's: features are categorical.

| Band | `angle` | Tag | Typical holds | Feet | Notes |
|---|---|---|---|---|---|
| slab | 60–84 | `slab` | smear, foot_chip, crimp, edge | carry most load; hands are balance | `smear` is only legal here and on vertical |
| vertical | 85–95 | `vertical` | crimp, edge, pocket, sidepull | precise, weighted | reach matters most here |
| overhang | 96–130 | `overhang` | jug, sloper, pinch, undercling | tension and heel hooks | pump cost rises 2.5 %/degree |
| roof | 131–170 | `roof` | jug, horn, undercling, pocket (hueco) | heel/toe hooks, kneebars, cut-loose | `smear` and `high_step` illegal above 130 |

### 1.3 Features

A `WallSegment.feature` describes one architectural trait of that height band. The generator places at most one feature per segment and features drive both kinematics (which postures are eligible) and difficulty (feature terms in 05b).

| Feature | Kinematic effect | Posture unlocked | Generator use |
|---|---|---|---|
| `arete` | Holds at `|x| > W/2 − 0.25` are usable from both sides (`orientation` ignored) | `compression`, `layback` | compression lines; Font, Magic Wood |
| `corner` | Opposing surface at `x = ±W/2`; feet may `stem` | `stem`, `kneebar` | dihedrals, trad corners |
| `crack` | A vertical line of `crack_*` holds at fixed `x`; jams usable by hands and feet | `jam_stack`, `layback` | Indian Creek, Yosemite |
| `lip` | Transition from steeper to shallower segment; hold on the lip is a `mantle` target | `mantle` | boulder top-outs, roof exits |
| `ledge` | Horizontal shelf: `rest_stance` with `rest_value 1.0`, feet unweighted | `rest_stance` | multipitch belays, sport rests |
| `hueco` | Large concavity: holds inside are usable in any orientation; kneebar surface | `kneebar` | Hueco Tanks |
| `tufa` | Vertical rib: `pinch` holds usable from either side, kneebar between rib and wall | `kneebar`, `compression` | Kalymnos, Rodellar |
| `none` | — | — | default |

### 1.4 Rendering projection (summary; owned by [17](17-ui-ux.md)/[18](18-tech-architecture.md))

The wall is drawn in oblique side view so that slabs lean back and roofs go horizontal, which is the point of a side-view game. Lateral position is foreshortened:

```
screen_x = k_z × z(y) + k_lat × x        k_z = 1.0, k_lat = 0.5   (tune)
screen_y = y
```

Because `x` is foreshortened, two holds at the same `y` can overlap on screen; the legibility rule in [06 §3](06-procedural-routes.md#3-legibility) guarantees a minimum screen separation of `0.18 m` equivalent between any two usable holds. Route width `W` is `2.0 m` for boulders and `2.4 m` for routes **(tune)**.

---

## 2. Holds

### 2.1 Field semantics

The `Hold` interface is in [schemas §5](schemas.md#5-wall-holds-routes). This table fixes what each field means physically and who writes it.

| Field | Range | Meaning | Written by |
|---|---|---|---|
| `x, y` | m | Position on the surface; `s`, `z` derived | generator / author |
| `type` | `HoldType` | Silhouette, matrix row, friction sensitivity, pump and skin multipliers | generator |
| `size` | `xs..xl` | Size relative to the type's norm (2.2); `xs` = two sizes smaller than normal | generator |
| `orientation` | 0–359° | Direction of the hold's usable face, measured clockwise from "pull straight down" (0). `90` = usable face points right (a sidepull for the right hand, a gaston for the left), `180` = undercling, `270` = mirror of 90 | generator |
| `quality` | 0–1 | How incut / positive. `0.5` is the type's norm; `0.8` is a very positive example; `0.2` is rounded and sloping | generator |
| `sharpness` | 0–1 | Skin cost multiplier; `0.3` Font sandstone, `0.6` limestone, `0.8` fresh granite crystals | generator from profile |
| `friction` | 0–1 | Base coefficient proxy from rock and polish (2.3) | generator |
| `polish` | 0–1 | Wear; reduces `friction` and `quality` display | generator, grows with crag popularity |
| `hands_ok`, `feet_ok` | bool | Which limbs may use it (2.2 defaults; the generator may override, e.g. a jug that is too high for feet) | generator |
| `hidden` | bool | Not drawn until revealed by `route_reading`, beta or touch (05b §13) | generator |
| `rest_value` | 0–1 | Shake quality on this hold (2.2 defaults × angle factor) | generator |
| `state.chalk` | 0–1 | Chalk on the hold this visit; raises effective friction up to the over-chalk point | per visit |
| `state.wet` | 0–1 | Surface water; `1` = running | weather ([10](10-weather-and-conditions.md)) |
| `state.seep` | 0–1 | Internal seepage; slower to clear than `wet` | weather |

### 2.2 Hold types: silhouettes, norms, defaults

Every type has a fixed silhouette so a player reads a wall at a glance without labels. Silhouettes are flat glyphs at `24 px` on a phone at base zoom, colour-blind-safe (shape, not hue, carries type; hue carries state). Size norms are what `size: 'm'` means for that type; each size step changes the characteristic dimension by `±25 %`.

| `HoldType` | Silhouette | Norm (m size) | hands/feet default | Canonical orientation | `fs` friction sensitivity | base `rest_value` |
|---|---|---|---|---|---|---|
| `crimp` | thin horizontal bar, 1 px lip | 12 mm deep edge | ✓ / ✓ | 0 | 0.3 | 0.10 |
| `edge` | thicker bar with rounded ends | 25 mm deep edge | ✓ / ✓ | 0 | 0.4 | 0.30 |
| `sloper` | half-dome | 120 mm wide dome, 20° slope | ✓ / ✓ | 0 | 1.0 | 0.20 |
| `pinch` | vertical lozenge | 60 mm wide rib | ✓ / ✓ | 0 (any ±45) | 0.6 | 0.20 |
| `pocket1` | circle with 1 dot | one finger, 2nd pad | ✓ / ✗ | 0 | 0.2 | 0.05 |
| `pocket2` | circle with 2 dots | two fingers, 2nd pad | ✓ / ✓ | 0 | 0.2 | 0.15 |
| `pocket3` | circle with 3 dots | three fingers, full pad | ✓ / ✓ | 0 | 0.3 | 0.30 |
| `jug` | deep cup / hook | full hand, incut 40 mm | ✓ / ✓ | 0 | 0.1 | 0.90 |
| `sidepull` | vertical bar + arrow | 25 mm edge, vertical | ✓ / ✓ | 90 or 270 | 0.5 | 0.25 |
| `undercling` | inverted cup | 30 mm lip, down-facing | ✓ / ✓ | 180 | 0.4 | 0.30 |
| `gaston` | vertical bar + outward arrow | 25 mm edge, vertical, pushed | ✓ / ✗ | 90 or 270 (pushing) | 0.5 | 0.10 |
| `horn` | teardrop | wrap-able protrusion, 70 mm | ✓ / ✓ | 0 (any) | 0.5 | 0.70 |
| `crack_finger` | thin zigzag | 20–35 mm | ✓ / ✓ | any | 0.3 | 0.20 |
| `crack_hand` | zigzag | 45–70 mm | ✓ / ✓ | any | 0.3 | 0.60 |
| `crack_fist` | wide zigzag | 75–110 mm | ✓ / ✓ | any | 0.3 | 0.50 |
| `crack_offwidth` | double zigzag | 120–300 mm | ✓ / ✓ | any | 0.3 | 0.40 |
| `volume` | large triangle | 400 mm feature | ✓ / ✓ | 0 | 0.9 | 0.50 |
| `foot_chip` | small square | 10 mm nub | ✗ / ✓ | 0 | 0.5 | — |
| `smear` | dotted patch | featureless patch | ✗ / ✓ | — | 1.0 | — |

`ice_pick` and `ice_frontpoint` are P4 and defined with the ice discipline in [07](07-disciplines.md).

`rest_value` is reduced by steepness: `rest_value = base × (1 − 0.01 × max(0, angle − 95))` **(tune)**, and raised to `min(1, base + 0.5)` when a `kneebar` posture is established on it. A `ledge` feature forces `1.0`.

### 2.3 Friction

Research anchors (plan appendix A4): sandstone is 15.6–18.4 % grippier than limestone; chalk adds +18.7 % on limestone and +21.6 % on sandstone (Fuss & Niegl 2012); chalk benefit depends on roughness (Clarke 2024); there is no linear temperature or humidity effect in 12–28 °C, but practitioners agree on 8–15 °C sending temperatures and condensation when the rock is below the dew point. Shoe rubber is tuned around 0–5 °C rubber temperature.

Base friction by rock type, written into `Hold.friction` before polish:

| `RockType` | base friction | | `RockType` | base friction |
|---|---|---|---|---|
| `sandstone_grit`, `sandstone_quartzitic` | 0.65 | | `granite`, `monzonite`, `gneiss`, `schist`, `quartzite` | 0.55 |
| `sandstone_font`, `sandstone_elb`, `sandstone_nuttall` | 0.60 | | `basalt`, `dolerite`, `tuff`, `rhyolite`, `plastic` | 0.55 |
| `syenite`, `sandstone_corbin`, `sandstone_aztec`, `sandstone_wingate`, `sandstone_generic` | 0.58 | | `limestone`, `dolomite`, `conglomerate` | 0.50 |
| `ice` | n/a (tools) | | | |

```
Hold.friction = base(rock) × (1 − 0.4 × polish)                              stored
F_eff = clamp(Hold.friction × chalk_term × wet_term × temp_term × hand_term, 0, 1)   per move, 05b uses F_eff
  chalk_term = 1 + 0.20 × min(state.chalk, hand_chalk) − 0.03 × [state.chalk > 0.8]     Fuss & Niegl; over-chalk penalty from 02 §D
  wet_term   = (1 − 0.6 × state.wet) × (1 − 0.3 × state.seep)
  temp_term  = 1 − 0.015 × max(0, |T_rock − T_centre| − 5)                               02 §C.6 window (centre 12 °C, half-width 5)
  hand_term  = 1.03 (dry hands) · 1.00 · 0.95 (sweaty, in `humid`/`heat`)                02 §A.1 skin_moisture
```

`hand_chalk` is `Resources.chalk / 100`. The reference condition used by the grade engine is `state.chalk = 1, hand_chalk = 1, wet = seep = 0, T_rock = 12 °C, normal hands`, so `F_ref = Hold.friction × 1.17`.

---

## 3. Protection

The `Protection` interface is in [schemas §5](schemas.md#5-wall-holds-routes). `reach_from` lists the hold ids from which the action is legal (a bolt can be clipped only while a hand is on one of them). The fall resolver in [05b §11](05b-move-resolution-and-attempt-loop.md#11-falls) reads the fields below.

| `ProtectionKind` | Fields used | Meaning | Discipline |
|---|---|---|---|
| `bolt` | `y`, `quality`, `reach_from` | Fixed anchor point. `quality` is bolt condition: 1.0 glue-in, 0.8 expansion, 0.5 rusted. Fall length is measured from the last **clipped** bolt | sport, multipitch |
| `gear` | `y`, `x`, `gear_sizes`, `quality`, `reach_from` | A placement opportunity. `gear_sizes` lists what fits (`c0.3..c6`, `nut1..nut13`). `quality` is the best achievable placement; the climber's `gear_placement` roll ([05b §11](05b-move-resolution-and-attempt-loop.md#11-falls)) produces the actual holding probability | trad, bigwall |
| `anchor` | `y`, `reach_from` | Belay or lower-off; reaching it ends the attempt as a send | sport, trad |
| `pad_zone` | `y` (pad top height), `x` (centre), `quality` (coverage 0–1) | Landing zone. `quality 1.0` is a flat, fully padded landing; `0.4` is a sloping landing with one pad | boulder |
| `water` | `y` (water level), `quality` (depth factor: 1.0 deep, 0.3 shallow or ledges below the surface) | Swell from weather multiplies consequence ([07 DWS](07-disciplines.md)) | dws |
| `ice_screw` | as `gear` with `gear_sizes` = screw lengths | P4 | ice |
| `none` | — | Stand-in for ground-fall sections; the resolver treats the ground at `y = 0` as the landing | any |

Spotter quality is not a protection object; it comes from the partner (`NPC.spot_quality`) present at the attempt.

---

## 4. Climber rig

### 4.1 Lengths (from 02 §C.1)

```
height_m  = height_cm / 100
arm_len   = 0.44 × height_m × ape_index                 shoulder to fingertip
leg_len   = 0.47 × height_m × (1 + 0.03 × leg_torso)    hip to toe
torso_len = height_m − leg_len − 0.13 × height_m         hip to shoulder (head is 0.13 × height)
hip_reach_factor      = 0.7 + 0.3 × hip_mobility / 100
shoulder_reach_factor = 0.85 + 0.15 × shoulder_mobility / 100
```

Worked: 170 cm, ape 1.00 → `arm_len 0.748 m`, `leg_len 0.799 m`, `torso_len 0.680 m`. 178 cm, ape 1.05 → `arm_len 0.822`, `leg_len 0.837`.

### 4.2 Anchors, body centre, hips and shoulders

The rig is **four anchors and a centre of mass**. Each `Limb` (`LH`, `RH`, `LF`, `RF`) is either anchored on a hold or free. The state of the climber for all engine purposes is:

```
State = { anchors: Partial<Record<Limb, hold_id>>, posture: Posture, feet_cut: boolean }
```

Body points are derived from the anchors, never integrated:

```
C_hands = centroid(anchored hand holds)              in (x, s)
C_feet  = centroid(anchored foot holds)
C       = 0.5 × C_hands + 0.5 × C_feet               if at least one foot is anchored
        = C_hands + (0, −0.45 × height_m/1.70)       if feet are cut (dangling)
shoulder = C + Δsh(posture) × height_m/1.70
hip      = C + Δhip(posture) × height_m/1.70
CoM      = hip + (0, +0.10 × height_m/1.70)
```

**Lock-off.** With exactly one hand anchored and at least one foot on (the state a hand move is measured from, 5.1), the shoulder rises toward the holding hand `H`:

```
lock_depth = 0.40 − 0.35 × lockoff/100                  metres at 170 cm; effective lockoff, after trait multipliers   (tune)
shoulder.s = max(shoulder.s, min(H.s − lock_depth × height_m/1.70, C_feet.s + 0.9 × (leg_len + torso_len)))
```

`lockoff 0` locks to `0.40 m` below the hold (an arm still well bent), `lockoff 100` to `0.05 m` (a full lock); the cap is standing up on the feet. The lift never lowers the shoulder, so with the feet already high nothing changes. Without it the shoulder sits midway between the remaining hand and the feet, so a static move gains little height unless the feet come up first, and generated lines needed 1.5 foot moves per hand move. Worked (reference body, hands at 2.0 m, feet at 0.5 m): the body centre puts the shoulder at 1.40 m and a static reach gains 0.09 m above the holding hand; at the reference lock depth `0.30 m` the shoulder is at 1.70 m and the reach gains 0.39 m. Each 10 points of `lockoff` adds 3.5 cm of static reach.

The Reference Climber's lock depth is **pinned at `0.30 m`** (the depth at `lockoff ≈ 29`, the middle of P1a play), as its mobility is pinned at 50 ([05c §1.1](05c-grade-engine.md#11-construction)). If its depth followed its `lockoff = S_ref(n)`, its reach would grow with DI, its legal move classes would change along the grade scale, and because a short dyno scores easier than a full-stretch deadpoint to the same hold, its send curve would stop being monotone ([05c §4](05c-grade-engine.md#4-calibration-tests) C3). Its lock-off strength still scales with DI through the [05b](05b-move-resolution-and-attempt-loop.md#3-the-attribute--hold-type--move-class-matrix) matrix.

Posture offsets (metres at 170 cm, `(Δx, Δs)`; `Δx` sign is "towards the dropped knee / away from the feature" where it applies):

| `Posture` | `Δsh` | `Δhip` | Notes |
|---|---|---|---|
| `hang` | (0, +0.15) | (0, −0.35) | default two hands, feet on |
| `compression` | (0, +0.10) | (0, −0.30) | hands squeezing opposing holds; hips in |
| `drop_knee` | (0, +0.20) | (±0.10, −0.25) | one knee dropped; hip shifts towards it |
| `kneebar` | (0, +0.25) | (0, −0.15) | hips high and locked |
| `rest_stance` | (0, +0.25) | (0, −0.30) | straight arms, weight on feet |
| `mantle` | (0, +0.05) | (0, −0.10) | body folded over the lip |
| `jam_stack` | (0, +0.15) | (0, −0.35) | as hang, inside a crack |
| `layback` | (±0.15, +0.15) | (±0.10, −0.30) | leaning away from an arête or crack |
| `stem` | (0, +0.30) | (0, −0.20) | feet spread on two surfaces |

### 4.3 Pose: two-bone IK, no physics

The drawn pose is computed from the four anchors, `shoulder` and `hip`, and is purely cosmetic. For each limb with root `R` (shoulder for hands, hip for feet) and anchor `A`:

```
l1, l2 = 0.47 × arm_len, 0.53 × arm_len           (upper arm · forearm+hand); legs 0.50 / 0.50
D = clamp(|A − R|, |l1 − l2| + 0.01, l1 + l2 − 0.01)
cosθ = (l1² + l2² − D²) / (2 l1 l2)              elbow/knee interior angle
joint = R + l1 × rotate(unit(A − R), ±acos((l1² + D² − l2²)/(2 l1 D)))
```

The bend sign is fixed per limb: elbows bend outward and down, knees bend outward, except `drop_knee` (the dropped knee bends inward) and `kneebar` (knee locked at `cosθ = 0.2`). A free limb is drawn relaxed: hands at `shoulder + (±0.15, −0.30)`, feet at `hip + (±0.12, −0.55)`. The torso is the segment `hip → shoulder`; the head sits `0.13 × height_m` above the shoulder line.

Transitions interpolate joint positions over `250 ms` (static), or play a two-keyframe launch/catch over the commit-window sweep for dynamic moves ([05b §8](05b-move-resolution-and-attempt-loop.md#8-commit-window)). A fall is a scripted animation to the resolved landing, not a simulation. The watched wall draws its own rig from these points and animates each move class for its own time ([25 §10](25-visual-representation.md)); this section's poses stay the reach model.

**There is no physics.** No gravity integration, no collision, no ragdoll, no friction simulation. Balance, friction and strength are numbers in [05b](05b-move-resolution-and-attempt-loop.md); the rig only shows the result. The overhaul in [23](23-move-types-and-art-direction.md) adds two closed-form exceptions, not a simulation step: a dyno's centre of mass follows a ballistic arc, and on a balance move it drifts at a set speed. Both are pure functions of the logged inputs.

---

## 5. Reach envelope

### 5.1 Free-limb reach

For a free limb in a given `State`:

```
R_hand = arm_len × shoulder_reach_factor × PF_hand(posture)            centre = shoulder
R_foot = leg_len × hip_reach_factor      × PF_foot(posture)            centre = hip
reach circle = { p : d(centre, p) ≤ R × class_reach }                  class_reach: static 1.00 · deadpoint 1.15 · dyno 1.50
```

Posture reach factors `PF`:

| `Posture` | `PF_hand` | `PF_foot` |
|---|---|---|
| `hang` | 1.00 | 0.95 |
| `compression` | 0.90 | 0.95 |
| `drop_knee` | 1.05 | 0.85 |
| `kneebar` | 1.05 | 0.70 |
| `rest_stance` | 1.00 | 1.00 |
| `mantle` | 0.80 | 0.90 |
| `jam_stack` | 0.95 | 0.90 |
| `layback` | 0.95 | 0.95 |
| `stem` | 0.95 | 1.10 |

Worked (reference body, `shoulder_mobility 50`, `hip_mobility 50`): `R_hand(hang) = 0.748 × 0.925 × 1.00 = 0.692 m`; `R_hand(compression) = 0.623 m`; deadpoint from compression `0.716 m`; dyno from compression `0.934 m`; `R_foot(compression) = 0.799 × 0.85 × 0.95 = 0.645 m`.

The **relative reach** `r = d / (R × class_reach)` is the number that [05b §4](05b-move-resolution-and-attempt-loop.md#4-resolution) turns into a difficulty term: comfortable below `0.70`, stretched above `0.85`, at full extension at `1.00`.

### 5.2 Reachable set and reasons

For each free limb the engine computes, once per `State`, the list of holds with a verdict:

| Verdict | Condition (checked in this order) | Preview text |
|---|---|---|
| `blocked` | Hold occupied by another limb and (`size ≤ s` or `!matchable(type)`), or the straight segment limb→target passes within `0.10 m` of the other hand's hold (cross-through) | "blocked: your other hand" |
| `wrong_side` | Limb/hold handedness fails (5.3), or hands: `target.x` is beyond the other hand by more than `0.25 m` on the far side; feet: beyond the other foot by more than `0.30 m` | "wrong side: use the other hand" |
| `too_far` | `d > R × 1.50` | "out of reach: 0.12 m" |
| `dyno` | `R × 1.15 < d ≤ R × 1.50` and dyno legal (05b §2) | "dyno only" |
| `deadpoint` | `R < d ≤ R × 1.15` | "deadpoint" |
| `reachable` | `d ≤ R` | distance shown as `r` |

`matchable(type)` is true for `jug`, `edge`, `sloper`, `volume`, `horn`, `pinch`, `pocket2`, `pocket3`, `sidepull`, `undercling`, `gaston`, `crack_*` and false for `crimp` below size `m`, `pocket1`, `foot_chip`, `smear`. The shaded envelope drawn on limb select is the `reachable` circle; `deadpoint` and `dyno` rings are drawn as two fainter bands outside it.

### 5.3 Handedness and orientation

A hold's `orientation` says which way its usable face points. The limb must be able to pull (or push) against that face from where the body is:

| Type | Usable by | Rule |
|---|---|---|
| canonical-0 types (`crimp`, `edge`, `sloper`, `pinch`, `pocket*`, `jug`, `horn`, `volume`) | either hand | always; `orientation` only adds the small mismatch term in 05b |
| `sidepull` | hand on the **near** side | `orientation 90` (face points right): usable by `RH` when `hold.x ≥ C.x − 0.10`; `orientation 270`: mirror |
| `gaston` | hand on the **far** side | `orientation 90`: usable by `LH` pushing when `hold.x ≥ C.x`; requires `shoulder_mobility ≥ 20` |
| `undercling` | either hand | usable only when `hold.s < shoulder.s + 0.10` (at or below the shoulders) |
| `crack_*` | either hand/foot | ignores orientation |
| arête/hueco holds | either | ignores orientation (1.3) |

### 5.4 Precomputation

A `State` changes only when a limb moves or the posture changes, so the engine recomputes the four reachable sets at most once per turn. Each set is bounded by the holds within `1.5 × R` (≤ 12 by the legibility rule in 06), so a full recompute is under 50 distance checks. Reach verdicts, `r` values and the derived `MoveDifficulty` previews are cached on the `State` and invalidated together; the grade engine ([05c](05c-grade-engine.md)) reuses the same cache code in expected-value mode.

---

## 6. Posture classes

Posture is chosen after each move: the highest `position_quality` of the eligible list (the climber's own choice since play is simulated, [24](24-simulation-game.md)). It sets reach factors (5.1), body offsets (4.2), a quality factor, and modifiers used by 05b.

| `Posture` | Eligible when | `q_class` | Pump mult | Rest eligible | `foot_deficit` behaviour | Notes |
|---|---|---|---|---|---|---|
| `hang` | always with ≥1 hand | 1.00 | 1.00 | if a hand hold has `rest_value ≥ 0.3` | 0 / 0.5 / 1.0 for two / one / no feet | default |
| `compression` | two hands on holds with `|x_RH − x_LH| ≥ 0.45 m` and opposing orientation (one of them `sidepull`/`pinch`/`arete`-usable), or `arete`/`tufa` feature | 0.97 | 1.10 | no | as hang | squeezing; unlocks `compression` tag body mods |
| `drop_knee` | one foot on a hold with `s ≥ hip.s − 0.15` and lateral offset `≥ 0.25 m`, angle ≥ 95 | 1.02 | 0.90 | if hand hold `rest_value ≥ 0.3` | one dropped knee counts as a full foot | extends hand reach, shortens foot reach |
| `kneebar` | a foothold and an opposing surface (`hueco`, `tufa`, `corner`, or a hold `0.35–0.60 m × leg_len/0.80` above it facing down) | 1.03 | 0.60 | yes, `rest_value + 0.5` | counts as both feet | established by a `kneebar` move (05b §3) |
| `rest_stance` | two feet on holds with `quality ≥ 0.4` and angle ≤ 100, or a `ledge` | 1.00 | 0.50 | yes | 0 | the only posture in which hands can be shaken without a hold cost |
| `mantle` | hand on a `lip`/`ledge` hold at `s ≥ shoulder.s` | 0.95 | 1.20 | no | ignored | transitional; ends with `top_out` |
| `jam_stack` | both hands in `crack_*` holds | 0.98 | 0.95 | if `crack_hand` or wider | as hang | jams are low-pump when sized right |
| `layback` | `arete` or `crack` feature with feet smearing on the face | 0.96 | 1.15 | no | one foot smear counts as 0.5 | high pump, good reach |
| `stem` | `corner` feature, feet on both walls | 1.02 | 0.70 | yes | 0 | balance posture |

`q_class` enters the position quality below; the pump multiplier enters [05b §5](05b-move-resolution-and-attempt-loop.md#5-costs).

---

## 7. Position quality (carried forward)

Position quality is the number the preview shows as stars and that becomes the next move's posture factor in 05b. It depends on the posture class, the climber's `body_position`, and the anchor geometry, **not** on the next target:

```
position_quality = clamp(q_class × (0.95 + 0.10 × body_position/100) × base_geom, 0.80, 1.05)
base_geom = 1 − 0.05 × foot_deficit × (1 − core_tension/200)
              − 0.04 × spread_penalty
              − 0.04 × balance_penalty
  foot_deficit    = 0 (two feet) · 0.5 (one foot) · 1.0 (feet cut)
  spread_penalty  = clamp((|x_RH − x_LH| − 0.9 × span_m) / (0.3 × span_m), 0, 1)       hands wider than 90 % of span
  balance_penalty = clamp(|hip.x − C_hands.x| / (0.5 × R_hand) − 0.5, 0, 1)             hips far outside the hands
```

Display: `≥ 1.02` ★★★★★ · `0.98–1.02` ★★★★ · `0.93–0.98` ★★★ · `0.87–0.93` ★★ · `< 0.87` ★. Reach is charged per move by the `Rch` term in 05b §4.1, not here, so the stars describe the stance, not the reach.

Worked: `hang`, two feet, `body_position 36`: `1.00 × 0.986 × 1.0 = 0.986` (★★★★). `compression`, two feet, `body_position 28`: `0.97 × 0.978 = 0.949` (★★★). `hang` with feet cut and `core_tension 46`: `1.00 × 0.986 × (1 − 0.05 × 1 × 0.77) = 0.948`.

---

## 8. State machine summary

```
turn:
  1. reachable sets for each free limb (5.2), cached on State
  2. for each (limb, hold) pair: MoveClass candidates (05b §2) → MoveDifficulty, margin, costs, next position_quality (05b §4–7)
  3. the climber picks an action by its tactics (05b §1, [24 §3.1](24-simulation-game.md))
  4. State' = apply(action): anchors updated, posture chosen from eligible list, feet_cut updated
  5. pose = IK(State') (4.3); animate 250 ms when the attempt is being watched
```

Nothing in this loop depends on time passing except the rest action; the wall itself never changes during an attempt.

---

## Open questions / proposed schema additions

1. **`WallSegment.length_m?: number`** — required when `angle ≥ 165`, so horizontal roofs (`180°`) can be expressed; derived as `(y1 − y0)/sin(angle)` otherwise. Without it, P1–P2 content caps roofs at 170°.
2. **`Hold.s?: number`** — the arc-length coordinate, needed on roof segments where several holds share one `y`. Derived for all other segments; the validator should reject two holds with equal `(x, y)` on a segment with `angle ≥ 165` unless `s` is given.
3. **`Protection.width_m?: number`** for `pad_zone` and `water`: the resolver currently treats `quality` as coverage and assumes a `2.0 m` wide zone centred on `x` **(tune)**.
4. **`Hold.kneebar_with?: string`** — explicit opposing-surface pairing for kneebars outside `hueco`/`tufa`/`corner` segments (6). The generator can infer it from geometry, but signature-route authors need to state it.
5. The `0.25 m` cross-over limit (5.2) forbids true cross-through moves; if playtesting wants them, add a `cross_through` move class or treat them as `bump` with a `+1.0` difficulty term.
6. Rendering: `k_lat = 0.5` is a guess; it must be tuned on device against the `0.18 m` separation rule in [06 §3](06-procedural-routes.md#3-legibility) before P1a art is locked.
