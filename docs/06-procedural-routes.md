# Procedural Routes

This document specifies how the game manufactures its climbing: a features-first generator that reads a crag's `CragStyleProfile`, traces a line a reference climber can physically follow, dresses it with holds, rests and protection, grades it with [05c](05c-grade-engine.md), adjusts, and names it. The same `Route` schema carries hand-authored signature routes. Everything is seeded so a route is reproducible from its seed string, and legibility is a hard constraint rather than an afterthought.

Related: [schemas](schemas.md) · [05a Wall and Kinematics](05a-wall-and-kinematics.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [05c Grade Engine](05c-grade-engine.md) · [09 World Atlas](09-world-atlas.md) · [17 UI/UX](17-ui-ux.md) · [20 Content Pipeline](20-content-pipeline.md)

Numbers marked **(tune)** are proposals for the balance harness ([19](19-balance-and-simulation-testing.md)).

---

## 1. How `CragStyleProfile` is consumed

| Field | Generator use |
|---|---|
| `rock` | `Hold.friction` base and `sharpness` default ([05a §2.3](05a-wall-and-kinematics.md#23-friction)); which `rock_knowledge` entry the route trains; wet-rock rules via [10](10-weather-and-conditions.md) |
| `hold_weights` | Sampling distribution for hand-hold types at each line node, filtered by angle and class legality (§2.4) |
| `angle_dist` | Sampling distribution for segment angles (§2.1) |
| `length_m` | Triangular sample `(min, mode, max)` for route length |
| `hold_density_max` | Hard cap on holds per m² of surface, including decoys and footholds |
| `protection` | Bolt spacing, gear sizes, pad coverage (§2.6) |
| `polish`, `sharpness`, `friction_base` | Per-hold defaults; `polish` is jittered `±0.15` per hold and grows with the crag's popularity over a run |
| `seep_susceptibility` | Probability that holds in `tufa`/`hueco`/`corner` segments carry `state.seep` after rain |
| `crux_position` | Where the hard moves sit (§2.4): `low`, `mid`, `high` or `spread` |
| `move_grammar` | Stationary weights of the move-class Markov chain (§2.3) |
| `tags` | Feature probabilities, rest spacing, decoy rate and name bank are derived from tags until the fields proposed in Open questions exist (§6 companion table) |

A crag lists several profiles (`Crag.style_profiles`); a visit samples one per slot weighted equally, so a Font day mixes slab, sloper-bulge and roof problems.

---

## 2. The pipeline

Inputs: `profile`, `discipline`, `di_target`, `seed`. Output: a `Route` with `di_graded`, `danger`, `beta_line` (proposed field), holds, protection and a name. All randomness comes from `RngStream(hash(seed, stage))`, one stream per stage, so changing the naming stage never changes the holds.

```
generate(profile, discipline, di_target, seed):
  wall      = wall_profile(profile, discipline)                         §2.1
  features  = place_features(wall, profile)                             §2.2
  line      = trace_main_line(wall, features, profile, di_target)       §2.3  — hand nodes, foot nodes, posture per node
  holds     = attach_holds(line, profile, di_target)                    §2.4  — sizes/qualities solved for target MD
  holds    += add_rests(line, holds, profile, discipline)               §2.5
  prot      = add_protection(wall, line, profile, discipline)           §2.6
  holds    += decoys(line, holds, profile)                              §2.7
  for i in 1..6:                                                        §2.8
    (di, components, danger) = grade(route)                             05c
    if |di − di_target| ≤ 0.5: break
    adjust_crux_holds(holds, di − di_target)
  if |di − di_target| > 1.0: return generate(profile, discipline, di_target, seed + ':retry')
  assert legibility(route)                                              §3
  route.name = name(profile, route, seed)                               §2.9
```

### 2.1 Wall profile

```
length_m  = triangular(profile.length_m)                      boulder 2.5–6 m, sport 12–40 m
n_seg     = max(1, round(length_m / seg_len)),  seg_len = 1.2 m (boulder) · 4 m (route)   (tune)
angle_k   = sample(profile.angle_dist), then smooth: |angle_k − angle_{k−1}| ≤ 25° unless a lip is placed (roof → headwall drop of 40–70° allowed)
y bounds  = cumulative Δy = seg_len × sin(angle_k)            WallSegment { y0, y1, angle } per 05a §1.1
```

Boulders start with a `0.3 m` ground segment at the first angle; routes end with a `1.0 m` anchor segment at `≤ 95°`.

### 2.2 Features

At most one `feature` per segment ([05a §1.3](05a-wall-and-kinematics.md#13-features)). Probabilities per segment come from the profile's tags **(tune)**: `arete` tag → `0.30` arête · `compression` → `0.25` arête or tufa · `crack` → `0.60` crack (then every crack segment is contiguous) · `corner` → `0.20` corner · `roof` → `0.50` hueco on roof segments (syenite/limestone only) · `tufa`-rock (`limestone` with `endurance` tag) → `0.35` tufa. Forced placements: a `lip` at every transition from `> 120°` to `≤ 100°`; a `ledge` at most once per 8 m on routes ≥ 12 m, never on boulders; `hueco` and `tufa` only on `syenite`, `limestone`, `dolomite`, `conglomerate`.

### 2.3 Main line: a move grammar with bounded lateral drift

The line is a sequence of **nodes**, each a hand position with a move class, built from the start holds to the finish. The reference climber at `di_target` ([05c §1](05c-grade-engine.md#1-the-reference-climber)) supplies the reach radii, so a line always exists for the body the grade is defined against.

```
start: two hand nodes at y ∈ [1.0, 1.3] (boulder) / [1.4, 1.8] (route), x = x0 ± 0.20, x0 ~ U(−0.3, 0.3)
       two foot nodes 0.7–0.9 m below, within r ≤ 0.85 of the hips
loop until the finish is within reach:
  class  = next_class(prev_class, profile.move_grammar, segment)                     Markov step, constraints below
  Δs     = step_len(class) × R_hand(ref, posture) :  static U(0.55, 0.85) · deadpoint U(0.90, 1.05) · dyno U(1.15, 1.40)
                                                     bump U(0.20, 0.40) · match 0 · jam U(0.50, 0.75) · mantle to finish
  Δx     = clamp(N(0, 0.15) − 0.3 × (x − x0), −0.35, +0.35)                          restoring drift
  x      = clamp(x + Δx, x0 − drift_max, x0 + drift_max) ∩ [−W/2 + 0.2, W/2 − 0.2]   drift_max 0.6 m boulder · 0.9 m route   (tune)
  hand   = alternate L/R, except bump/match keep the hand; a 15 % chance of a same-hand move when the line drifts > 0.25 m sideways
  posture= highest position_quality eligible posture for the new anchors (05a §6); compression if the segment has arete/tufa and |x_RH − x_LH| ≥ 0.45
  feet   = after every hand node, 1–2 foot nodes so that both feet have r ≤ 0.9 from the hips and at least one is within 0.4 m laterally of the hands' centroid;
           foot class = high_step if the node is above hip − 0.1, heel_hook/toe_hook per 05b §2 on segments ≥ 110°, else static
```

Grammar constraints (hard): no two dynamic hand moves in a row; dynamic hand moves ≤ 15 % of hand moves (the commit-window frequency target of [05b §8.1](05b-move-resolution-and-attempt-loop.md#81-trigger)); no dynamic move within two nodes after a rest; `jam` only on `crack` segments and `crack` segments only contain `jam`/`match`; `kneebar` only where [05a §6](05a-wall-and-kinematics.md#6-posture-classes) finds an opposing surface; `high_step` only on segments `≤ 130°`; `heel_hook`/`toe_hook` only `≥ 110°`; `mantle` only as the final node onto a `lip`/`ledge`; `smear` footholds only `≤ 95°`.

### 2.4 Attaching holds and footholds

Each node becomes a `Hold`. Type is sampled from `hold_weights` filtered by legality (no `smear`/`foot_chip` as hands; no `pocket1` on a `dyno`; `undercling`/`gaston` only where [05a §5.3](05a-wall-and-kinematics.md#53-handedness-and-orientation) makes them usable from the line's body position; cracks fixed by the feature). Size and quality are **solved** so the move lands at its intended difficulty for the reference climber:

```
MD_target(node) = di_target + crux_offset(node) − 0.30
  crux_offset: the crux set is the 1 (boulder) or 2–3 (route) nodes selected by crux_position
               (low: first third · mid: middle third · high: last third · spread: evenly); crux nodes +0.6, others −0.3    (tune)
  dynamic nodes: −0.4 (the class term and the window already make them the memorable moves)
pick size from {m, l, s, xl, xs} in that order; quality = 0.5 − (MD_target − (H + S + A + Rch + C + Fe)) / 4
accept the first (size, quality) with quality ∈ [0.15, 0.90]; if none, change hold type and retry (max 5)
orientation = canonical(type) + N(0, 10°); sidepulls/gastons face away from the body side; sharpness = profile.sharpness + N(0, 0.1)
friction = base(profile.rock) × (1 − 0.4 × polish);  rest_value from 05a §2.2; hidden = true with p 0.04 (boulder) · 0.08 (route), never start/finish/crux holds
```

Footholds use the foot columns of the matrix and `H_foot`; their `MD_target` is `di_target − 1.5` **(tune)** so feet are reliable but not free. The `−0.30` offset is the empirical gap between a homogeneous six-move problem's move difficulty and its route DI under `X = 0.35`; the accept/adjust loop (§2.8) corrects the rest.

### 2.5 Rests

Routes: every `rest_spacing` metres (from tags: `endurance` 7 m · default 10 m · `power` 13 m **(tune)**) the nearest node's hold is replaced by a rest hold — `jug` (`rest_value 0.9`), `horn` (0.7), `crack_hand` on crack segments (0.6), a `kneebar` pairing on `tufa`/`hueco`/`corner` segments (`+0.5`), or a `ledge` feature if one is there — and the node is annotated `rest` in the line. Boulders get no designed rests; a `kneebar` tag may add one.

### 2.6 Protection

| Discipline | Rule |
|---|---|
| `boulder` | one `pad_zone` at `y = 0.3` (pad top), `x = x0`, `quality` = pad coverage from the crag (`Fontainebleau 0.8`, `Hueco 0.7`, highball sectors `0.4`) |
| `sport` | `bolt`s from `y = 3.5 ± 0.5` every `profile.protection.spacing_m × U(0.8, 1.2)`; `reach_from` = hand nodes within `1.2 m` below the bolt and `0.6 m` laterally; `anchor` at the top; `quality 0.9 ± 0.1` |
| `trad` | `gear` opportunities on crack segments every `1.5–3 m` with `gear_sizes` drawn from `profile.protection.gear_sizes` and `quality ~ U(0.5, 1.0)`; blank face segments get none (that is where `danger` comes from) |
| `dws` | one `water` object at `y = 0`, `quality` from the crag's depth map; swell from weather |

### 2.7 Off-route decoys

Decoys exist so the wall reads as rock rather than a dot-to-dot, but never as traps:

```
n_decoys = round(decoy_rate × n_line_holds)        decoy_rate 0.30 boulder · 0.50 route   (tune)
placement: inside the hand reach circle of a random node, ≥ 0.18 m from every other hold, never inside the start or finish circles
quality ≤ 0.35 and size ≤ s for 90 % (clearly worse than the line); 10 % are "alternative beta" with normal parameters
hidden = false always; a decoy never raises any reach circle above the legibility cap (§3) — if it would, it is dropped
```

### 2.8 Accept/adjust

Grade with [05c](05c-grade-engine.md). If `di − di_target > 0.5`, raise the quality of the crux holds by `0.05` per `0.25 DI` of excess (and lower the others by half that); if too easy, the reverse; sizes change only when quality would leave `[0.15, 0.90]`. Six iterations; routes still outside `±1.0` are regenerated with a derived seed. Routes that grade `UNGRADEABLE` (a move the reference body cannot reach at any level) are regenerated immediately. The final `di_graded`, components and `danger` are written to the route.

### 2.9 Names

Names come from a per-profile bank (Open questions: `name_bank`) with templates and a uniqueness check within the crag. Signature names are reserved. Banks are crag-flavoured, fictional and free of people's names:

| Bank | Templates | Examples |
|---|---|---|
| `font_fr` | `{Le/La} {noun}` · `{noun} {de/du} {place}` · `{adj} {noun}` · `{noun} {Gauche/Droite/Direct}` | "La Pince du Renard", "Angle Parfait", "Le Toit Gauche" |
| `hueco_tx` | `{adj} {noun}` · `{noun} {Low/Left/Right/Direct}` · `{noun} of {noun}` | "Low Tide Roof", "Dragonfly Left", "Mesquite Hour" |
| `kalymnos_gr` | `{Greek noun} {English noun}` · `{adj} {noun}` · `{noun} {Direct/Extension}` | "Aegean Lantern", "Grande Grotta Extension", "Thalassa Direct" |

Generated names are `Route.name`; the player may rename a route they first-ascend in-game (reputation hook in [15](15-social-reputation-events.md)).

---

## 3. Legibility

The wall must be readable on a phone at a glance. Two hard constraints are checked after generation and enforced by dropping decoys, then footholds, then nudging line holds by `≤ 0.10 m`:

```
L1: for every hand node, the hand reach circle (R_hand of the reference climber at the crag's di_range top, hang posture, radius ≈ 0.70 m)
    contains ≤ N_hand = 5 holds with hands_ok (line holds, decoys, matchable holds); the foot circle (radius ≈ 0.65 m) contains ≤ N_foot = 4 feet_ok holds;
    the union ≤ 7
L2: any two usable holds are ≥ 0.18 m apart in surface distance
```

Why `N_hand = 5`: a reach circle of radius 0.70 m is about 1.5 m² of surface; five 24 px silhouettes at base zoom in that area average 0.55 m apart and never overlap, so shape still carries type. Decision-wise, a hand node has the current hold, two or three live options and at most one decoy — three live choices is the readable-tension sweet spot the plan cites from Into the Breach, and choice time grows with the logarithm of the option count, so five is where the preview triangle still fits on screen for every option. Why `0.18 m`: a 2.6 m boulder fills roughly 640 dp of screen height, so `0.18 m ≈ 44 dp`, the minimum comfortable touch target; on long routes the camera zooms to a 3 m window so the same rule holds. Silhouettes by type are specified in [05a §2.2](05a-wall-and-kinematics.md#22-hold-types-silhouettes-norms-defaults); state (reachable, selected, unreachable with reason, chalked, wet, hidden-revealed) is carried by outline and hue, never by shape, so the two channels never collide.

---

## 4. Signature routes

Each crag ships 2–4 hand-authored routes in the same `Route` schema with `signature: true`, a required `di_target`, a hand-written `beta_line`, and `fa_note` text that is fictional. Real route **names** are allowed as geography (the plan's resolved decision); no real person appears anywhere, and the validator rejects a configurable list of real climbers' names ([schemas §9](schemas.md#9-validation-rules-enforced-by-the-content-validator-see-20) rule 8). The grade engine must land within `±1.0` of `di_target` (05c test C7); the displayed grade is the canonical one regardless ([08 §1](08-grades.md#display-rules)).

P1a Fontainebleau set (from the atlas, [09](09-world-atlas.md)): **Marie-Rose** 6A (`di_target 13`, vertical sandstone, crimps and a committing slap to the top, `danger safe`), **Rainbow Rocket** 8A (`di_target 25`, a single huge `dyno` from slopers to a lip jug, `danger spicy` for the swing), **L'Alchimiste** 8B (`di_target 27`, overhanging slopers and compression, `danger safe`). Each is a complete `Route` JSON in content; `fa_note` reads, for example, "Opened by a Bleausard whose name the sand forgot; the game credits no real person."

Signature routes are listed on every visit, keep their `Tick` history, and are what the atlas's `signature_routes` ids point at.

---

## 5. Determinism, routes per visit, persistence

```
seed       = hash(crag.id, sim_day, slot)                       slot = 0..N−1 for the visit
Route.seed = `${crag.id}:${sim_day}:${slot}`
Route.id   = 'proc_' + hash(Route.seed)                         reproducible from the seed string alone
```

| Discipline at the crag | Procedural routes per visit (slots) | Target DI per slot (relative to the player's estimate `E` from [02 §C.3](02-character-model.md#c3-grade-estimates-display-on-the-character-sheet)) |
|---|---|---|
| `boulder` | 8 | 1 warm-up `E − 4..−3` · 3 at `E − 2..0` · 3 at `E..E + 2` · 1 project `E + 3..E + 4`, each clamped to `Crag.di_range` |
| `sport`, `trad` | 5 | 1 at `E − 3..−2` · 2 at `E − 1..0` · 1 at `E..E + 1` · 1 at `E + 2..E + 3` |
| `dws`, multipitch | 3 | as sport without the project slot |

Signature routes are always listed in addition. The generator is deterministic given `(crag, day, slot, player E)`, where `E` is rounded to `0.5 DI` so that small attribute changes during a day do not reshuffle the list; the action log records `E` with the `day_plan` so replay regenerates the same routes.

**Tick-list persistence.** A `Tick` stores `route` (the id), `day`, `style`, `attempts`, `di`. Because the id encodes the seed, any ticked or attempted procedural route can be regenerated for display forever. The save state keeps per crag a list of **known routes** (proposed field): every procedural route the player attempted stays listed on later visits, regenerated from its seed; routes attempted three or more times are pinned as **projects** until sent or until 365 sim-days pass; untouched routes vanish with the day. Day-specific `Hold.state` (chalk, wet, seep) is not part of the route and is recomputed from weather on each visit.

---

## 6. Example style profiles

Field names are those of `CragStyleProfile` in [schemas §6](schemas.md#6-world). Parameters the generator needs that are not yet schema fields follow in the companion table and are proposed in Open questions.

### 6.1 Fontainebleau — sloper bulge boulder

```json
{
  "id": "font_sloper_bulge",
  "rock": "sandstone_font",
  "hold_weights": { "sloper": 0.34, "edge": 0.14, "crimp": 0.10, "pinch": 0.10, "volume": 0.08, "jug": 0.06, "sidepull": 0.06, "pocket3": 0.04, "foot_chip": 0.05, "smear": 0.03 },
  "angle_dist": [ { "angle": 80, "weight": 0.10 }, { "angle": 92, "weight": 0.25 }, { "angle": 100, "weight": 0.35 }, { "angle": 110, "weight": 0.20 }, { "angle": 125, "weight": 0.10 } ],
  "length_m": { "min": 2.5, "mode": 3.5, "max": 5.0 },
  "hold_density_max": 4.0,
  "protection": { "kind": "pad_zone" },
  "polish": 0.25, "sharpness": 0.30, "friction_base": 0.60,
  "seep_susceptibility": 0.10,
  "crux_position": "high",
  "move_grammar": { "static": 0.55, "match": 0.08, "bump": 0.05, "deadpoint": 0.08, "dyno": 0.03, "high_step": 0.10, "heel_hook": 0.05, "mantle": 0.06 },
  "tags": ["boulder", "sloper", "compression", "friction", "footwork", "overhang", "arete"]
}
```

### 6.2 Hueco Tanks — syenite roof boulder

```json
{
  "id": "hueco_syenite_roof",
  "rock": "syenite",
  "hold_weights": { "jug": 0.22, "pocket3": 0.14, "pocket2": 0.08, "edge": 0.14, "crimp": 0.10, "undercling": 0.10, "horn": 0.06, "sidepull": 0.06, "pinch": 0.04, "sloper": 0.03, "foot_chip": 0.03 },
  "angle_dist": [ { "angle": 95, "weight": 0.15 }, { "angle": 115, "weight": 0.20 }, { "angle": 140, "weight": 0.25 }, { "angle": 155, "weight": 0.25 }, { "angle": 168, "weight": 0.15 } ],
  "length_m": { "min": 3.0, "mode": 4.5, "max": 6.0 },
  "hold_density_max": 3.5,
  "protection": { "kind": "pad_zone" },
  "polish": 0.20, "sharpness": 0.55, "friction_base": 0.58,
  "seep_susceptibility": 0.05,
  "crux_position": "mid",
  "move_grammar": { "static": 0.42, "match": 0.06, "bump": 0.04, "deadpoint": 0.10, "dyno": 0.05, "heel_hook": 0.12, "toe_hook": 0.10, "kneebar": 0.04, "mantle": 0.07 },
  "tags": ["boulder", "roof", "overhang", "jug", "pocket", "power", "core", "dynamic"]
}
```

### 6.3 Kalymnos — limestone tufa sport

```json
{
  "id": "kalymnos_tufa_sport",
  "rock": "limestone",
  "hold_weights": { "pinch": 0.20, "jug": 0.20, "sloper": 0.12, "edge": 0.12, "pocket3": 0.08, "pocket2": 0.06, "sidepull": 0.08, "undercling": 0.06, "horn": 0.04, "crimp": 0.04 },
  "angle_dist": [ { "angle": 92, "weight": 0.15 }, { "angle": 100, "weight": 0.30 }, { "angle": 110, "weight": 0.30 }, { "angle": 125, "weight": 0.20 }, { "angle": 145, "weight": 0.05 } ],
  "length_m": { "min": 15, "mode": 28, "max": 40 },
  "hold_density_max": 2.5,
  "protection": { "kind": "bolt", "spacing_m": 2.8 },
  "polish": 0.35, "sharpness": 0.45, "friction_base": 0.50,
  "seep_susceptibility": 0.60,
  "crux_position": "spread",
  "move_grammar": { "static": 0.56, "match": 0.08, "bump": 0.06, "deadpoint": 0.06, "dyno": 0.01, "high_step": 0.06, "heel_hook": 0.04, "kneebar": 0.07, "rest": 0.06 },
  "tags": ["sport", "endurance", "pinch", "jug", "overhang", "humid", "polished", "redpoint", "onsight"]
}
```

### 6.4 Companion generator parameters (derived from tags today; proposed schema fields)

| Profile | feature weights per segment | rest spacing (m) | decoy rate | hidden rate | drift max (m) | pad coverage / bolt quality | name bank |
|---|---|---|---|---|---|---|---|
| `font_sloper_bulge` | arete 0.30 · lip forced at roof→wall · none 0.70 | — | 0.30 | 0.04 | 0.6 | pad 0.80 | `font_fr` |
| `hueco_syenite_roof` | hueco 0.50 on roof segments · lip forced · none | — | 0.30 | 0.04 | 0.6 | pad 0.70 | `hueco_tx` |
| `kalymnos_tufa_sport` | tufa 0.35 · corner 0.10 · ledge ≤ 1 per 8 m · none | 7 | 0.50 | 0.08 | 0.9 | bolt 0.95 (friendly bolting) | `kalymnos_gr` |

Expected character after generation (05c components): Font — one high crux, "powerful", dynamic share 8–11 %, pump at the top `< 20`; Hueco — mid crux, "powerful" but pump `25–40` from `angle_pump` on the roof, heel/toe hooks on most problems, dynamic share 12–15 %; Kalymnos — "pumpy" to "enduro", 2–4 good rests including a kneebar, dynamic share `< 5 %`, danger `safe`.

---

## Open questions / proposed schema additions

1. **`CragStyleProfile` additions**: `feature_weights?: Partial<Record<WallSegment['feature'], number>>`, `rest_spacing_m?: number`, `decoy_rate?: number`, `hidden_rate?: number`, `drift_max_m?: number`, `pad_coverage?: number`, `name_bank: string`. Today all are derived from `tags` with the defaults in §6.4; making them explicit lets atlas authors tune a crag without touching the generator.
2. **`Route.beta_line`** (proposed in [05b](05b-move-resolution-and-attempt-loop.md#open-questions--proposed-schema-additions)) — the generator produces it; the grade engine consumes it; signature routes author it.
3. **`Route.components?`** — the surfaced 05c components (hardest move, crux density, pump, rests, dynamic share) should be stored rather than recomputed for route cards and tick-list sorting.
4. **Save-state `known_routes: Record<cragId, { route_id: string; seed: string; attempts: number; pinned_until?: number }[]>`** for tick-list persistence (§5).
5. **`WallSegment.length_m`** (proposed in [05a](05a-wall-and-kinematics.md#open-questions--proposed-schema-additions)) is needed before flat roofs (`180°`) can be generated; §6.2 caps at `168°` for this reason.
6. `N_hand = 5`, `0.18 m` and the per-slot target bands must be validated on a 5-inch device with the P1a art; the oblique projection constant `k_lat` in 05a interacts with L2.
7. The `−0.30` MD offset and the crux offsets in §2.4 are empirical from the 05b worked problems; the harness's C1 test is what makes them right across the whole DI range and every profile.
