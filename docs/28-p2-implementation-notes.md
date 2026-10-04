# P2 Implementation Notes

Where P2 ([27](27-p2-plan.md)) departs from the design docs as it is built, and the measured results, milestone by milestone, as [22](22-p1a-implementation-notes.md) and [26](26-p1b-implementation-notes.md) did for P1a and P1b.

Related: [27 P2 Plan](27-p2-plan.md) · [06 §5](06-procedural-routes.md) · [19](19-balance-and-simulation-testing.md) · [24](24-simulation-game.md)

---

## 0. Status

| Milestone | State |
|---|---|
| M0 Harness at scale | implemented (§1); exit test met: 1,000 ten-year careers at both crags in 1 h 33 min on 4 workers, after a first run of 2 h 36 min (§1.6) |
| M1–M9 | not started |

## 1. M0: Harness at scale

27 M0 asked for careers long, fast and countable before any P2 system needs measuring: ten-year careers that retire and travel, a `--policy plan`, both crags in one run, a report with run ends and money curves, and 1,000 ten-year careers at both crags in under two hours on 4 workers.

### 1.1 Where the time went

Profiled with `--cpu-prof` on one-year careers, before any change (tsx, one process):

| Career | Font | Kalymnos |
|---|---|---|
| project | 5–6 s | 31 s |
| volume | 10–12 s | 86–121 s |
| routes built in a year | 210–260 (project), 1,100–1,300 (volume) | 105 (project), 600–740 (volume) |

| Share of a career | Font | Kalymnos |
|---|---|---|
| building routes (`generateSport`/`generateBoulder`) | 42% | 66% |
| the session's grade estimate | 27% | 12% |
| attempts | 15% | 15% |

A sport route takes about 100 ms to build: the tracer rebuilds the whole route's geometry after nearly every hold it places (quadratic in length), and the generator grades a route 2–13 times, about four reference walks a grading. Every session built fresh routes from the run's seed, so careers shared none: the plan's "cache routes across careers that share a seed" (27 M0) helped only the re-costing's paired careers. At these speeds 1,000 ten-year careers would take about 26 hours on 4 workers.

### 1.2 Speed work

| Change | Kind | Measured |
|---|---|---|
| Per-wall tables for `sOfY`, `zOfY`, `yOfS`, `angleAt`, and a hold's place kept per wall and height | exact | golden check identical |
| `revealScan` works out each limb's body points once a scan and skips holds past a limb's reach | exact | identical |
| `athleteOf` hands back the last athlete while every attribute has its value | exact | identical |
| `bodyPoints` without arrays (the centroids summed in the same order), `kinematics` kept per body, `freeState` without `delete` (which left every freed state slow to read), the stance helpers without sets | exact | identical; the check's careers 12.9 s → 10.7 s |
| Harness samples every 13 weeks in careers longer than a year, reusing the week's estimate | harness only | the samples were 12% of a ten-year career |
| `pnpm harness` and `pnpm recost` run one esbuild bundle (`scripts/bundled.ts`) instead of tsx's per-module transform | exact | 1.3–1.4× |
| A sector's routes are fixed (§1.3): a worker builds each route once | game rule | routes cost nothing after a worker's first careers |
| The estimate is worked out weekly (§1.3) | game rule | the benchmark walk runs a seventh as often |
| After the first exit run (§1.6): the route cache hands back the route last asked for without moving it; a move is prepared once, not again when it is made; `isVisible` finds a hold through an index; the reveal scan walks only hidden holds, against a set beside the revealed list, and works out the limbs' reach only when a hidden hold is left to look at | exact | identical |
| `bodyPoints` and `positionQuality` keep their last eight results by the objects they came from (states, anchor sets, geometries and athletes are never changed once built); matrix cells list their weights once; terrain tags are shared sets; the grade walk keeps one conditions object per chalk level; slots compare their keys without building them | exact | identical; warm ten-year careers 1.5–1.7× at Kalymnos, 1.3–1.4× at Font; the exit run 1.67× (§1.6) |
| A memo of freed states on a `WeakMap` | exact | dropped: its garbage collection cost what the extra body-point hits saved |

The golden check: 13 generated routes, 8 estimates and 4 careers of 50–150 days at both crags, hashed; identical before and after each exact change. With a bundle the check's careers went from 17.6 s to 14.2 s.

Once routes are cached, what is left of a Kalymnos career is the attempts (62% at first; the reveal scan was half of that) and the estimate (27–36%), hence the weekly estimate.

Ten-year careers cost more a year than one-year ones: a stronger climber's estimate walks more benchmark levels, and harder routes take longer to build. A ten-year Kalymnos project career with its routes built took 63 s before the last row of the table and 49 s after it (cold, 138 s and 109 s); 42% of it was estimates, then 34%. The same 24 ten-year careers (both crags, all three policies, 4 workers) took 599 s and then 412 s, and played identically apart from their samples.

### 1.3 Fixed routes and a weekly estimate (06 §5)

Decided before the work started, because no engineering alone came near the target (estimated 2–3×): each sector has a fixed catalogue of procedural routes, the same in every run, and the estimate refreshes weekly. 06 §5 and schemas carry the rules; as built:

| Item | As built | Why |
|---|---|---|
| Catalogue | `Sector.routes` entries, seeds `crag/sector#index:di`, grades triangular over the sector's range with the mode at 35%. Font 4,400 problems (400–800 an area), Kalymnos 1,400 routes (100–400 a sector) **(tune)** | the first sizes (Font 1,900, Kalymnos 500) climbed out a mileage climber's window at Kalymnos in two to three months; the real island has about 3,500 routes, which six sectors stand in for |
| Slots | each slot draws its target grade as before and takes the sector's route nearest it, preferring by slot (warm-up and mid: new, then sent, then failed; push and project: new, then unfinished, then sent) | ranking by band alone skewed push slots above `E + 1`, where mileage stops; a failed route ranked above a sent one kept offering a short climber the same impossible routes |
| Repeats | a mileage session climbs the repeats its warm-up, mid and push slots hold | a climbed-out sector left mileage days with nothing to do |
| Out of reach | an attempt that comes off at a move the body cannot make marks the route for 90 days | a 150 cm climber at Kalymnos sent 1 route in a year with fixed routes, against 26 with fresh ones; 23 with the rule |
| Weekly estimate | at creation, on arrival and at each week's start; sessions use it | it moves about 0.02 DI a day |

Measured against the P1b baseline (26 §10.8), one-year careers, seed 7:

| Measure | Font n 40 (P1b) | Kalymnos n 20 (P1b) |
|---|---|---|
| estimate median at 12 months | 16.2 (16.2) | 17.2 (17.2) |
| personal best median, p90 | 17.3, 18.0 (17.3, 18.0) | 17.0, 17.4 (17.0, 18.3) |
| project ticks | 184 (179) | 65 (86) |
| mileage ticks | 960 (962) | 217 new routes and about 100 repeats (393) |
| replay | identical | identical |

Grades and median personal bests hold. At Kalymnos the strongest careers' personal bests drop and mileage climbs fewer new routes: a climbed-out window now gives repeats, and a project slot offers the sector's same few hard routes instead of a fresh one each day.

### 1.4 Whole careers

| Item | As built | Why |
|---|---|---|
| `--years N` | careers of up to N years with the career rules on; `--days N` keeps P1's one-crag runs (the re-costing uses them) | — |
| Retirement | at 55, or after 60 days in a row with burnout over 85 (19 §1) | as designed |
| Travel | at a month's start: away from home (the start crag), go home once its season is ≥ 2 and no worse than here; else, out of season (≤ 1), go to the cheapest crag in season (≥ 2). A trip must leave 20 days of living costs | the design's "travel at season end" alone sent Kalymnos climbers to Font in December and kept them there, since the forest is never out of season while Kalymnos is in; and with a 60-day reserve (the bot's work line) two of three never afforded the trip home |
| `--policy plan` | the game's default week through `simulateDays` | traits priced for the player the game starts (26 §10.3) |
| `--crag both` | alternates the start crag, independently of the policy | backgrounds uniform over the phase would start one career in seven at Kalymnos |
| Workers | take careers from a queue | ten-year careers vary several-fold in length |
| Report | a table by career year (both disciplines' estimates wherever the climber is, personal bests, money p10/median/p90), age bands, run ends by cause, travel, and an injury section empty until M2 | 19 §1 |

With two crags, a Kalymnos climber winters at Font (December to March) and goes home in April; Font climbers never move. M5's seasons and M6's atlas give travel its real reasons.

### 1.5 Versions

`DATA_VERSION` `p2-0`, `REDUCER_VERSION` 9: routes, sessions and the estimate play differently. P1b runs stay listed and cannot continue; the save adapters start at M2 (27 §4).

### 1.6 The exit run

`pnpm harness --n 1000 --years 10 --crag both --policy all --workers 4 --seed 7` on a four-core machine, twice: first with §1.2's changes down to the weekly estimate, then again after the exact changes the first run's profile pointed to (§1.2's last rows). The two runs played every career identically (every field of all 1,000 careers but its time), so everything below the time holds for both. Start crags alternate: 501 careers at Font over its six backgrounds and 499 at Kalymnos, all Rower/Swimmer (the one background that starts there); a third play each policy.

| Measure | First run | Second run | Target (27 M0) |
|---|---|---|---|
| Time | 9,331 s (2 h 36 min) | 5,584 s (1 h 33 min) | under 2 hours: **met** by the second |
| CPU in careers | 37,220 s | 22,283 s; the queue kept all four workers busy to the end | — |
| A Font career | 17–21 s by policy (1.7–2.1 s a year) | 12–15 s (1.2–1.5 s a year) | — |
| A Kalymnos career | 49–62 s (4.9–6.2 s a year); 74% of the CPU | 28–36 s (2.8–3.6 s a year); 71% | — |
| Run-end shares and money curves | in the report | the same report | met |
| Failed careers; replay | none; identical on the 2 careers checked | the same | — |

Where a ten-year Kalymnos career's time went in the first run, once its routes were built (profiles of three careers, 52–63 s each):

| Part | Share |
|---|---|
| attempts | 52–59% |
| the weekly estimate | 25–30% |
| garbage collection | 8–11% |
| building routes | none: a worker builds each route once, about 70 s in its first Kalymnos career |

The largest functions by self time were `bodyPoints` 10%, the reveal scan 7–8%, `evaluate` 6–7%, `resolveMove` 6% and the route cache lookup 3–5%, which is what the second round of §1.2 went after.

**Run ends.** Every career reached the ten-year limit. Each end that 19 §1 and 27 §6 aim for (retired 55%, injury 10–15%, burnout 15%, bankrupt 10%; a median career of 3–8 years) is missing for a known reason:

| End | Why none | Comes with |
|---|---|---|
| injury | not modelled | M2 |
| burnout | burnout peaks at a median of 3.8 and a p90 of 22, against the 85 that retires | M3 (the burnout chain) |
| bankruptcy | the bot works whenever money covers fewer than 60 days, so money settles at that line | M4 |
| age 55 | the oldest start is 45 | — |

**Money** at each year's end, p10 / median / p90:

| Year | Font starters | Kalymnos starters |
|---|---|---|
| 1 | 970 / 1,800 / 25,520 | 1,020 / 2,060 / 4,284 |
| 2 | 540 / 1,750 / 11,100 | 1,010 / 2,040 / 2,120 |
| 3 | 600 / 1,570 / 2,070 | 1,020 / 2,050 / 2,122 |
| 10 | 670 / 1,680 / 2,100 | 1,020 / 2,060 / 2,130 |

Flat from year 3: the bot spends a rich start down to its work line (60 days of living costs, 2,100 at the standard rate) and holds it there with 235–247 work blocks a year. Dirtbag Dropouts, whose lower living costs give a lower line, make most of Font's p10.

**Grades** in the start crag's discipline at each year's end, estimate p10 / median / p90 and the median personal best:

| Year | Font starters (boulders) | PB | Kalymnos starters (routes) | PB |
|---|---|---|---|---|
| 1 | 15.2 / 16.5 (6C) / 17.9 | 17.3 | 16.0 / 17.3 (7a) / 17.6 | 17.2 |
| 2 | 16.8 / 18.9 (7A) / 20.5 | 19.8 | 17.1 / 19.1 (7b) / 19.4 | 19.1 |
| 3 | 18.5 / 20.1 (7A+) / 21.8 | 21.2 | 18.5 / 19.6 (7b+) / 21.0 | 20.4 |
| 5 | 19.7 / 21.8 (7B+) / 23.6 | 23.1 | 19.3 / 21.0 (7c) / 21.3 | 21.3 |
| 10 | 21.6 / 24.3 (7C+) / 26.6 | 26.1 (8A+) | 20.1 / 21.3 (7c) / 22.6 | 22.5 (8a) |

By the best estimate in either discipline, 68% of careers end advanced (IRCRA 18–23) and 32% elite (24–27); none stays intermediate. That is far too strong for ten years of climbing (27 §7 already flags progress as too fast), and nothing in the game slows a climber yet. Injuries (M2), aging and the full training model (M3) are expected to; that is a guess until they are measured.

**The route estimate stalls at 7c.** From year 5 the Kalymnos starters' route estimate barely moves (median 21.0 to 21.3), and 266 of 499 end between 21.0 and 21.6, among them climbers with boulder estimates over 24 and route personal bests up to 25.0 (8b). Two of them, read at year 10, pass the level-20 benchmarks (p 0.82–1.0) and fail the level-22 pair on pump (p 0.05–0.24, pump peaks of 105–111 against the Reference Climber's 98–101 at DI 22), so the estimate lands between the two levels. Their aerobic capacity is 37–38 and their anaerobic capacity 20, its starting value: anaerobic capacity trains only from 4×4s, which neither bot policy nor the default week chooses, and climbing trains neither capacity beyond aerobic +3 a mileage session (`endSession`). A session aims its route slots at the estimate (06 §5), so the stall also caps what a route climber is offered. 12's training model is M3's.

**Policies and travel.**

| Policy | climbing days a year | train blocks | work blocks | PB | ticks |
|---|---|---|---|---|---|
| project | 197 | 27 | 235 | 24.2 | 1,188 |
| volume | 198 | 28 | 242 | 23.7 | 2,639 |
| plan (the default week) | 149 | 51 | 247 | 24.9 | 2,253 |

Kalymnos starters travel twice a year (19.6 trips each: to Font in December, home in April) and spend a third of their days at Font; Font starters never travel.

## Open questions

- **Catalogue sizes.** 400–800 problems an area at Font and 100–400 routes a sector at Kalymnos are guesses (**tune**); a real guidebook's counts per grade would set both the sizes and the grade shape per sector.
- **The strongest Kalymnos careers.** Their personal bests drop with fixed routes (p90 17.4 against 18.3): fewer distinct hard routes to try. Whether that is the truth of a small crag or the project slot should look further afield (another sector, a step up in grade) is for M6, when there are more crags.
- **Out of reach.** The rule hides the reach problem rather than fixing it (26 open questions, Reach): a 150 cm climber still finds only 33 of 134 easy Kalymnos routes physically possible.
- **Phone memory.** The game keeps 400 built routes; at Kalymnos that is about 80 MB, against 18 §7's 150 MB heap. With fixed routes a smaller cache costs little, since a route is rebuilt only when it comes back.
- **A climber stuck working.** The same 150 cm build on the default week at Kalymnos climbed 163 days in ten years and took 2,518 odd jobs: failed sessions hold its burnout at 70–87, the week's automatic rest turns climbing days into rest, and the money stub keeps it short, so it never meets the 60-day retirement rule either. M3's burnout chain and M4's money model own the parts; the reach problem above is the cause.
- **Harness speed beyond M0** (§1.6). At the second run's speed the P2a exit run of 2,000 ten-year careers (27 §5) takes about 3 hours on 4 workers, and 10,000 nightly about 15.5 hours. The next lever is the weekly estimate, a quarter to a third of a Kalymnos career: starting its walk two levels under last week's estimate, and from the bottom only when that level already fails, would save about half of it and change an estimate only when a level further down would have capped it (no exact shortcut exists); estimating fortnightly would save about as much again. Both change the game, so neither is taken without a decision. M2–M5 add work to every day, so each milestone's exit run re-measures the speed.
- **Endurance never trains** (§1.6). Whether climbing should train aerobic and anaerobic capacity from the pump it costs (12 §1), and whether the bot and the default week should train the weakest family (19 §1's policy names that rule; the bot's wet-day lists ignore it), is for M3. Until then the route estimate stalls at 7c and caps the routes a strong climber is offered.
