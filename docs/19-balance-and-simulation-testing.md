# Balance and Simulation Testing

Trait costs, grade calibration and the weight of the commit window cannot be tuned by hand across 10¹⁵ builds. The headless harness runs thousands of careers through the same `src/sim` code the phone runs, and its report is the evidence behind every number marked **(tune)** in the other docs. The harness is a **P1a deliverable**: it ships with the Fontainebleau slice, not after it.

Related: [03 Traits](03-traits.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [05c Grade Engine](05c-grade-engine.md) · [16 Meta-progression](16-meta-progression-and-runs.md) · [18 Tech Architecture](18-tech-architecture.md) · [20 Content Pipeline](20-content-pipeline.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

---

## 1. Headless career simulator

`pnpm harness careers --n 10000 --years 10 --seed 7 --difficulty standard --timing average --out reports/<date>/` runs in Node over worker threads ([18 §7](18-tech-architecture.md)).

**Implemented in P1a** ([22 §5](22-p1a-implementation-notes.md)): `pnpm harness --n 40 --days 365 --seed 7 --policy project|volume|both --timing auto|novice|average|expert|oracle --workers 4 --out reports` (forked worker processes; writes `harness-<seed>.md` and `.json`), and `pnpm calibrate [--quick|--full] [--out reports]` for C1–C9. The bot policy is `src/sim/bot.ts`; the build sampler `src/harness/sampler.ts`.

**Build sampler.** For each career: background uniform over the live phase; `Body` sliders from population bands (height N(172, 9) m / N(162, 8) f, body fat within band, ape index N(1.02, 0.03), banded fields uniform); `age_start` 16–45 weighted toward 18–28; attribute allocation by a random Dirichlet split with the +25 cap; traits by rejection sampling of 0–12 traits that respect the budget and caps in [03](03-traits.md); hidden roll with probability 0.5; `auto_commit` per the `--timing` mode.

**Scripted policy.** A fixed, documented decision rule stands in for the player so results are comparable across runs: train on the weakest attribute family relative to the reference climber when `energy` and skin allow, climb on days with `season ≥ 2` and dry rock, pick routes at `estimated DI + 0.5` (projects) three days a week and `− 1.5` (volume) two, rest when `energy` < 40 or `skin` < 30, travel at season end to the cheapest open crag within the phase, work when `money` < 60 days of costs, retire at `burnout` > 85 for 60 days or age 55. Policies live in `src/harness/policies/` and are versioned; a second "reckless" policy exists to exercise injury and death paths.

**Report** (`report.md` plus `metrics.json`):

| Section | Content |
|---|---|
| Grade distributions | peak DI per discipline by career year; percentiles by background and age band; share reaching IRCRA advanced/elite ([08](08-grades.md)) |
| Injury rates | injuries per 1,000 climbing days by site and grade; career-ending rate; mean days lost; compared against [13](13-injury-and-health.md) anchors (upper-limb 77%, fingers 33–52%) |
| Run lengths | distribution of `RunSummary.days` and `end_reason` shares (target standard: retired 55%, forced_injury 15%, burnout 15%, bankrupt 10%, death ≤ 5% with death enabled **(tune)**) |
| Money curves | median and 10th/90th percentile `money` by career month; bankruptcy timing; income mix |
| Trait pick-rate vs outcome | per trait: pick-rate under the value-maximising builder (§4), mean Δ peak DI, Δ run length, Δ injuries, cost-efficiency |
| Timing | §3 |
| Calibration | §5 |

---

## 2. Harness modes

| Flag | Values | Effect |
|---|---|---|
| `--timing` | `novice` · `average` · `expert` · `auto` · `oracle` | Swing and Catch skill model (§3); `oracle` always catches at the dead point (upper bound) |
| `--difficulty` | story · standard · hard | `RunOptions.difficulty` bundle ([16 §2](16-meta-progression-and-runs.md)) |
| `--policy` | `default` · `reckless` · `sport_only` · … | scripted player |
| `--phase` | P1a … P5 | restricts content |
| `--fix-build <file>` | JSON `new_run` payload | same build across seeds, for A/B of a single trait |

---

## 3. Dyno input simulation

Dynos and deadpoints are played with Swing and Catch ([23 §3.3](23-move-types-and-art-direction.md)). A harness player pulls around the good launch and grabs around the dead point of their own flight (`SWING_SKILL` in `src/harness/sim.ts`) **(tune, calibrate on device logs from playtests)**:

| Model | Pull (relative sd) | Angle sd (°) | Grab lateness μ (ms) | Grab σ (ms) | Notes |
|---|---|---|---|---|---|
| novice | 0.12 | 8 | +45 | 80 | under- and over-pulls, late |
| average | 0.06 | 4 | +18 | 45 | |
| expert | 0.03 | 2 | +5 | 22 | |
| oracle | 0 | 0 | 0 | 0 | the good launch, grabbed at its dead point |
| auto | `null` | — | — | — | Auto-commit stat roll, EV between caught and apex minus the tax in 05b |

A dyno the climber is weak on (low margin) needs nearly a full pull and leaves less catch speed, so the same skill makes more slaps and cuts on it, as designed. (Until `p1a-12` this section modelled taps on the commit bar of 05b §8: novice N(35, 95) ms, average N(12, 55), expert N(4, 28).)

Every other move is dragged with Two-Thumb Grip ([23 §3.1](23-move-types-and-art-direction.md)). A harness player plays every non-dyno move by hand (auto-climb off, the game's default), taking a drag time whatever the move and landing at a half-normal distance from the hold's centre (`REACH_SKILL`; drag times from a Fitts's-law guess of about 0.65 s for an aimed 150 px thumb drag) **(tune on device logs)**:

| Model | Drag time μ (ms) | Drag time σ (ms) | Landing sd (share of the ring) | Mean placement Δ |
|---|---|---|---|---|
| novice | 1,100 | 400 | 0.5 | about −0.005 |
| average | 800 | 250 | 0.3 | about +0.009 |
| expert | 600 | 150 | 0.15 | about +0.019 |
| oracle | half the budget | 0 | 0 | +0.03 |
| auto | no `perf` | — | — | 0 |

Drag times are floored at 250 ms. Against the budget, the novice overruns on about 17% of hand moves (pump × (1 + overrun)) and almost never lets go.

Moves the stance test flags are leaned and then reached ([23 §3.2](23-move-types-and-art-direction.md)). A harness player leans until a distance inside the base's edge (or stays where they are, if the stance starts deeper), then reaches with a `REACH_SKILL` drag time while the body drifts out at the move's `v_d`; time past the drift's grace is time out of balance (`BALANCE_SKILL`) **(tune on device logs)**:

| Model | Lean inside the edge μ (m) | σ (m) | Out of balance |
|---|---|---|---|
| novice | 0.015 | 0.010 | `max(0, drag − lean / v_d)` |
| average | 0.030 | 0.012 | the same |
| expert | 0.045 | 0.012 | the same |
| oracle | — | — | 0 |
| auto | no `perf` | — | — |

On 10 slab problems near DI 16 with no dynamic moves the novice barn-doors on about 3% of attempts (`scripts/dev/probe-skill.ts`).

**Variance explained by timing.** Run the same 2,000 builds and seeds under novice, average, expert and auto. For every attempt on a route containing at least one dynamic move, record send/fail. Fit `send ~ build_margin + timing_model` (logistic) and compute the share of explained deviance attributable to `timing_model` (type-II). **Target: ≤ 10% of send variance explained by timing**, and expert vs novice send-rate gaps on routes at the climber's estimated grade within the per-type limits below **(tune)**. If exceeded, deepen the dead point, widen the slap margin or raise the catch speed in [23 §3.3](23-move-types-and-art-direction.md), or lengthen the grip budget or narrow the placement term in 23 §3.1, not the frequency of dynos. Auto-commit must land within ±2 points of the average model's send rate (the P1a check allows ±5 for sampling noise).

**Device logs.** The skill models above are guesses until fitted to real play. The *Playtest stats* screen (Climber → Playtest stats) replays the run's action log (`src/harness/playtest.ts`) and lists every move played by hand with what the engine judged it against: for Reach the drag time, landing and grip budget; for Balance the time out of the base, the drift speed and the starting stance; for dynos the pull against `p_need`, the angle error and the grab against the flight's own dead point. It shows medians and middle halves beside the novice, average and expert models and exports them (`cwt-playtest` JSON, with the settings, the device and the build). Fit `REACH_SKILL`, `BALANCE_SKILL` and `SWING_SKILL` from those exports, then rerun C8.

**Per move type (`pnpm calibrate`, C8).** Each type is measured alone, its skill varied and the others on Auto (`onlyType` in `src/harness/sim.ts`), on the problems where it matters, and then all three together:

| Row | Skill varied | Problems near DI 16 | Expert − novice limit (points) |
|---|---|---|---|
| dyno | Swing and Catch | dynamic (> 15% dynamic moves) | 7 |
| reach | Two-Thumb Grip | no dynos, not slab | 3 |
| balance | Lean | slab, no dynos | 3 |
| all | all three | dynamic | 8 |

The limits leave the dyno, a single high-stakes move, most of the total; Reach and Balance happen on many moves, each a little. Results are in [23 §3.4](23-move-types-and-art-direction.md) and [22 §5](22-p1a-implementation-notes.md).

---

## 4. Trait re-costing procedure

Run after every change to a formula, a trait or the Reference Climber table.

1. **Impact.** For each trait `t`, simulate 1,000 careers with a random build plus `t` and the same 1,000 without it (same seeds, `--fix-build` per pair). `impact_t = mean Δ career score` where score is the Hall of Fame formula ([16 §6](16-meta-progression-and-runs.md)) without the difficulty multiplier, normalised so one point equals the gain from +5 to a single mid-value physical attribute.
2. **Cost.** `cost_t = round(impact_t)` clamped to `[2, 10]` for positives and `[−10, −2]` for negatives; a positive trait with `impact < 1.5` or a negative with `impact > −1.5` is flagged *no-op* and either strengthened or removed (no ±1 traits).
3. **Pick-rate.** A value-maximising builder with a budget drawn from the background distribution selects traits greedily by `impact / cost`. Traits with pick-rate **> 60%** (under-priced or dominant) or **< 5%** (over-priced or unfun) are flagged.
4. **Caps check.** Confirm no two traits combine for an additive multiplier above +30% on any single hold type or move class, and that the negative-refund cap (≤ 12) cannot buy more than it should.
5. **Diff.** The report lists every trait whose cost changed; costs are only committed to `data/traits/*.json` through this procedure, with the report linked in the commit.

---

## 5. Grade calibration tests (Auto-commit)

Run in `--timing auto` so human timing never enters grading ([05c](05c-grade-engine.md)).

| Test | Method | Threshold |
|---|---|---|
| Generator accuracy | 1,000 procedural routes per style profile at targets across the profile's DI range; grade each | `|di_graded − di_target| ≤ 1.0` for ≥ 90%; mean bias within ±0.2 |
| Reference climber consistency | reference vector at DI *n* attempts a DI-*n* route 500 times | send rate within X% ± 5 (X per 05c: 35% onsight-style; boulder per-attempt) |
| Monotonicity | reference climbers at DI *n*−2 … *n*+2 on the same route | send rate strictly increasing |
| Style fairness | reference climber on each style profile at equal DI | send rate spread across profiles ≤ 8 points |
| Signature routes | each `signature: true` route graded | within ±1.0 of its `di_target` ([schemas §9.6](schemas.md)) |
| Build distinctness (P1a success criterion) | two preset builds on the same three Font problems | per-attempt send probability differs by ≥ 15 points on at least two of three |

---

## 6. Determinism and snapshot tests

- **Replay identity:** for 200 random careers, `hash(replay(log))` equals the live state hash at every snapshot boundary; also across Node and browser builds (Playwright runs the same log).
- **Stream isolation:** consuming extra draws from `events` changes no `move` or `weather` outcome.
- **Anti-scum:** reloading before a move and re-issuing the same action yields the same roll; a different hold yields a different move but the recorded tap offset still reproduces.
- **Golden snapshots:** committed JSON for 10 seeds × (3 routes, one 50-day career); any diff fails CI unless the commit message carries `balance:` and links a report.
- **Migration:** archived logs from each `SaveGame.version` replay to the expected summary.

---

## 7. CI gates

| Gate | Where | Fails when |
|---|---|---|
| Content validator | every PR | any rule in [schemas §9](schemas.md) or [20 §4](20-content-pipeline.md) |
| Unit and property tests | every PR | any failure |
| Determinism | every PR | any hash mismatch |
| Calibration (reduced: 200 routes per profile) | every PR | accuracy < 85% or bias > ±0.3 |
| Timing variance (reduced: 300 builds) | every PR | > 12% |
| Golden snapshots | every PR | diff without `balance:` tag |
| Bundle size | every PR | over budget ([18 §7](18-tech-architecture.md)) |
| Full harness (10k careers), calibration, re-costing report | nightly | thresholds in §3–§5; report posted as a workflow artifact |

---

## Open questions

- The skill models in §3 are placeholders until playtests produce real swing logs (pull, angle, grab time); the harness should import a CSV of observed swings as a fifth model.
- Whether the value-maximising builder should also model "fun" picks (random exploration with ε = 0.1) so flavour traits are not all flagged at < 5%.
- Score normalisation for re-costing assumes the Hall of Fame formula is stable; if it changes, all costs are recomputed in one commit.
