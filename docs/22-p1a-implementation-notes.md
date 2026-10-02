# P1a Implementation Notes

What the Fontainebleau slice actually implements where it departs from, or fills a gap in, the design set. Each row names the doc it amends. When a later phase revisits a topic, update the owning doc and delete the row here.

Related: [01 §4 P1a](01-pillars-scope-roadmap.md) · [schemas §8](schemas.md#8-save-game-and-run) · [19](19-balance-and-simulation-testing.md)

Numbers marked **(tune)** are harness-adjustable, as everywhere else.

---

## 1. Engine and geometry

| Topic | Implemented | Amends |
|---|---|---|
| Reference body mass | `ref_mass = (m 21.5, f 20.0) × h²` kg, so a 170 cm reference male weighs 62.1 kg (the 02 open question's correction) | [02 §A](02-character-model.md) |
| Default values and ceilings | starting values physical 20 · technique 10 · mental 35 · lifestyle 25; default ceilings 70 · 90 · 85 · 90 before Body, traits and age | [02 §F](02-character-model.md) |
| Reference chalk | the grade engine's chalk term is a constant `1.20` (hand chalk ≈ 93) | [05a §2.3](05a-wall-and-kinematics.md), [05c](05c-grade-engine.md) |
| Free-limb reach | reach is measured from body points computed with the moving limb released, so a hand can travel past where it hangs | [05a §5](05a-wall-and-kinematics.md) |
| High step | a foot move is a `high_step` when the target is at least `hip.s + 0.05 m` | [05b §2](05b-move-resolution-and-attempt-loop.md) |
| Orientation term `O` | `0` for cracks, feet, arête and hueco features, slopers and pinches | [05b §4.1](05b-move-resolution-and-attempt-loop.md) |
| Commit-window sweep | clamp `450–1200 ms` instead of `600–900`, so the slower and faster sweep settings both have room | [05b §8.2](05b-move-resolution-and-attempt-loop.md) |
| Commit-window trigger | `deadpoint` and `dyno` only. `bump` never opens a window in P1a, matching the grade engine, which applies the Auto-commit expectation to those two classes only | [05b §8.1](05b-move-resolution-and-attempt-loop.md) |
| Auto-commit in play | the `0.10` tax is applied to the actual roll (`apex`: margin `+0.3`; `caught`: `−0.1`), so play matches the expectation the grade engine uses | [05b §8.4](05b-move-resolution-and-attempt-loop.md) |
| Fear decay | composure decay pulls event fear toward the IZOF centre and never below it; low fear comes only from a low baseline (high confidence) | [05b §9](05b-move-resolution-and-attempt-loop.md) |
| Hidden holds | revealed when touched, on the beta line in `flash`, by a seeded per-hold roll `< route_reading/100 × 0.6` once in reach, or all at once in reach during a `rest` (you look around while shaking) | [05b §13](05b-move-resolution-and-attempt-loop.md) |
| Flash | P1a has no partners to give beta, so `flash` is offered on signature problems only (others are always on them); every signature attempt starts at `fam_beta = 0.15` | [05b §12](05b-move-resolution-and-attempt-loop.md) |
| Falls | boulder `κ` is computed and recorded; no injury roll until P2 | [05b §11](05b-move-resolution-and-attempt-loop.md), [13](13-injury-and-health.md) |

## 2. Grades, routes and the estimate

| Topic | Implemented | Amends |
|---|---|---|
| Grade estimate `E` | not an attribute-table inversion but its behavioural equivalent: the climber's expected-value walk over a fixed benchmark set (one problem per Font style profile at DI 8, 10, …, 30, shipped as `data/routes/fontainebleau_benchmarks.json`) and the DI where mean `P_send` crosses `X = 0.35`. The Reference Climber at DI `n` estimates within `±0.6` of `n`. Reach, feet and weak hold families all count | [02 §C.3](02-character-model.md) |
| Session slots | eight procedural slots in the 06 §5 bands around `E`, the sector's signature problems, and known problems (tried in the last 30 days, or three or more attempts and unsent within 365 days). The slot index is hashed with the run seed, so two runs on the same day see different problems | [06 §5](06-procedural-routes.md) |
| Signature list | the three P1a problems follow 09 (La Marie-Rose, Le Toit du Cul de Chien, Rainbow Rocket) | [06](06-procedural-routes.md), [09](09-world-atlas.md) |
| Font DI range | `[6, 30]`, so the yellow circuits (DI 6–8) sit inside it | [09](09-world-atlas.md) |
| Generator retries | up to 12 re-seeded attempts per problem before failing | [06 §2](06-procedural-routes.md) |
| Line shape | the tracer's constants live in `TRACE` (`src/sim/routes.ts`): static moves use 88–100% of reach (deadpoint 100–110%, dyno 118–135%); standing starts with hands at 1.25–1.7 m; feet step when they trail the hands by 1.15 × body scale (second foot 1.45, forced 0.75) and land in the top quarter of their reachable band; a hand move gaining under 0.22 m steps the lowest foot up first; a line with fewer than 3 hand moves is retried with a new seed. With the lock-off body model ([05a §4.2](05a-wall-and-kinematics.md#42-anchors-body-centre-hips-and-shoulders)) the feet can trail further without costing reach, so problems run a median of 5 hand and 4 foot moves (9 and 11 before the line-shape change, 6 and 8 before lock-off) **(tune)** | [06 §2.3](06-procedural-routes.md) |
| `Route.start` | a `Record<Limb, string>` of start holds | [schemas §5](schemas.md) |

## 3. Days, resources and career

| Topic | Implemented | Amends |
|---|---|---|
| Day structure | `block_start` / `block_end` / `end_day` actions instead of one `day_plan`; climbing is the only multi-action block. A second block needs `energy ≥ 50`: at the default lifestyle the energy cap is about 79, so 11 §1's 55 made a double work day impossible **(tune)** | [11 §1](11-time-career-aging.md), [schemas §8](schemas.md) |
| Energy | overnight to `100 × sleep_mult × nutrition_mult` (health halves it below 50), clamped 20–100; a climbing block costs `10` for approach and warm-up plus `1.5 + 0.1 × moves` per attempt; rest block `+15` energy and `+5` skin | [11 §1](11-time-career-aging.md), [05b §12.3](05b-move-resolution-and-attempt-loop.md) |
| Stoke | starts at 70; `+5` for a first send at or above personal best, `+1` for other first sends; `−2` for a session without a send; `−1` per odd job; `−1` per day with money under $300; `−1` on a day the forest is shut and you did not climb; rest days `+0.1 × resilience` (halved when burnout > 50); drifts 3% a day toward 60 **(tune)** | [02 §D](02-character-model.md) |
| Burnout | the 12 §7 formula with P1a meanings: monotony counts weeks that visited no sector outside the previous week's set, novelty is a first visit to a sector this week; a season is 91 days | [12 §7](12-training-and-adaptation.md) |
| Burnout end | `burnout ≥ 80` forces a 14-day break from climbing and training; a second hit in the same season with `stoke < 20` ends the run as `burnout` directly (no event system in P1a) | [11 §4](11-time-career-aging.md) |
| Retirement | *Retire* is available from day 1 in P1a so a 20-minute session can finish a run | [11 §4](11-time-career-aging.md) |
| Money | fixed living cost `$35 × difficulty × trait cost_mult` per day, plus an **odd-jobs stub**: a `work` block pays $50 (cost tier 3), costs 25 energy and 1 stoke. Without it a Dirtbag start goes bankrupt in about six weeks | [14 §1–§2](14-economy-gear-logistics.md) |
| Bankruptcy | 30 days below zero (story 60, hard 20); debt grows 1% a week | [14 §9](14-economy-gear-logistics.md) |
| Training | `train` blocks offer max hangs, repeaters, campus, limit bouldering, 4×4s, ARC, weights, skill drills and fall practice ($20 gym day pass, Paris gyms) plus free mobility and cardio | [12 §1, §8](12-training-and-adaptation.md) |
| Climbing stimulus | each hand move banks its matrix cell's physical weights × `clamp(1 − margin / 2T, 0, 1.5)`; at block end each attribute receives `min(10, 0.25 × total)` through the 12 §3 gain formula, finger endurance gets `min(8, pump spent / 25)`, and the session counts as a `project_day` (mean attempted DI ≥ E − 1: route reading +2, technique XP ×1.5) or a `volume_day` (footwork, aerobic and route reading +3) | [12 §1, §3](12-training-and-adaptation.md) |
| Technique XP | the 02 §B.2 rule per move with `base_gain = 0.015` (not 0.06: at 0.06 a full-time bot year went from Font 6A to 7C), split across the technique attributes of the move's matrix cell, banked during the session and applied at block end **(tune)** | [02 §B.2](02-character-model.md) |
| Mental nudges | a successful dynamic move `commitment +0.02`; a clean move made while over the fear band `composure +0.03`; a fall at 80% or more of the problem `confidence −0.5` (not −2: projecting drained confidence to zero within a season); a first send at or above personal best `confidence +1` **(tune)** | [02 §B.3](02-character-model.md) |
| Rock knowledge | `+1 × (1 − rk/100)` per climbing session on that rock | [02 §B.4](02-character-model.md) |
| Weather | the 10 §1 Markov chain, plus a seeded daily friction scalar `N(0, 0.02)` clipped to ±5% | [10 §1–§2](10-weather-and-conditions.md) |
| Conditions | session temperature is early afternoon (`t_min + 0.85 × (t_max − t_min)`) plus 3 °C in sun; the sending window (centre 12 °C, ±5) gives `temp_term = 1 − 0.015 × max(0, |t − centre| − 5)`; wind `+1%` per m/s to 6 | [02 §C.6](02-character-model.md), [10 §2](10-weather-and-conditions.md) |
| Font wet rule | a sector is shut on rain and storm days, when `rh > 90`, and until `dry_lag_days` have passed since rain (+1 in still humid air, +1 after more than 15 mm) | [10 §4](10-weather-and-conditions.md) |

## 4. Meta, saves and content

| Topic | Implemented | Amends |
|---|---|---|
| The P1a unlock | `p1a:second_background` grants **Farm Kid**, which starts at Fontainebleau until travel exists. Its forced trait `farm_strong` is P1a. `Background.unlock` names the meta unlock a background needs | [16 §4.1](16-meta-progression-and-runs.md), [04 §2.7](04-backgrounds.md) |
| Dirtbag trait | P1a: its living-cost multiplier is live through the money stub | [03](03-traits.md) |
| Score | `10 × hardest + 0.6 × √ticks + 3 + 0.02 × days`, × difficulty multiplier (one discipline, one country, no first ascents in P1a) | [16 §6](16-meta-progression-and-runs.md) |
| `RunSummary` | P1a fields: `hardest`, `hardest_onsight`, `hardest_flash` (boulder DI), `ticks`, `circuits`, `pyramid`, `got_away`, `seed`, `background` | [schemas §8](schemas.md) |
| `WorldState` | typed as `RunState` in `src/sim/state.ts` | [schemas open question](schemas.md) |
| Export | plain JSON (`.cwt.json`); gzip arrives with import UI polish | [18 §5](18-tech-architecture.md) |
| Content version | `DATA_VERSION` (`p1a-5` since the power base and blended wall angles; `p1a-4` was lock-off reach, `p1a-3` the lock-off body model, `p1a-2` the line-shape change) is stored on every run. P1a keeps no old generators, so a run saved under another version cannot be replayed: it stays listed, its Hall of Fame entry stays, and *Continue* is disabled with an explanation. Bump the version whenever the same seed would build a different problem or the same actions would play out differently | [18 §5](18-tech-architecture.md) |
| Quick-build | six presets: Slab Wizard, Compression Monster, Power Boulderer, Late Starter, Dirtbag, Farm Kid (locked until the unlock) | [17 §6](17-ui-ux.md) |

## 5. Measured status (harness)

`pnpm calibrate` (normal sweep, 1,080 generated problems):

| Test | Result | Threshold |
|---|---|---|
| C1 generator accuracy | 94.7% within ±1 DI, 87.9% within ±0.5, bias −0.21 (the slab profile 86%, bias −0.52) | ≥ 90%, ≥ 60% |
| C2 dice vs grade | Reference Climber sends its own grade 34.0% of the time through the real attempt loop | 35 ± 5 |
| C3 monotonicity, C4 determinism, C7 signatures | pass | — |
| C5 geometric stability | 85.5% within ±0.5 DI after 2 cm jitter on 200 problems (83.5% before the power base). The sweep's 40-problem sample reads 92.5%; at that size one problem is 2.5 points | ≥ 95% (open) |
| C6 style neutrality | crimp −0.44, pocket −0.70, jug +0.12; spread 0.82 (0.67 before lock-off) | ≤ 0.6 (open) |
| C8 timing | expert − novice 6.6 points; Auto-commit 33% vs average tapper 33% | ≤ 8; ±2 |
| C9 build divergence | mean `|P_send(A) − P_send(B)|` = 0.37 on DI-16 problems (0.62 with a fixed lock, 0.75 before lock-off); rank correlation of their `P_send` −0.03, against 0.87 for a build and a copy of it 3 points stronger | ≥ 0.30; ≤ 0.50 |
| 05b §14.1 builds | estimate Compression Monster 17.4 (`lockoff 30`), Crimp Machine 17.0 (`lockoff 42`); 17.4 and 15.5 before lock-off. The lock ties reach to the holding hand, so height counts for less, and the Crimp Machine's lock-off now buys back the reach it lacked. On 60 DI-17 problems one build sends and the other cannot on 31 (28 of them the Compression Monster) | — |
| Presets at creation | estimate Slab Wizard 10.6, Late Starter 11.2, Farm Kid 13.1, Dirtbag 13.1, Power Boulderer 13.4, Compression Monster 13.4. Most start at `lockoff 20`, 3 cm short of the reference lock, which costs the Slab Wizard 1.0 DI (1.3 before the power base): generated static moves sit at up to 100% of the reference reach, so its long moves become deadpoints, which it is weak at | — |
| Problem length (240 problems) | hand moves p10/p50/p90 3/5/7; foot moves median 4; all moves 9 median, 16 p90. Before lock-off 4/6/8, feet 8, all 14 and 21; before the line-shape change 5/9/13, feet 11, all about 20 and 38. Feet move about once per hand move (1.5 before) | 3–8 hand moves |

`pnpm harness --n 40 --days 365 --seed 7` (random P1a builds, half projecting and half volume, Auto-commit):

| Measure | Result |
|---|---|
| Estimate `E`, median | Font 6A (12.6) at start → 6A+ (13.7) at 3 months → 6B (14.8) at 6 → 6B+ (15.9) at 12; p90 at 12 months 17.2 |
| Personal best at 12 months | median 6C (16.7), p90 18.3 |
| Projecting vs volume | personal best 17.1 vs 16.8; hardest flash 14.4 vs 16.7; ticks 161 vs 892 (12 §9's intended split) |
| Run ends in a year | none: every career reaches the day limit. Money is tight: about 110 odd-job blocks a year, median $1,940 left |
| Burnout peak | median 1.2, p90 8.7 (the bot rests every fourth day and rotates sectors) |
| Cost | about 31,000 actions per one-year career (36,000 before lock-off, 42,000 before the line-shape change), 20 attempts per climbing day |
| Replay identity | identical on every checked career |

---

## Open questions

Tuning items, in priority order:

1. **C5 and the steep top of the reach term.** Of 33 problems that move more than 0.5 DI under 2 cm of jitter (200 sampled), the move that changes most is a reach change on the crux in 25. Eleven are reach alone; the rest add a class, posture or power change. Four become ungradeable when a move falls out of reach, one changes feature. The generator puts static moves at 88–100% of reach, where `Rch` rises about 14 DI per unit of `r`, so 2 cm (0.03–0.05 of reach) moves a crux 0.5–0.7 DI. The power base and blended angles took C5 from 83.5% to 85.5%. Tried and dropped:
   - *Easiest technique wins,* with dearer deadpoints (1.75) and dynos (4.0) so a deadpoint wins only in the last 5% of static reach: C5 unchanged; the Slab Wizard lost 3.4 DI for 3 cm of lock, because a climber who cannot reach statically is forced into the dearer deadpoint.
   - *Static over-reach* to 108% at a steep extra cost: the Slab Wizard's 3 cm cost fell to 0.9 DI, but C5 fell from 33 to 29 of the sweep's 40 problems.
   - *A flatter reach term* (weight 2, comfort from `r = 0.5`): C5 reached 93.5% with the power base, but the Slab Wizard's 3 cm cost rose to 1.7 DI and C1's bias reached −0.27.

   Being 2 cm short on a crux at full stretch is a real difference. The 95% target may be wrong for problems built at full reach; a target near 85%, or a jitter scaled to hold size, would match what the model says.
2. **Font favours the Compression Monster.** At DI 17, where both 05b builds sit, the Compression Monster sends 85 of 180 problems the Crimp Machine cannot, and the reverse happens on 7. This is not a lack of style divergence: the rank correlation of their send odds is −0.17, so they find different problems hard. It is Font: a third of hand holds are slopers, the Compression Monster leads by 0.48 in send probability on sloper-dominant problems, and the two are level (−0.02 at DI 16) on crimp-dominant ones. True to the forest; a crimpy crag in P2 should show the reverse. C9 now checks the correlation as well as the gap.
3. **C6 and the slab profile.** `font_sloper_slab` grades 0.52 DI soft (86% within ±1), pocket-dominant problems 0.70 soft and crimp-dominant 0.44.
4. **Progress rate** is +3.3 DI of estimate in a full-time first year (median; lock-off training now adds reach). Check it against the Climbstat anchors in 02 once careers run several years, and against a human playtest.
5. **Stoke** sits around 76 for anyone who sends regularly; burnout barely moves under a sensible schedule. Both need the events and partners of P2 to bite.
