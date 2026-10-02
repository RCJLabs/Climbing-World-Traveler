# Grade Engine

The grade engine turns a route into a Difficulty Index by asking one question: at what level would a balanced climber send this at the reference rate? It does so by running the move-resolution model of [05b](05b-move-resolution-and-attempt-loop.md) with the dice removed, against a **Reference Climber** whose attribute vector is a function of DI. Because play and grading share `MoveDifficulty`, `EffectiveStat` and the cost model, a route's grade is a prediction about the player's own odds, and a mis-tuned formula moves grades and play together rather than apart. Danger is graded on a separate axis from fall consequence.

Related: [schemas](schemas.md) · [02 Character Model](02-character-model.md) · [05a Wall and Kinematics](05a-wall-and-kinematics.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [06 Procedural Routes](06-procedural-routes.md) · [08 Grades](08-grades.md) · [19 Balance](19-balance-and-simulation-testing.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

Numbers marked **(tune)** are proposals for the balance harness. Research citations refer to the plan appendix (A1).

---

## 1. The Reference Climber

### 1.1 Construction

The Reference Climber at DI `n` is **balanced by construction**: every attribute that appears in the 05b matrix equals one number, `S_ref(n)`. Since every matrix cell's weights sum to `1.0`, its raw composite is `S_ref(n)` on every hold type and move class, so the DI scale is defined by this climber and by nothing else. Attributes that are state modifiers rather than strength or skill are held constant so that the scale stays purely physical and technical.

| Group | Attributes | Value at DI `n` |
|---|---|---|
| matrix physical | `finger_strength`, `finger_endurance`, `pull_power`, `lockoff`, `core_tension`, `leg_power`, `contact_strength`, `aerobic_capacity`, `anaerobic_capacity` | `S_ref(n)` |
| matrix technique | `footwork`, `body_position`, `dynamic_movement`, `tech_crimps`, `tech_slopers`, `tech_pinches`, `tech_pockets`, `tech_cracks`, `tech_slab`, `route_reading` | `S_ref(n)` |
| mobility | `hip_mobility`, `shoulder_mobility` | `50` (natural 50, ceiling 70) |
| skin | `skin_durability` | `50` |
| mental | `composure`, `focus`, `confidence`, `commitment`, `risk_judgement`, `resilience` | `50` → `T = 0.90 DI`, IZOF band `20–60`, hesitation `0.971`, Auto-commit `p_apex = 0.25 + 0.25 × (50 + S_ref)/200` |
| lifestyle, `rock_knowledge` | all | `25`, `0` |
| `rope_craft`, `gear_placement` | | `S_ref(n)` (P1b/P3 routes only) |
| Body | 170 cm, `ape_index 1.00`, `mass_kg = ref_mass`, `body_fat_pct = ref_fat`, all bands `0`, `skin normal/normal`, `sex 'm'`, `lock_depth_m 0.30` | every [02 §A.1](02-character-model.md#a1-sliders-and-modifiers) multiplier is exactly `1.0`; `R_hand(hang) = 0.692 m`, `R_foot(hang) = 0.645 m`; the lock-off lift of [05a §4.2](05a-wall-and-kinematics.md#42-anchors-body-centre-hips-and-shoulders) is pinned so reach does not change with DI |
| Traits | none | `M_trait = 1` |
| Resources at attempt start | `pump 0`, `power = 15 + S_ref` (the [02 §D](02-character-model.md#d-resources) pool), `aerobic_reserve = S_ref`, `fear` at band centre, `focus_meter 50`, `chalk 100`, `skin 100`, `energy 100` | |

```
S_ref(DI) = 8 + 2.0 × (DI − 8)         8 ≤ DI ≤ 12
          = 16 + 3.0 × (DI − 12)       12 < DI ≤ 16
          = 28 + 4.6 × (DI − 16)       16 < DI ≤ 29
          = 87.8 + 3.0 × (DI − 29)     29 < DI ≤ 33
```

The middle segment is a least-squares fit to the Lattice two-arm 20 mm benchmarks via the [02 §B](02-character-model.md#b-attributes) convention `finger_strength ≈ %BW − 100`; the bottom and top segments flatten because the benchmarks do not extend there and because attribute `0` must still mean "can climb a ladder" and `100` must be reachable.

### 1.2 The table

| DI | Boulder | Route | `S_ref` | `finger_strength` shown as 2-arm 20 mm %BW | Lattice anchor (A1) | Aerobic reserve (power pool is 15 more) |
|---:|---|---|---:|---:|---|---:|
| 8 | Font 3 / VB | 5a | 8.0 | 108 | | 8 |
| 9 | 4 / V0− | 5b | 10.0 | 110 | | 10 |
| 10 | 4+ / V0 | 5c | 12.0 | 112 | | 12 |
| 11 | 5 / V0+ | 6a | 14.0 | 114 | | 14 |
| 12 | 5+ / V1 | 6a+ | 16.0 | 116 | V1–V4 added load +19 kg | 16 |
| 13 | 6A / V2 | 6b | 19.0 | 119 | | 19 |
| 14 | 6A+ / V3 | 6b+ | 22.0 | 122 | | 22 |
| 15 | 6B / V3+ | 6c | 25.0 | 125 | | 25 |
| 16 | 6B+ / V4 | 6c+ | 28.0 | 128 | **V4 128 %** | 28 |
| 17 | 6C / V5 | 7a | 32.6 | 133 | | 33 |
| 18 | 6C+ / V5 | 7a+ | 37.2 | 137 | V5–V7 +24.2 kg | 37 |
| 19 | 7A / V6 | 7b | 41.8 | 142 | **V6 140 %** | 42 |
| 20 | 7A+ / V7 | 7b+ | 46.4 | 146 | | 46 |
| 21 | 7B / V8 | 7c | 51.0 | 151 | **V8 152 %** | 51 |
| 22 | 7B+ / V8+ | 7c+ | 55.6 | 156 | V8–V11 +38.4 kg | 56 |
| 23 | 7C / V9 | 8a | 60.2 | 160 | | 60 |
| 24 | 7C+ / V10 | 8a+ | 64.8 | 165 | **V10 164 %** | 65 |
| 25 | 8A / V11 | 8b | 69.4 | 169 | **V11 170 %** | 69 |
| 26 | 8A+ / V12 | 8b+ | 74.0 | 174 | V12 ≈ 176 % (extrapolated; one-arm 96 %) | 74 |
| 27 | 8B / V13 | 8c | 78.6 | 179 | one-arm 101 % | 79 |
| 28 | 8B+ / V14 | 8c+ | 83.2 | 183 | V12+ +52.9 kg | 83 |
| 29 | 8C / V15 | 9a | 87.8 | 188 | **V15 ≈ 190 %** (one-arm 110 %) | 88 |
| 30 | 8C+ / V16 | 9a+ | 90.8 | 191 | | 91 |
| 31 | 9A / V17 | 9b | 93.8 | 194 | one-arm 118 % | 94 |
| 32 | 9A+ / V18 | 9b+ | 96.8 | 197 | | 97 |
| 33 | — | 9c | 99.8 | 200 | | 100 |

Fractional DI interpolates linearly within a segment. The table spans the full atlas range of [08](08-grades.md) (DI 4–7 is approach terrain and uses `S_ref = 8 + 2 × (DI − 8)` extended downward, floored at `1`).

### 1.3 One table for both sexes

One table suffices for grading. Attributes are relative to the climber's own body ([02 §A.1](02-character-model.md#a1-sliders-and-modifiers), `sex` row: "sex sets no attribute caps"), the Body layer carries sex only through body-fat bands and `ref_mass`, and the Reference Climber's Body is chosen so that every Body multiplier is `1.0`. A route therefore has one DI regardless of who climbs it. Where sex enters is **display**: the character sheet converts `finger_strength` to a real-world benchmark, and Lattice reports that women's %BW at a given grade differ (A1) without publishing a simple female table. Until one is sourced the sheet uses the male conversion with a footnote (Open questions).

---

## 2. Grading algorithm

### 2.1 Expected-value mode

Grading runs 05b with three substitutions: no dice (each outcome contributes its probability), dynos by their Auto-commit expectation (05b §8.4, as in play: [24](24-simulation-game.md)), and the climber's state propagated as expected values. The attempt is **redpoint-style and calm**: `fam = 0` (so familiarity is a real bonus for players), hidden holds known, fear held at the band centre, conditions at the 05a reference (`F_ref = Hold.friction × 1.17`).

```
grade(route):
  P = []
  for DI_trial in 8.00, 8.25, …, 33.00:
    ref   = reference_climber(DI_trial)                            §1
    state = fresh_state(ref)                                        pump 0, power S_ref, reserve S_ref, focus_meter 50
    p_send = 1
    for step in route.beta_line:                                    hand/foot moves, rests, clips in order
      if step is rest:  state.pump += Δpump_k (05b §6, EV); state.reserve −= 1; continue
      if step is clip:  state.pump += clip cost; continue
      classes = legal_classes(ref, state, step)                     05b §2 with the reference reach
      if none: return UNGRADEABLE                                   the reference body cannot do it at any DI → generator rejects
      class  = step.class if legal else first legal
      margin = EffectiveStat(ref, state, step, class) − MoveDifficulty(step, class, r_ref)      05b §4
      if dynamic(class): margin += 0.4 × p_apex(ref) − 0.10;  pump_scale = 1 − 0.2 × p_apex(ref)
      (pc, ps, psl) = probs(margin, T = 0.90)                        05b §4.4
      P_rec  = recovery(class, state, ref)                          05b §4.5
      retry  = probs(margin at pump + 1.5 × cost, T)                one retry after a recovered slip
      p_move = pc + ps + psl × P_rec × (retry.pc + retry.ps)
      p_send *= p_move
      state.pump  += cost × pump_scale × (pc + 1.5 × ps + 1.5 × psl) + psl × P_rec × 1.25 × cost_retry
      state.power -= power_cost(class, margin);  state.reserve −= time(step)/10
      if state.pump ≥ 100: p_send = 0; break
    P.append((DI_trial, p_send))
  find the first pair (a, b) with P[a] < X ≤ P[b];  DI = a + (X − P[a]) / (P[b] − P[a]) × 0.25
  X = 0.35
```

`X = 0.35` **(tune)**: one send in about three attempts is what climbers report at their redpoint limit, and it places the grade where the per-move margins sit inside the roll band rather than at either auto edge. Boulders and routes use the same `X`; routes differ only in that pump accumulation, rests and clips are part of the walk, which is exactly what makes a 7b+ endurance pitch grade higher than its hardest move. If `P(33) < X` the route is `UNGRADEABLE` (discarded by the generator; rejected by the validator for signature routes); if `P(8) ≥ X` the route grades `8.0`.

### 2.2 Why the result is sharp

For the Font problem in [05b §14.1](05b-move-resolution-and-attempt-loop.md#141-example-1--two-builds-on-one-font-6b-slopercompression-problem):

| `DI_trial` | 15.0 | 15.5 | 16.0 | 16.5 | 17.0 | 18.0 |
|---|---|---|---|---|---|---|
| `P_send` | 0.000 | 0.147 | 0.409 | 0.660 | 0.869 | 1.000 |

Crossing: `15.5 + (0.35 − 0.147)/(0.409 − 0.147) × 0.5 = 15.89` → **6B+**. The Hueco roof of §14.2 gives `0.161` at 15.5 and `0.428` at 16.0 → `15.85`. The curve rises from near 0 to near 1 across about two DI because every move's margin shifts by roughly one DI per DI of reference level and the roll band is `±0.9`; grades are therefore well defined, and the display rounding of [08 §1](08-grades.md#display-rules) (nearest 0.5, slash grades in 0.25–0.75) is honest about the residual.

### 2.3 Components surfaced

The engine stores, and the route card shows, the pieces behind the number (all evaluated at `DI_graded`):

| Component | Definition | Display |
|---|---|---|
| Hardest move | `max MoveDifficulty` on the line, as a grade | "hardest move 6C" — the British technical grade in 08 |
| Crux density | count of moves with reference `margin < 0.5 T` | "1 hard move" / "3 hard moves" / "sustained" (≥ 5) |
| Pump accumulation | `max` expected pump on the line | "powerful" (< 30), "pumpy" (30–60), "enduro" (> 60) |
| Rests | stances with `Δpump_1 ≤ −3` | "2 good rests", "no rests" |
| Dynamic share | windows / hand moves | "dynamic" if > 10 % |
| Style tags | dominant hold family and move classes → `Route.style_tags` | icons |

---

## 3. Danger axis

`Route.danger` is computed from fall consequence κ ([05b §11](05b-move-resolution-and-attempt-loop.md#11-falls)) evaluated at every move of the line with the protection state a careful climber would have (every bolt below clipped, every gear opportunity placed at `Protection.quality`):

```
κ_max = max over moves of κ(fall from this state)
danger = safe   if κ_max < 0.15
         spicy  if 0.15 ≤ κ_max < 0.40
         bold   if 0.40 ≤ κ_max < 0.75
         deadly if κ_max ≥ 0.75, or ground contact is possible from above 6 m, or `water.quality < 0.3` with swell, or alpine objective hazard ≥ 0.5
```

Examples (constants from [05b §11](05b-move-resolution-and-attempt-loop.md#11-falls), all **(tune)**): a sport route with bolts every 3 m and no ledges → worst fall `7.5 m` → `κ = 0.015 × 7.5 = 0.11` → **safe**; the same route with a 5 m runout → `0.17` → **spicy**; a ledge in the fall path → `+0.4` → **bold**. A 3 m Font problem over a `0.8` pad with a spotter → `0.03 × 2.5² × 0.52 × 0.85 = 0.083` → **safe**; a 6 m highball onto a `0.4` pad, no spotter → `0.03 × 5.5² × 0.76 = 0.69` → **bold**; the same over rocks (`landing 1.5`) → `1.0` → **deadly**. These match the examples in [08 §4](08-grades.md#4-danger-axis); British adjectival grades combine DI with this axis per 08.

---

## 4. Calibration tests

All run headless in the harness ([19](19-balance-and-simulation-testing.md)), in Auto-commit mode, before any content ships. Thresholds **(tune)**.

| # | Test | Procedure | Pass |
|---|---|---|---|
| C1 | Generator accuracy | For each `CragStyleProfile` and each integer target DI in its crag's `di_range`, generate 200 routes; grade | `|di_graded − di_target| ≤ 1.0` for ≥ 90 %; `≤ 0.5` for ≥ 60 % |
| C2 | Reference self-consistency | For 50 graded routes per DI step `n`, run 2,000 dice attempts with the Reference Climber at `n` | send rate within `35 % ± 5` per route; mean across routes within `± 2` |
| C3 | Monotonicity | `P_send(DI_trial)` for every graded route | non-decreasing; exactly one crossing of `X` |
| C4 | Determinism | Grade the same route twice from the same seed, on two platforms | bitwise-identical `di_graded` |
| C5 | Geometric stability | Jitter every hold by `N(0, 0.02 m)` across the rock (`x`) and along it (`s`), regrade. Not in height: 2 cm of height is about 6 cm of rock on a 160° roof, and more as it flattens | `|ΔDI| ≤ 0.5` for ≥ 95 % |
| C6 | Style neutrality | Mean `di_graded − di_target` per dominant hold family | families within `±0.3` of each other (no systematic sandbag of one hold type) |
| C7 | Signature routes | Every `signature: true` route | engine within `±1.0` of `di_target` ([schemas §9](schemas.md#9-validation-rules-enforced-by-the-content-validator-see-20) rule 6) |
| C8 | Skill share per move type | Retired with player input ([24](24-simulation-game.md) §6): every move is played by the climber's tactics, so there is no player skill to measure | — |
| C9 | Build divergence | The two builds of 05b §14.1 on 100 generated DI-16 Font problems | mean `|P_send(A) − P_send(B)| ≥ 0.3` — the P1a success criterion in numbers — and Spearman rank correlation of their `P_send` across the problems `≤ 0.5`, so the builds differ in which problems they find hard, not only in level (a stronger copy of one build scores about 0.9) |

---

## 5. Where the engine runs

- **Generator** ([06](06-procedural-routes.md)): after assembly, in the accept/adjust loop; cost is one EV walk per `DI_trial` step, about 100 walks of ≤ 40 moves — under 5 ms on a low-end phone, so it runs on device at route creation.
- **Validator** ([20](20-content-pipeline.md)): on every signature route (C7) and on every content change touching 05a/05b constants.
- **Character sheet** ([02 §C.3](02-character-model.md#c3-grade-estimates-display-on-the-character-sheet)): `DI_boulder_est` inverts §1 on the player's own vector by hold family — the family composite `S_cell` mapped through `di_equiv` and averaged with the crag's `hold_weights` — and shows the spread between families as the ± uncertainty.

---

## Open questions / proposed schema additions

1. **`Route.beta_line`** (proposed in [05b](05b-move-resolution-and-attempt-loop.md#open-questions--proposed-schema-additions)) is required input here; without it the engine would need a beam search over the move graph, which is slower and makes grades depend on the search policy. Decision: store the line.
2. **Female display benchmark.** The engine is sex-neutral; the character-sheet conversion `finger_strength → %BW` needs a female anchor set. Lattice states women differ but publishes no simple table (A1) — source one or label the display "male benchmark".
3. **`X = 0.35` for routes.** Long routes compound more moves, so for equal `X` the per-move margins sit higher than on boulders; C2 will show whether route grades feel soft relative to boulder grades and whether a separate `X_route` (e.g. `0.30`) is needed.
4. **Reference mobility fixed at 50.** Cells containing `hip_mobility`/`shoulder_mobility` give the reference a composite slightly below `S_ref` above DI 20 and above it below DI 20; C6 should confirm this does not sandbag `high_step`/`heel_hook`-heavy styles.
5. **EV truncation.** One slip retry and expected-value pump propagation are approximations; C2 measures the bias against dice. If it exceeds `0.2 DI`, propagate a small pump distribution (3 quantiles) instead.
6. The danger thresholds in §3 interact with the κ constants in 05b §11; both sets are **(tune)** and must be fitted together against the 08 §4 examples (gritstone E-grades, highballs over 6 m, S-grades).
