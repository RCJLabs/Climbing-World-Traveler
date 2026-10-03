# P2 Implementation Notes

Where P2 ([27](27-p2-plan.md)) departs from the design docs as it is built, and the measured results, milestone by milestone, as [22](22-p1a-implementation-notes.md) and [26](26-p1b-implementation-notes.md) did for P1a and P1b.

Related: [27 P2 Plan](27-p2-plan.md) · [06 §5](06-procedural-routes.md) · [19](19-balance-and-simulation-testing.md) · [24](24-simulation-game.md)

---

## 0. Status

| Milestone | State |
|---|---|
| M0 Harness at scale | implemented (§1) |
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
| `pnpm harness` and `pnpm recost` run one esbuild bundle (`scripts/bundled.ts`) instead of tsx's per-module transform | exact | 1.3–1.4× |
| A sector's routes are fixed (§1.3): a worker builds each route once | game rule | routes cost nothing after a worker's first careers |
| The estimate is worked out weekly (§1.3) | game rule | the benchmark walk runs a seventh as often |

The golden check: 13 generated routes, 8 estimates and 4 careers of 50–150 days at both crags, hashed; identical before and after each exact change. With a bundle the check's careers went from 17.6 s to 14.2 s.

Once routes are cached, what is left of a Kalymnos career is the attempts (62% at first; the reveal scan was half of that) and the estimate (27–36%), hence the weekly estimate.

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

## Open questions

- **Catalogue sizes.** 400–800 problems an area at Font and 100–400 routes a sector at Kalymnos are guesses (**tune**); a real guidebook's counts per grade would set both the sizes and the grade shape per sector.
- **The strongest Kalymnos careers.** Their personal bests drop with fixed routes (p90 17.4 against 18.3): fewer distinct hard routes to try. Whether that is the truth of a small crag or the project slot should look further afield (another sector, a step up in grade) is for M6, when there are more crags.
- **Out of reach.** The rule hides the reach problem rather than fixing it (26 open questions, Reach): a 150 cm climber still finds only 33 of 134 easy Kalymnos routes physically possible.
- **Phone memory.** The game keeps 400 built routes; at Kalymnos that is about 80 MB, against 18 §7's 150 MB heap. With fixed routes a smaller cache costs little, since a route is rebuilt only when it comes back.
