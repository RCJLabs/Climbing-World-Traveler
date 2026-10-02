# Training and Adaptation

Attributes move because of stimulus, on three clocks, toward a ceiling. This document lists the training activities as `TrainingActivity` rows, the gain formula, detraining, the load-to-injury link, lifestyle multipliers, burnout, what each `gym_tier` offers, and the two legitimate ways to get good.

Related: [schemas](schemas.md) (`TrainingActivity`, `AttributeState`) · [02 Character Model](02-character-model.md) · [07 Disciplines](07-disciplines.md) · [11 Time](11-time-career-aging.md) · [13 Injury](13-injury-and-health.md) · [14 Economy](14-economy-gear-logistics.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

Research anchors are in §9. Numbers marked **(tune)** are proposals for the harness ([19](19-balance-and-simulation-testing.md)).

---

## 1. Training activities

Stimulus is in raw units per session; `load` adds to `load_acute`; costs are per block. `requires` uses the schema enum; `'none'` means a rest day or bodyweight work anywhere.

| id | Name | Stimulus (attribute: units) | load | energy | skin | requires | tags |
|---|---|---|---|---|---|---|---|
| `max_hangs` | Max hangs (20 mm, 7–10 s, 5–6 sets) | `finger_strength` 10, `contact_strength` 2 | 9 | 30 | 3 | hangboard | finger, power, tendon |
| `repeaters` | Repeaters (7:3 × 6, 4–6 sets) | `finger_endurance` 9, `finger_strength` 3 | 8 | 35 | 3 | hangboard | finger, endurance |
| `campus` | Campus board ladders and bumps | `contact_strength` 9, `pull_power` 5, `dynamic_movement` 3 | 11 | 40 | 5 | campus | power, dynamic, tendon |
| `limit_boulders` | Limit bouldering (3–6 moves at max) | `finger_strength` 6, `core_tension` 5, `contact_strength` 4, `dynamic_movement` 3, `tech_*` of holds climbed 2 | 10 | 45 | 8 | board or gym or outdoors | power, boulder |
| `four_by_four` | 4×4s (four boulders four times) | `anaerobic_capacity` 9, `finger_endurance` 4, `pull_power` 2 | 9 | 50 | 7 | gym or board | power, endurance |
| `arc` | ARC (20–40 min continuous easy climbing) | `aerobic_capacity` 9, `finger_endurance` 3, `footwork` 2 | 4 | 30 | 4 | gym or outdoors | endurance, footwork |
| `weights` | Weighted pull-ups, deadlifts, overhead press | `pull_power` 7, `lockoff` 4, `core_tension` 3, `leg_power` 3 | 8 | 40 | 0 | weights | power |
| `antagonists` | Push-ups, external rotation, wrist extension | injury-risk reduction only (see 13 §6): shoulder ×0.85, elbow ×0.8 for 14 days | 3 | 15 | 0 | none | health, injury |
| `mobility` | Hip and shoulder mobility, 30–45 min | `hip_mobility` 5, `shoulder_mobility` 5 | 2 | 15 | 0 | none | flexibility, recovery |
| `cardio` | Run, bike, approach hikes, 45 min | `aerobic_capacity` 5; body-fat drift −0.1 pt | 3 | 25 | 0 | none | endurance, weight |
| `skill_drills` | Silent feet, hover hands, flagging drills, downclimbing | `footwork` 6, `body_position` 5, `route_reading` 2 | 3 | 25 | 2 | gym or outdoors | footwork, learning |
| `project_day` | Outdoor day on a route or problem ≥ personal best − 1 DI | `tech_*` by moves (02 §B.2 XP rule) at ×1.5, `confidence` 1 on progress, `route_reading` 2 | 8 | 50 | 10 | outdoors | redpoint, learning |
| `volume_day` | Outdoor mileage, 8–20 routes/problems 2–4 DI below best | `tech_*` by moves at ×1.0 with high novelty, `footwork` 3, `aerobic_capacity` 3, `route_reading` 3 | 7 | 50 | 9 | outdoors | endurance, onsight, learning |
| `rest` | Full rest day | none; recovery as 11 §1 | 0 | −(regen) | heals | none | recovery |
| `deload` | Deload week flag (all loads ×0.5 for 7 days) | none; preserves adaptation | — | — | — | none | recovery |
| `fall_practice` | Progressive lead or highball falls, 8–12 falls | `composure` 3, `commitment` 2; evolves Afraid of Falling ([03](03-traits.md)) | 3 | 25 | 2 | gym or outdoors | fear, learning |
| `rehab_fingers` | Tendon-glide, light open-hand hangs | `finger_strength` 1; advances `rehab_progress` | 2 | 15 | 0 | hangboard or none | injury, recovery |
| `rehab_shoulder` | Cuff and scapular rehab | `lockoff` 1; `rehab_progress` | 2 | 15 | 0 | weights or none | injury, recovery |
| `rehab_elbow` | Eccentric wrist curls, flexbar | `rehab_progress` | 2 | 10 | 0 | none | injury, recovery |
| `rehab_lower` | Ankle/knee balance and strength | `leg_power` 1; `rehab_progress` | 2 | 15 | 0 | none | injury, recovery |

A `climb` block at a crag ([11 §1](11-time-career-aging.md)) is automatically classified as `project_day` or `volume_day` by the DI of what was attempted relative to the climber's estimate, and adds its moves to the XP rule directly.

---

## 2. The three clocks

Every attribute belongs to one clock. Stimulus is converted to gain at a rate that follows the clock; the clock also decides how long gains last.

| Clock | Attributes | Time to notice | Mechanism | Research |
|---|---|---|---|---|
| **Neural** (weeks) | `contact_strength`, `dynamic_movement`, `lockoff` (first half), all `tech_*`, mental attributes | 2–4 weeks | Recruitment, coordination, confidence | Early strength gains are neural; 5–10% in 8–12 weeks is the neural+muscle figure |
| **Muscle** (months) | `pull_power`, `core_tension`, `leg_power`, `finger_endurance`, `aerobic_capacity`, `anaerobic_capacity`, `lockoff` (second half) | 8–12 weeks | Hypertrophy and metabolic | 5–10% in 8–12 weeks |
| **Tendon** (years) | `finger_strength` (beyond the neural share), `skin_durability`, and the hidden tendon-capacity term that gates finger load | stiffness ~2 months; remodelling 3–6 months; full 18–24 months | Collagen remodelling | A2/A4 pulleys 63%/68% thicker in experienced climbers and still thickening after 10 years |

**Finger strength is split**: 40% of its stimulus is neural (fast), 60% tendon (slow) **(tune)**. This produces the real pattern: a beginner gains finger strength quickly for a few months, then the slow clock takes over, and chasing it faster than the tendon clock raises pulley risk (§5).

**Tendon clock half-time** from 02 §E: `t½ = 90 days × (1 + max(0, age − 25)/20) × (1.2 − 0.4 × tendon_robustness/100)`. At 25 with average robustness, `t½ = 90` days; 50% of a tendon-clock gain is realised in 3 months, 75% in 6, 94% in a year, ~99% at 18–24 months, which matches the remodelling timeline. At 40 the same gain takes 1.75× longer.

Pending tendon gains sit in a per-attribute `pending` pool and drain into `value` at `1 − 2^(−1/t½)` per day.

---

## 3. Gain formula

Per session, for each attribute `a` with stimulus `s_a`:

```
gain_a = s_a × k_clock × rate_mult_a × lifestyle_mult × stoke_mult × diminish_a

k_clock       = 0.09 neural · 0.045 muscle · 0.03 tendon          (tune)
rate_mult_a   = age adaptation multiplier (02 §E) × trait adapt_rate_mult × fibre_bias term (02 §A.1)
lifestyle_mult = sleep_mult × nutrition_mult                       (§6)
stoke_mult    = 0.5 if stoke < 20 · 1.0 otherwise · 1.1 if stoke > 80
diminish_a    = (1 − value_a / ceiling_a)^1.5
```

`diminish` is the ceiling approach: at 50% of ceiling a session delivers 35% of its nominal gain, at 80% it delivers 9%, at 95% it delivers 1%. With `max_hangs` (stimulus 10) three times a week, a climber at `finger_strength` 30 with ceiling 80 gains about 0.17/session on the neural share, so roughly +2 in the first month and +5 over 12 weeks on neural alone, with the tendon share arriving later: this reproduces the "5–10% in 8–12 weeks" window for an intermediate.

Technique uses the per-move XP rule in 02 §B.2 instead of session stimulus; `skill_drills` and outdoor days feed it. Mental attributes gain from events and from `fall_practice`.

---

## 4. Detraining

Each attribute has a maintenance window after its last meaningful stimulus (`s_a ≥ 3` in a session), then decays toward a floor of `0.6 × ceiling` (you never return to zero).

| Family | Maintenance window | Decay after window | Research |
|---|---|---|---|
| max strength (`finger_strength`, `pull_power`, `lockoff`, `contact_strength`, `core_tension`, `leg_power`) | 4 weeks | −1.0 / week | Max strength holds ~4 weeks; one study found no grip loss over an 8-week deload |
| endurance (`finger_endurance`, `aerobic_capacity`, `anaerobic_capacity`) | 2 weeks | −1.5 / week (endurance fades in 2–4 weeks) | climbstrong detraining summary |
| mobility | 3 weeks | −0.3 / week | — |
| technique | 8 weeks | −0.2 / week | Skills persist |
| tendon capacity (hidden) | 12 weeks | −0.3 / week | Slow both ways |

Age multiplies decay: ×1.0 to 35, linearly to **×2.0 at 50** **(tune)**, as the detraining literature reports roughly double the loss rate in 50-year-olds. Injury-forced layoffs use the same table, which is why a 3-month pulley rehab costs about 8 points of finger strength at 25 and 14 at 50 before rebuilding.

---

## 5. Load, the acute:chronic ratio and injury probability

`load_acute` is the 7-day sum of `load` from blocks (climbing blocks add `load = 6 + 0.3 × attempts × DI_rel` where `DI_rel` is attempt DI minus personal-best DI + 2, clipped at 0.5–3). `load_chronic` is the 28-day rolling mean of weekly load. `ACWR = load_acute / load_chronic` (undefined in the first 4 weeks; treated as 1.0 with a +20% novice risk).

| ACWR | Weekly connective-tissue injury probability multiplier `m_acwr` | Label shown |
|---|---|---|
| < 0.8 | 1.1 (detraining, then returning cold) | "undertrained" |
| 0.8–1.3 | 1.0 | "sweet spot" |
| 1.3–1.5 | 1.6 | "pushing" |
| 1.5–2.0 | 2.8 | "spiking" |
| > 2.0 | 5.0 | "danger" |

The curve is the sports-science ACWR shape (a U with a steep right arm) adapted as a multiplier **(tune)**. It multiplies the per-week `load` trigger probabilities in [13 §5](13-injury-and-health.md). Finger-specific load is tracked separately as `finger_load` (hangboard, campus, limit boulders, crimpy climbing) so that a cardio spike does not inflate pulley risk. Two further multipliers: full-crimp-heavy sessions at age 16–17 ×2.5 (growth plates; 02 §A.1), and `energy < 25` at session start ×1.4.

---

## 6. Sleep and nutrition multipliers

```
sleep_mult     = 0.75 + 0.5 × sleep_hygiene/100 × lodging_factor        (0.75–1.25)
nutrition_mult = 0.80 + 0.4 × nutrition/100 × food_factor               (0.80–1.20)
```

`lodging_factor` and `food_factor` come from [14 §3](14-economy-gear-logistics.md) (camping below 5 °C ×0.92; cheap food ×0.9; eat well ×1.1). The product multiplies training gain (§3), overnight `energy` and `skin` regeneration (02 §D) and injury recovery ([13](13-injury-and-health.md)). Jet lag after a `fly` edge of ≥ 5 time zones sets `sleep_mult × 0.85` for `3 − 0.02 × sleep_hygiene` days.

---

## 7. Burnout

`burnout` (0–100, seasonal) accrues daily:

```
Δburnout = 0.15 × monotony + 0.10 × failure_streak + 0.05 × max(0, ACWR − 1.3) × 10 − 0.6 × rest_day − 0.4 × novelty
  monotony       = weeks in a row with the same block mix and location (0..8)
  failure_streak = consecutive sessions without a send or a training PR (0..10)
  novelty        = 1 on the first week at a new crag, first new partner, first comp
  all × (1 − resilience/200)
```

Above 50 `stoke` regen halves; above 80 the forced break and quit chain in [11 §4](11-time-career-aging.md). A deload week removes 10; a new country removes 15 **(tune)**.

---

## 8. Facilities by `gym_tier`

| `gym_tier` | What exists | Activities available | Typical atlas entries |
|---|---|---|---|
| 0 | Nothing; a tree branch and a portable hangboard if owned | `rest`, `mobility`, `cardio`, `antagonists`, `fall_practice` (outdoors), `max_hangs`/`repeaters` only with owned hangboard ($60) | Indian Creek, Wadi Rum, Cochamó, Trango, Baffin, Hampi |
| 1 | Small wall or climber-run shed, a hangboard, mats | + `limit_boulders` (small), `arc` (short), `skill_drills` | Kalymnos, Rodellar, Céüse, Siurana, Ten Sleep, Rjukan |
| 2 | Commercial gym: bouldering, routes, campus, weights | + `campus`, `four_by_four`, `weights`, full `arc` | Fontainebleau (via Paris region), Bishop, Red Rocks (Las Vegas), Squamish, Chamonix, Canmore |
| 3 | Training centre: board, campus, weights, coaching, physio on site | all; `rehab_*` at ×1.2; coaching event chain | Innsbruck, Salt Lake City, Paris, Sheffield (Peak District), Barcelona region |

Monthly and day-pass prices are in [14 §4](14-economy-gear-logistics.md). A gym week also provides a climate-proof fallback when the crag is wet.

---

## 9. Two valid strategies: projecting vs volume

The real-world debate (intensity-specific training and limit projecting on one side; volume, pyramids and mileage on the other) is encoded as two block mixes that both work and trade off differently. Both camps agree on periodisation and outdoor mileage for skill, which the model also rewards.

| | **Projecting** (`project_day` + `max_hangs`/`limit_boulders`, 60% of climbing blocks at PB − 1 or harder) | **Volume** (`volume_day` + `arc`/`four_by_four`, 70% of climbing blocks at PB − 2..−4) |
|---|---|---|
| Finger strength and power gain | ×1.0 (full stimulus) | ×0.5 |
| Technique XP | ×0.8 (few moves, low novelty, many failures at 0.5 outcome factor) | ×1.6 (many moves, high novelty, mostly clean) |
| Endurance gain | ×0.4 | ×1.2 |
| `route_reading`, onsight gap | +0.5 DI gap (worse) | −0.7 DI gap (better) |
| Weekly `finger_load` for the same block count | ×1.5 → ACWR spikes likelier | ×0.8 |
| Connective-tissue injury probability | ×1.4 | ×0.9 |
| `burnout` failure_streak accrual | high (long sieges) | low |
| `confidence` | +3 per send, big swings | +0.5 per send, steady |
| Hardest redpoint after 2 sim years (harness target) | higher by ~1 DI | — |
| Hardest onsight after 2 sim years | — | higher by ~1 DI; wider pyramid, more ticks |

A Projector trait and an Onsight Purist trait ([03](03-traits.md)) tilt these multipliers by 10–15% each way; neither strategy is dominant in the harness, and the mixed schedule (alternating 3-week blocks) is the periodised middle that the research recommends.

---

## 10. Research grounding

- Neural and muscular gains of 5–10% in 8–12 weeks; tendon stiffness changes in ~2 months, remodelling 3–6 months, full adaptation 18–24 months; A2/A4 pulleys 63%/68% thicker in experienced climbers and still thickening after a decade (zodiac-holds finger-strength timelines; WEM 2021 10.1016/j.wem.2021.07.008; climbstrong tendon primer; Schöffl pulley work).
- Detraining: max strength holds ~4 weeks; an 8-week deload showed no grip loss; endurance fades in 2–4 weeks; loss roughly twice as fast at 50 (climbstrong detraining summary).
- Experience: elite climbers average 13.7 years and 4.4 sessions/week vs intermediate 5.0 years and 2.4; median time to 7a ~1.5 years (m) / ~3 years (f) in one dataset and ~4.5 years in another; first 8a at ~8–9 years (Climbstat). The gain formula is tuned so a harness climber with 4 sessions/week reaches DI 17 in 1.5–4 years depending on build.
- Growth plates: epiphyseal injuries at mean age 14 (10–18), 98% PIP, 64% full crimp (PMC13358427), hence the 16–17 multiplier.
- Training debate sources: Lattice, Hooper's Beta (intensity-specific) vs Touchstone/Bechtel (volume, pyramids).

---

## Open questions / proposed schema additions

### Open questions

1. Whether `finger_load` should be a schema field on `AttributeState` (per-attribute acute/chronic already exists) or a derived sum; proposed derived.
2. The 40/60 neural/tendon split of finger-strength stimulus is the single most important tuning number for early-career feel.
3. Whether gym `tech_*` XP at ×0.7 ([07 §9](07-disciplines.md)) makes the comp-kid background too slow outdoors.

### Proposed schema additions

- `AttributeState.pending: number` for tendon-clock gains awaiting realisation.
- `Climber.burnout_inputs: { monotony: number; failure_streak: number }` as derived state kept in the snapshot.
- `TrainingActivity.requires` lacks `'rehab'` and `'coach'`; coaching could be an event-driven multiplier instead, so no enum change is strictly needed.
