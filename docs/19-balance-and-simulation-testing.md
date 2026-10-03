# Balance and Simulation Testing

Trait costs, grade calibration and the weight of the commit window cannot be tuned by hand across 10¹⁵ builds. The headless harness runs thousands of careers through the same `src/sim` code the phone runs, and its report is the evidence behind every number marked **(tune)** in the other docs. The harness is a **P1a deliverable**: it ships with the Fontainebleau slice, not after it.

Related: [03 Traits](03-traits.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [05c Grade Engine](05c-grade-engine.md) · [16 Meta-progression](16-meta-progression-and-runs.md) · [18 Tech Architecture](18-tech-architecture.md) · [20 Content Pipeline](20-content-pipeline.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

---

## 1. Headless career simulator

`pnpm harness careers --n 10000 --years 10 --seed 7 --difficulty standard --out reports/<date>/` runs in Node over worker threads ([18 §7](18-tech-architecture.md)).

**Implemented in P1a** ([22 §5](22-p1a-implementation-notes.md)): `pnpm harness --n 40 --days 365 --seed 7 --policy project|volume|both --workers 4 --out reports` (forked worker processes; writes `harness-<seed>.md` and `.json`), and `pnpm calibrate [--quick|--full] [--out reports]` for C1–C9. P1b adds `--crag fontainebleau|kalymnos` (the default is Fontainebleau): careers are sampled from the backgrounds that start at that crag, the report reads route grades in French, and its files are named `harness-<crag>-<seed>`; the sport checks C1–C4 on routes and C10 run in `pnpm calibrate` ([26](26-p1b-implementation-notes.md)). The bot policy is `src/sim/bot.ts`, its sessions `src/sim/tactics.ts` (shared with the game, [24 §3](24-simulation-game.md)); the build sampler `src/harness/sampler.ts`.

**Build sampler.** For each career: background uniform over the live phase; `Body` sliders from population bands (height N(172, 9) m / N(162, 8) f, body fat within band, ape index N(1.02, 0.03), banded fields uniform); `age_start` 16–45 weighted toward 18–28; attribute allocation by a random Dirichlet split with the +25 cap; traits by rejection sampling of 0–12 traits that respect the budget and caps in [03](03-traits.md); hidden roll with probability 0.5.

**Scripted policy.** A fixed, documented decision rule stands in for the player so results are comparable across runs: train on the weakest attribute family relative to the reference climber when `energy` and skin allow, climb on days with `season ≥ 2` and dry rock, pick routes at `estimated DI + 0.5` (projects) three days a week and `− 1.5` (volume) two, rest when `energy` < 40 or `skin` < 30, travel at season end to the cheapest open crag within the phase, work when `money` < 60 days of costs, retire at `burnout` > 85 for 60 days or age 55. Policies live in `src/harness/policies/` and are versioned; a second "reckless" policy exists to exercise injury and death paths.

**Report** (`report.md` plus `metrics.json`):

| Section | Content |
|---|---|
| Grade distributions | peak DI per discipline by career year; percentiles by background and age band; share reaching IRCRA advanced/elite ([08](08-grades.md)) |
| Injury rates | injuries per 1,000 climbing days by site and grade; career-ending rate; mean days lost; compared against [13](13-injury-and-health.md) anchors (upper-limb 77%, fingers 33–52%) |
| Run lengths | distribution of `RunSummary.days` and `end_reason` shares (target standard: retired 55%, forced_injury 15%, burnout 15%, bankrupt 10%, death ≤ 5% with death enabled **(tune)**) |
| Money curves | median and 10th/90th percentile `money` by career month; bankruptcy timing; income mix |
| Trait pick-rate vs outcome | per trait: pick-rate under the value-maximising builder (§4), mean Δ peak DI, Δ run length, Δ injuries, cost-efficiency |
| Calibration | §5 |

---

## 2. Harness modes

| Flag | Values | Effect |
|---|---|---|
| `--difficulty` | story · standard · hard | `RunOptions.difficulty` bundle ([16 §2](16-meta-progression-and-runs.md)) |
| `--policy` | `default` · `reckless` · `sport_only` · … | scripted player |
| `--phase` | P1a … P5 | restricts content |
| `--fix-build <file>` | JSON `new_run` payload | same build across seeds, for A/B of a single trait |
| `--trait <id>` | a live trait id | every sampled build carries the trait (a build that cannot take it is redrawn; the budget is not checked); the report's *Evolving traits* table then says when each stage is reached. Implemented ([26 §10](26-p1b-implementation-notes.md)) |

---

## 3. Player input (retired)

There is no player input on the wall ([24](24-simulation-game.md)): every attempt is played by the climber's own tactics (24 §3), the same function the harness bot has always used. The Swing and Catch, Two-Thumb Grip and Lean skill models (`SWING_SKILL`, `REACH_SKILL`, `BALANCE_SKILL`), the *Playtest stats* screen that logged hand-played moves, the timing-variance target and C8, which measured each move type's skill share, were built for [23](23-move-types-and-art-direction.md)'s controls and removed with them. The harness career and the game's simulated days now run the same session tactics (`src/sim/tactics.ts`), so a harness career is a career the game would play; the bot differs only in choosing its days by state-driven rules instead of a week plan.

---

## 4. Trait re-costing procedure

Run after every change to a formula, a trait or the Reference Climber table: `pnpm recost --n 24 --days 365 --seed 7 [--crag kalymnos] [--traits a,b] --out reports` writes `recost-<crag>-<seed>.md` and `.json`. As built, with the measured run sizes: [26 §10](26-p1b-implementation-notes.md).

1. **Impact.** For each live creation or evolving trait `t`, each of *n* sampled base builds plays one career as sampled and one with `t` added, or taken away when the base carries it (the difference then counts with its sign flipped), from the same seed; a base that cannot take `t` is left out of its pairs. `Δ_t` = mean Δ career score over the pairs, where score is the run summary's ([16 §6](16-meta-progression-and-runs.md); P1b's form in [22 §4](22-p1a-implementation-notes.md)), about ten points per DI of personal best. The scale is today's price level: `slope = Σ cost × Δ / Σ cost²` over the priced traits with at least four pairs, and `impact_t = Δ_t / slope` with its standard error, so costs move against each other and the economy's level stays where [03](03-traits.md) set it. Each base also plays +5 on each physical attribute, the yardstick this step first named; it is reported beside the slope, not divided by, because it reads too small and too noisy ([26 §10.3](26-p1b-implementation-notes.md)).
2. **Cost.** `cost_t = round(impact_t)` within `[2, 10]` for positives and `[−10, −2]` for negatives, on the trait's own side. A trait clearly worth under 1.5 points on its side (`impact + 2 se < 1.5`, signed by its side) is flagged *no-op*, one clearly working against its side (`< 0`) *sign*; both go to design, to strengthen, redesign or remove (no ±1 traits, and no trait changes sides by measurement alone).
3. **Pick-rate.** One value-maximising build per live background buys positives by `impact / cost` and, when it can afford none, takes the negatives that cost least impact per refunded point for the best one, if that one is worth more, within creation's caps. Traits with pick-rate **> 60%** (under-priced or dominant) or **< 5%** (over-priced or unfun) are flagged.
4. **Caps check.** No compatible set of live traits adds up to more than +30% on any single hold type or move class. Whether the negative-refund cap (≤ 12) can buy more than it should is not automated.
5. **Diff.** A cost changes only where the measurement is clear of today's cost: `|impact − cost| > max(1, 2 se)`, at least four pairs, no flag, and the check agrees: each variant measured again against the median of the careers on its base that diverged from the base career (a variant that replays the base exactly counts 0) must propose a move the same way, so that one lucky or unlucky base career cannot move every trait on it. The report lists those; costs are only committed to `data/traits.json` through this procedure, with the report's numbers in the commit.
6. **More than one crag.** A trait is priced for the player who gets the most from it. A cost that rises, or a refund that shrinks, needs one crag's clear verdict. A cost that falls, or a refund that grows, moves to the proposal of the crag where the trait is the better deal (where a positive is worth most, or a negative hurts least), and only when that proposal agrees with the clear crag's.

A quick look on the wall, not a substitute: `npx tsx scripts/dev/trait-onwall.ts [DI]` gives each live trait's worth in DI on the Font and Kalymnos benchmark lines near one grade, and what +5 on each attribute is worth there, the yardstick of step 1. It cannot see learning, skin, stoke, fear or stakes, so it can point at a cost to check but not set one ([26 §8.2](26-p1b-implementation-notes.md)).

---

## 5. Grade calibration tests (Auto-commit)

Dynos resolve by Auto-commit, as in play ([24](24-simulation-game.md)), so grading and play see the same odds ([05c](05c-grade-engine.md)).

| Test | Method | Threshold |
|---|---|---|
| Generator accuracy | 1,000 procedural routes per style profile at targets across the profile's DI range; grade each | `|di_graded − di_target| ≤ 1.0` for ≥ 90%; mean bias within ±0.2 |
| Reference climber consistency | reference vector at DI *n* attempts a DI-*n* route 500 times | send rate within X% ± 5 (X per 05c: 35% onsight-style; boulder per-attempt) |
| Monotonicity | reference climbers at DI *n*−2 … *n*+2 on the same route | send rate strictly increasing |
| Style fairness | reference climber on each style profile at equal DI | send rate spread across profiles ≤ 8 points |
| Signature routes | each `signature: true` route graded | within ±1.0 of its `di_target` ([schemas §9.6](schemas.md)) |
| Build distinctness (P1a success criterion) | two preset builds on the same three Font problems | per-attempt send probability differs by ≥ 15 points on at least two of three |
| Sport generator and consistency (P1b) | the C1–C4 tests on generated Kalymnos routes ([05c §4](05c-grade-engine.md), [26 §5](26-p1b-implementation-notes.md)) | as C1–C4; dice vs grade within 35% ± 10, a warning |
| Build swap (P1b exit criterion, C10) | the Reference Climber at DI 18 tilted towards power or endurance by equal points, on Font problems and on 35 m Kalymnos pitches of equal DI | power ahead on the problems and endurance ahead on the pitches, each by ≥ 0.10 mean send probability |

---

## 6. Determinism and snapshot tests

- **Replay identity:** for 200 random careers, `hash(replay(log))` equals the live state hash at every snapshot boundary; also across Node and browser builds (Playwright runs the same log).
- **Stream isolation:** consuming extra draws from `events` changes no `move` or `weather` outcome.
- **Anti-scum:** reloading before an attempt and re-issuing it yields the same attempt, move for move.
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
| Golden snapshots | every PR | diff without `balance:` tag |
| Bundle size | every PR | over budget ([18 §7](18-tech-architecture.md)) |
| Full harness (10k careers), calibration, re-costing report | nightly | thresholds in §3–§5; report posted as a workflow artifact |

---

## Open questions

- The harness bot plans its days by state-driven rules, the game by a week plan ([24 §2](24-simulation-game.md)). Add a `--policy plan` that runs the default week, so careers the player is likely to start from are measured too.
- Whether the value-maximising builder should also model "fun" picks (random exploration with ε = 0.1) so flavour traits are not all flagged at < 5%.
- Score normalisation for re-costing assumes the Hall of Fame formula is stable; if it changes, all costs are recomputed in one commit.
