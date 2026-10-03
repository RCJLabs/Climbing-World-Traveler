# P1b Implementation Notes

What the Kalymnos sport phase implements where it departs from, or fills a gap in, the design set, and how it resolves the places where the design docs disagree with each other. Each row names the doc it amends. When a later phase revisits a topic, update the owning doc and delete the row here. [22](22-p1a-implementation-notes.md) keeps the same record for P1a.

Related: [01 §4 P1b](01-pillars-scope-roadmap.md) · [05b](05b-move-resolution-and-attempt-loop.md) · [07 §2](07-disciplines.md) · [19](19-balance-and-simulation-testing.md)

Numbers marked **(tune)** are harness-adjustable, as everywhere else.

---

## 0. Status

P1b ships in four milestones, each its own pull request:

| Milestone | Scope | State |
|---|---|---|
| M1 Sport engine | rope, bolts, clipping, falls on the rope, working a route, the sport generator, the grade engine on routes, French grades, calibration and the exit test, all headless | merged (#22) |
| M2 Kalymnos in the game | sessions at Kalymnos, travel between the two crags, sport session tactics, the `rower_swimmer` background, limestone wet rules, French grades on the screens, a grey-wall profile for the low grades | this update (§5) |
| M3 Watching a pitch | the cartoon wall with the cliff, the rope, quickdraws, the belayer, clipping, catches and lowering ([25](25-visual-representation.md)) | — |
| M4 Content | the P1b traits and Kalymnos signature routes | — |

After M2, a run can start at Kalymnos (Rower/Swimmer) or travel there from Font and climb its routes by the same week plan; the wall still plays a rope attempt with the boulder animations until M3.

## 1. Design conflicts and how they are resolved

Where 05b and 07 disagree, 05b wins, because it is the engine contract; belay slack follows 15, because slack belongs to the belayer.

| Topic | The docs say | Implemented | Why |
|---|---|---|---|
| Clip cost | 05b §1: `6 − 0.03 × rope_craft` s and `2.0 × pc × angle_pump × (1.2 − 0.4 × rope_craft/100)` pump. 07 §2.1: 6–10 s and `4 − 0.03 × rope_craft` pump | 05b | its pump depends on the hold clipped from, which is what makes the clipping stance a decision |
| Slack | 05b §11: `1.5 × (1.2 − 0.4 × rope_craft/100)` (the climber's). 07 §2.1: 1–2 m by belay quality. 15 §2.3: belay quality | `slack = 0.3 + 1.2 × (1 − belay_quality/100)` m | 15 |
| Lead fear | 05b §9.1: `+7 × (1 − min(1, rope_falls_logged/60))`. 07 §2.6: composure shrinking it to zero above 70 | 05b | one formula; composure already calms fear on every clean move |
| Height fear on a rope | 05b §9.1: `+1` per metre of potential fall beyond 4 m. 07 §2.6: `+1` per 5 m | 05b | — |
| Fear after a rope fall | 05b §11: `+8` "last fall"; 05b §9.1: `+2`, decaying per attempt | both: `+8` inside the attempt, `+2` carried to the next attempt on the route | they describe different moments |
| Take | 05b §1: pump `× 0.4` after a 60 s hang. 07 §2.2: pump recovers at 3× the on-hold rate | 05b: 60 s, pump `× 0.4`, power back to full, reserve drains | — |
| Route familiarity | 05b §12.2: `k = 0.25` per attempt. 07 §2.2: `k = 0.2` per bolt-to-bolt section worked | 05b, with a working attempt counting 1.5 (`attempt_eq`) | sections are not tracked |
| Aerobic reserve at the start | 02 §D: `aerobic_capacity`. 05b §6's worked example: reserve 85 for a climber with capacity 46.4 | `reserve0 = 50 + 0.5 × aerobic_capacity` **(tune)** | at `aerobic_capacity`, `R10` counted the attribute twice (`capacity × √capacity`) and a 7a climber's reserve was empty six minutes up a 30 m route. The formula keeps capacity setting the reserve's size, at the worked example's magnitude |
| Energy per attempt | 05b §12.3: `4 + 0.1 × moves` on a route. 07 §2.3: `6 + 0.25 × length_m` | 07, by what was climbed: `6 + 0.25 × progress × length_m + 1 per fall the rope held` (`ROUTE_ENERGY`) **(tune)** | a pitch is about a fifth of a day's energy, so a session is three to five routes; counting moves made a 40 m jug ladder cost more than a 20 m crux pitch |
| Exit test | 01 §4: "a 20-move Font problem" | Font problems of equal DI from the normal generator | Font lines have 3–8 hand moves (p10–p90, 22 §5); no Font profile produces a 20-move problem |

## 2. The rope in the engine (`src/sim/rope.ts`, `src/sim/attempt.ts`)

Everything here is a climber tactic ([24](24-simulation-game.md) §3), shared by play and the grade engine wherever grading needs it.

| Topic | Implemented | Amends |
|---|---|---|
| Discipline | a route is roped when `discipline = 'sport'`; trad and the rest come in P3 | [07 §2](07-disciplines.md) |
| Belayer | no partners yet: every rope attempt is held by the 15 §1.4 stub at `belay_quality 50`; danger is graded with a competent belayer, `80` **(tune)** | [15 §1.4](15-social-reputation-events.md), [05c §3](05c-grade-engine.md) |
| Stick clip | the first bolt is always pre-clipped (07 §2.4, a tactic): a slip off the first moves drops the climber back onto the ground from under a metre, which is a ground fall of `κ ≈ 0.01`, not a rope fall | [07 §2.4](07-disciplines.md) |
| Clipping stance | clip the next bolt from the first stance it can be clipped from (a hand on one of its `reach_from` holds), unless a later hold on the line, also in its `reach_from`, costs at least a fifth less pump to hang from (`pc × angle_pump`), and a fall from here would not be bold or worse (`κ < 0.4`, `URGENT_KAPPA`) **(tune)** | [07 §2.1, §2.6](07-disciplines.md) |
| Passed bolts | a bolt whose `reach_from` holds are all behind the climber is passed: the "clip skipped" term of 05b §11 applies until the next clip. Generated routes are bolted so that no line passes a bolt; the rule is for signature routes and later trad | [05b §11](05b-move-resolution-and-attempt-loop.md) |
| Fall | an unrecovered slip or pump 100 on a rope: `κ` from 05b §11, then the climber hangs for 60 s (`take`) and pulls back on where it came off, now in `work` mode (05b §12.1). A fall that reaches the ground (`reachesGround`) is a ground fall from where the climber came off, `κ = max(rope κ, min(1, 0.03 × CoM.y²))`, and ends the attempt there (M2: it was `κ = 1` at any height, which graded one easy route in six `deadly` from a slip off its first move and rolled injuries at full consequence for it). The climber lowers off when spent (`energy < 15` or `skin < 12`), or after `MAX_ROPE_FALLS = 6` falls **(tune)** | [05b §11, §12.1](05b-move-resolution-and-attempt-loop.md), [05c §3](05c-grade-engine.md) |
| Working | in `work` mode the climber takes at pump `≥ 85` rather than climbing on into a fall (`TAKE_PUMP`), and after three falls on one move pulls through on the quickdraw (`aided`, 15 s, 1 pump) to work the rest **(tune)** | [07 §2.2](07-disciplines.md) |
| The anchor | clipped from the finish jug at the clip cost; the clip itself can pump the climber off, as the grade engine counts it. A send if the rope never held the climber; otherwise `worked`: no tick, `attempt_eq + 1.5` | [07 §2.2, §2.5](07-disciplines.md) |
| Attempt length | a guard of 1,500 steps on a rope (120 on a boulder): a 35 m pitch takes about 240 steps without falls | [24 §3.1](24-simulation-game.md) |
| Results | `AttemptResult.falls` counts the falls the rope held (the move log keeps only its last 40 entries); the career counter `rope_falls_logged` feeds the lead fear | [schemas §4.6](schemas.md) |
| Rope craft | each clip is technique XP for `rope_craft` at no margin, fading with the number of clips made (02 §B.2's novelty) | [02 §B.2](02-character-model.md) |

## 3. Endurance: what changed to make a 30 m route a pump game

The P1a engine was built and tuned on six-move boulders. On a route with a hundred hand moves, five of its rules decided the outcome for the wrong reasons; these replace them. A Font problem never reaches any of them, and the regrade check confirms it: all 115 Font benchmark and signature problems grade within 0.005 DI of before.

| Topic | Problem on a route | Implemented | Amends |
|---|---|---|---|
| Recovery on the move | every hand move cost pump whoever made it: a jug ladder pumped a 7a climber like a 6a one, the generator could only meet a route's grade with jugs, and nothing favoured an endurance build except `fe_mod` | on a route the aerobic system clears `0.3 × aerobic_capacity/100 × √(reserve/100)` pump per second of hand-move time, the critical-force idea of sustained climbing: a move cheaper than that gives pump back. Boulders are anaerobic (07 §1) and skip it **(tune)** | [05b §5, §6](05b-move-resolution-and-attempt-loop.md), [07 §2.2](07-disciplines.md) |
| Form on the day | pump 100 was a cliff: near the limit a route went from a certain send to a certain pump-out within a quarter grade, so no climber could send it about a third of the time | the hands open at a threshold drawn per attempt, `N(100, 10)` truncated at ±2.5 sd (`PUMP_FORM`); play scales every pump change by `100 / threshold`, the grade engine multiplies `P_send` by the chance the threshold exceeds the walk's pump peak. Boulders peak far below it **(tune)** | [05b §5](05b-move-resolution-and-attempt-loop.md), [05c §2.1](05c-grade-engine.md) |
| Chalk | play wore 5 chalk off per hand move and chalked only at pump `< 60`, while the grade engine held chalk at the reference `1.20`: a pumped climber climbed its hardest moves on dry hands, and play sent less than its grade | the climber chalks whenever chalk is under 35, pumped or not (`CHALK_RULE`), and the grade engine walks the same chalk on a route. A boulder never wears its chalk down to 35 | [24 §3.1](24-simulation-game.md), [05c §2.1](05c-grade-engine.md) |
| Footholds | the solver set every foothold to `DI − 1.5`, right for a boulder's few foot moves; a route has a hundred, so once pumped the feet became the crux and the base search answered with jug hand holds | sport footholds sit `2` DI under the route's off-crux hand moves (`SPORT.foot`) **(tune)** | [06 §2.4](06-procedural-routes.md) |
| Rests | a rest jug sat beside a crimp in the other hand, and a stance averages its hand holds (05b §6), so a rest gave back about one pump | each rest is two big holds in a row on the line (jug, or horn on a tufa), so both hands are on it | [06 §2.5](06-procedural-routes.md) |

## 4. The sport generator (`generateSport`, `src/sim/routes.ts`)

| Step | Implemented | Amends |
|---|---|---|
| Wall | from the ground, segments of about 4 m surface with angles from the profile; consecutive segments differ by at most 25°; a tufa on `tufa_rock` (limestone, dolomite, conglomerate, syenite) by the profile's `tufa` weight, else a corner by its weight; a 0.3 m 80° ledge at most once per 8 m; a 1 m anchor segment at `≤ 95°`. The first segment is at most 105° | [06 §2.1–§2.2](06-procedural-routes.md) |
| Steepness by grade | no segment steeper than `95° + 3.5° × (DI − 10)`, clamped to 95–150° (`sportMaxAngle`): resample up to four times, then clamp. On a steep wall every move pays the pump, so a low-grade route there can only be a ladder of jugs **(tune)** | [06 §2.1](06-procedural-routes.md) |
| Line | the boulder tracer with a route shape: width 2.4 m, up to 400 hand moves, no limit on dynamic moves, finishing on a jug 0.5 m under the top instead of a mantle. A boulder traces bit for bit as before | [06 §2.3](06-procedural-routes.md) |
| Cruxes | two or three, spread (`(k + U(0.25, 0.75)) / n` of the hand moves), never the first hand move; set at `DI − 2.5` (`SPORT.crux`): a route's crux is climbed pumped, so set at the route's DI it graded a full grade or more over, and the search below answered with jugs **(tune)** | [06 §2.4](06-procedural-routes.md) |
| Off-crux moves | a secant search on the offset `base` (from `−2.0`, clamped to `[−8, 1.5]`, up to six steps, stopping within 0.25 DI) so the route's pump, not one move, makes its grade; then the 06 §2.8 adjust loop on the cruxes. Sport holds are never re-typed to sidepulls, gastons or underclings, which face one way and can make a move illegal | [06 §2.4, §2.8](06-procedural-routes.md) |
| Bolts | first at `U(3.0, 4.0)` m, then every `spacing_m × U(0.8, 1.2)` while more than 1.2 m below the anchor, with a last bolt when the gap to the anchor exceeds `1.1 × spacing_m`; `reach_from` is the line's hand holds up to 1.2 m below and 0.6 m beside the bolt; a bolt with none moves down to just above the highest line hold below it. The anchor sits 0.15 m under the top, clipped from the finish jug | [06 §2.6](06-procedural-routes.md) |
| Names | a `kalymnos_gr` bank with `lang: 'en'` patterns (`{greek} {noun}`, `{adj} {noun}`, `{noun} of {place}`, `{greek} {suffix}`); Kalymnos villages as places, no people | [06 §2.9](06-procedural-routes.md) |
| Tags | by shares, not by what the line has at all (M2; a pitch has fifty hand moves, so the boulder rule tagged 35 of 36 routes `dynamic` and all 36 `footwork`, and the pump-peak rule made almost every route `endurance`): the main hold family if it is at least 30% of the hand holds, the terrain of the length-weighted wall angle, `power` when the hardest move is within 0.5 DI of the grade or `endurance` when it is 1.5 or more under, `dynamic` at 12% dynamic hand moves, `footwork` at 12% high steps, `flexibility` at 3% heel hooks, then `sport` (`ROUTE_TAGS`) **(tune)**. Pocket sizes count as one family, `pocket`, on boulders too (8 Font benchmarks gain the tag); never `highball` | [05c §2](05c-grade-engine.md), [06 §2.4](06-procedural-routes.md) |
| Ledges | the profile's ledge weight is 0.01 per segment: 05b §11 adds `0.4` to `κ` whenever a ledge lies in a fall's path, so every route with a ledge grades `bold`; at 0.04, a quarter of Kalymnos routes did | [06 §6.4](06-procedural-routes.md) |

Grades on routes are French (`frenchGrade`: DI 4 = 3 … DI 17 = 7a, DI 21 = 7c … DI 34 = 9c+), with YDS alongside; `gradeFor(di, discipline)` picks Font for boulders and French for everything else ([08 §1](08-grades.md)).

## 5. Kalymnos in the game (M2)

### 5.1 Content

| Topic | Implemented | Amends |
|---|---|---|
| Grey walls | `kalymnos_grey_vertical`: edges, pockets and crimps on 80–110° rock, up to DI 21 (7c), bolts every 3 m, rests every 8 m ([09 §7b.2](09-world-atlas.md)) | [09 §6](09-world-atlas.md) |
| Tufa floor | `kalymnos_tufa_sport` gets `di_min: 14` (6b+): below it the tufa profile could only build steep jug ladders, the low-grade question M1 left open | [06 §1](06-procedural-routes.md) |
| Sectors | Grande Grotta and Sikati Cave are tufa only; Odyssey, Spartacus, Arginonta Valley and Panorama mix both profiles | [09 §7b.1](09-world-atlas.md) |
| Sector floors | a sector whose every profile has a floor has no routes under the lowest (`sectorFloor`): session slots are clamped up to it, so the caves start at 6b+ | [06 §1](06-procedural-routes.md) |
| Crag floor | Kalymnos `di_range` `[7, 29]` (was `[8, 29]`), so slots start at DI 8 (4c) and a beginner's session has a warm-up below its level: at `[8, 29]` the Quick climber's (route estimate 9.1) easiest route was its own grade and every route read "sketchy" or "desperate" **(tune)** | [09 §2](09-world-atlas.md) |
| Seeping caves | `seep_lag_days: 7` on the two caves | [10 §4](10-weather-and-conditions.md) |
| Rower | the `rower` trait and the `rower_swimmer` background, as 03 and 04 §2.6 write them; the trait comes with M2 rather than M4 because the background forces it | [03](03-traits.md), [04 §2.6](04-backgrounds.md) |
| Phase | `CURRENT_PHASE = 'P1b'`: Kalymnos is live, P1b traits and backgrounds are selectable at creation | [03 §1.4](03-traits.md) |

### 5.2 Travel

| Topic | Implemented | Amends |
|---|---|---|
| Graph | `data/travel.json`: `hub_paris`, `hub_athens` and three two-way legs, Font–Kalymnos $280 and two days ([09 §7b.3](09-world-atlas.md)); validated by `TravelSchema` and `travelGraphErrors` (schemas §9 rules 15–16) | [09 §8](09-world-atlas.md) |
| Path | the cheapest, fewer days on a tie (`tripTo`); a trip takes at least one day | [09 §8](09-world-atlas.md) |
| Action | `{ t: 'travel', to }` before the day's first block, with the fare in hand. The fare is paid at once; then each day of the trip passes with no blocks: living costs (at the destination's rate on the arrival day), adaptation and skin regeneration as on any day, and no stoke lost for a shut crag. The climber arrives overnight; `visited` gains the crag and the estimate is recomputed there | [11 §1](11-time-career-aging.md), [14 §1](14-economy-gear-logistics.md) |
| Not a block | 11 §1 has travel as an `ActivityBlock` costing `30 + 10` energy per travel day; here a travel day has no blocks and costs no energy, since there is nothing else to do with it | [11 §1](11-time-career-aging.md) |
| Arrival | the first night at a crag draws its weather afresh from the month's stationary distribution (`freshWeather`), and no rain is on record there: Font's rain stays at Font | [10 §1, §4](10-weather-and-conditions.md) |
| The plan | never travels; the player sets off from the Crag screen | [24 §2.1](24-simulation-game.md) |

Visas, seasons, luggage and pad fees, and the World Map join with P2's travel model.

### 5.3 Sessions at a sport crag

| Topic | Implemented | Amends |
|---|---|---|
| Slots | six routes a session (warm-up, two mid, two push, one project; `ROUTE_SLOT_BANDS`) instead of eight problems | [06 §5](06-procedural-routes.md), [24 §3.2](24-simulation-game.md) |
| Tactics | `ROUTE_TACTICS`: Project 3 tries a route (warm-up 1), Mileage 1; a Project route more than 1.5 DI over the estimate that has never been tried is worked first (`WORK_FIRST_ABOVE`) **(tune)** | [24 §3.2](24-simulation-game.md) |
| Energy | §1's row: `6 + 0.25 × metres climbed + 1 per fall` | [07 §2.3](07-disciplines.md) |
| Skin | skin wear scales with how hard the climber pulls: `× min(1, max(0.25, 1 − 0.25 × margin / T))` (`skinForce`), full at a margin of 0 or less, a quarter three roll bands inside. A pitch's hundred moves are mostly well inside the climber's level, and at the boulder rate one pitch cost a quarter of the day's skin. It applies to boulders too; Font careers move by one tick in 20 (§6) **(tune)** | [05b §5](05b-move-resolution-and-attempt-loop.md) |
| Sector choice | a climbing day goes to a sector whose floor is at or below the estimate when one is dry (`SECTOR_REACH = 0`), then by the novelty rule **(tune)** | [24 §2.1](24-simulation-game.md) |
| Wet rock | limestone shuts only on a rain or storm day (`dry_lag_days` 0.5); the caves seep for 7 days after rain over 15 mm | [10 §4](10-weather-and-conditions.md) |
| Estimate | the route estimate walks a shipped benchmark set of `BENCH_PER_SPORT_PROFILE = 2` routes per profile per level, inside each profile's `di_min`–`di_max`: 32 routes, 1.08 MB of JSON (127 kB gzipped; Font's 112 problems are 0.47 MB). The validator wants at least 12 for every live crag | [02 §C.3](02-character-model.md) |
| Grading speed | on a route the grade search gallops out from the target (steps of 1, 2, 4 … grid points, then bisection) instead of bisecting the whole grid, and the solver updates the hold it changed instead of rebuilding the route's geometry: the same grades, bit for bit, in under half the time (C1 sport builds and grades a route in 44 ms against 114 on main) | [05c §2](05c-grade-engine.md) |
| Records | `pb_route` beside `pb`, `pyramid_route` beside `pyramid`, `Tick.discipline` and `ProjectState.discipline` on routes; a session's load, the confidence and stoke nudges and the "new hardest" journal line read the discipline's own best | [schemas §8](schemas.md) |
| Summary and score | `hardest_route`, `hardest_route_onsight`, `countries`; the score is 16 §6 without first ascents and injuries (22 §4) | [16 §6](16-meta-progression-and-runs.md) |

### 5.4 Screens

| Screen | Change |
|---|---|
| Crag | country, altitude and rock in the header; "Sectors" at a sport crag; each sector's floor ("routes from 6b+"); the wet rule of the rock; a travel card per live crag with fare, days, legs, and the reason a trip cannot start now |
| Routes | French grades; length, bolts and hand moves on the route card; route energy in the footer; "Mileage" and "Project" explained for pitches |
| Result, Report | a worked route ("worked to the anchor, 2 falls. No tick."), lowering off, the falls the rope held |
| Climber, Summary, Title, Create | the estimate labelled Route or Boulder at the crag the climber is at; both personal bests and pyramids; countries; the start crag's name |

### 5.5 Versions

`DATA_VERSION` `p1b-2` and `REDUCER_VERSION` 5: the run state gained `pb_route`, `visited` and `pyramid_route`, and skin wear changes how the same actions play out at Font. Runs saved under `p1b-1` stay listed and cannot continue ([22 §4](22-p1a-implementation-notes.md)).

## 6. Measured status

### 6.1 M2

`pnpm calibrate` (normal sweep): 13/13 pass. Font's checks read as on main to the digit (C1 960 problems, 92.4% within ±0.5; C2 31.9%; C5 39/40; C7; C9). The sport checks now sample both Kalymnos profiles over their own grades (tufa DI 14–26, grey DI 10–21):

| Test | Result | Threshold |
|---|---|---|
| C1 sport generator accuracy | 52 routes, 100% within ±0.5 DI, bias 0.01, 44 ms per route (114 on main, the grading speed-up of §5.3); 51 safe, 1 bold (a ledge). Grey routes at DI 8–13 by probe: 24 of 24 within ±0.5, bias 0.02 | ≥ 90% within ±1, ≥ 60% within ±0.5, bias ≤ 0.3 |
| C2 sport, dice vs grade | 42.8% over 8 routes, grade engine 39.3% (main: 41.4% against 35.3% on its own 8 tufa routes) | 35 ± 10 (warning only) |
| C10 exit test | power 0.68 vs endurance 0.31 on Font problems, 0.12 vs 0.63 on 35 m pitches: unchanged | each gap ≥ 0.10, opposite ways |
| Danger | before the ground-contact fix, 1 of 16 tufa routes at DI 9–12 graded `deadly` from a slip off its first move; after it, 34 of 36 routes at DI 9–24 are safe and 2 bold (ledges), and no benchmark route is deadly | — |
| Tags | of the 32 benchmark routes, at most half are `dynamic` or `footwork` (were all), each has exactly one terrain tag, and the tufa routes are more often `overhang` than the grey ones (tests) | — |

`pnpm harness --n 20 --days 365 --seed 7 --crag kalymnos` (Rower/Swimmer careers, 267 s on 4 workers, replay identical): route estimate median 11.6 (6a+) → 14.4 (6b+) at three months → 16.0 (6c+) at twelve, p10 8.9 → 11.1, p90 13.5 → 17.4; personal best median 16.1, p90 18.2. Project careers 15.6 on personal best with 71 ticks, Mileage 14.4 with 404 (the onsight grade, 14.4 against 12.9, goes the other way). 4.4 attempts per climbing day, 28% sends; 85 odd-job blocks a year, money ends near $2,100; burnout peak median 24, p90 64. The three T-Rex Arms carriers sit 3.5 DI under the rest on personal best (Open questions: reach).

`pnpm harness --n 40 --days 365 --seed 7` (Font careers): estimate median 15.6 at twelve months (M1 16.2), personal best 17.3 (17.2), p90 18.3 (19.0). With the creation pool held at P1a, the same run reads 16.2, 17.2 and 19.0, as M1, and one more tick (166 against 165) in project careers: the shift is the P1b traits (Rower and the rest) in the sampled builds, not the engine.

### 6.2 M1, at merge

`pnpm calibrate` (normal sweep; the sport checks are `C1`–`C4` on routes and `C10`, [05c §4](05c-grade-engine.md)):

| Test | Result | Threshold |
|---|---|---|
| C1 sport generator accuracy | 28 routes at DI 14–26: 100% within ±0.5 DI, bias 0.00; 99 ms per route in Node; 16–36 m long; all 28 safe. On 40 routes at DI 14–24, 2 bold (both from ledges) at the profile's ledge weight 0.01, 7 at 0.04 | ≥ 90% within ±1, ≥ 60% within ±0.5, bias ≤ 0.3 |
| C2 sport, dice vs grade | the Reference Climber at each route's grade, through the real attempt loop: 41.4% over 8 routes × 100 attempts, with the grade engine at 35.3% at the same interpolated DI; a second sample of 12 routes × 60 reads 37.6% against 32.0%. Single routes differ from the grade engine by about 10 points on average and up to 23. P1a's boulders read 31.9% on the same check (22 §5: 32.2%) | 35 ± 10 (warning only) |
| C3, C4 sport | send curves non-decreasing with one crossing; route seeds regenerate identically | — |
| C10 exit test | Reference Climber at DI 18 tilted 4 points on each of six power attributes against 6 on each of four endurance ones (`tiltedBuilds`); mean `P_send` on 12 Font problems: power 0.68, endurance 0.31; on 12 35 m Kalymnos pitches: power 0.12, endurance 0.63 | each gap ≥ 0.10, opposite ways |
| Font regrade | 115 benchmark and signature problems: none changed (max \|Δ\| 0.005) | 0 |
| Hold mix | share of jug and horn hand holds on the line (rests included): about 64% at DI 14, 20% at DI 18, 9% at DI 22; at DI 12 the line is all jugs | — |
| An attempt | a 33 m DI-18 pitch: about 240 steps and 14 minutes on the wall; the Reference Climber one DI under sends none and falls about once per attempt, one DI over sends 92% | — |

`pnpm harness --n 40 --days 365 --seed 7` (P1a careers on the new engine): estimate median 12.4 → 16.2 at twelve months (16.1 before), personal best median 17.2 (17.2), p90 19.0 (19.1); projecting against volume 17.5 vs 17.1 on personal best and 165 vs 933 ticks (unchanged); replay identical. Data version `p1b-1`, reducer version 4: a run saved under `p1a-13` cannot continue, because the same actions now play out differently (the form draw).

## Open questions

- **The ledge term.** 05b §11's `+0.4` for any ledge in a fall's path makes every ledge a bold route, however short the fall onto it would be. A term that grows with the fall's length below the ledge top would let ledges back into the profile at a natural rate.
- **Play against grade on a route.** Play sends about six points more than the grade engine on average, and single routes differ by up to about 25 points: a long line is a chain of threshold tactics (shake at pump 35, chalk at 35, the clipping stance) that the expected-value walk follows down one path while play follows many. Candidates: a finer DI grid or logit interpolation for the steep pump-out curves, and fewer hard thresholds in the tactics.
- **Recovery on the move.** The clearance uses `aerobic_capacity` only; physiologically, critical force is forearm-local, which in this game is closer to `finger_endurance`, already in `fe_mod`. Revisit with the P1b traits (M4).
- **Chalk by rock.** Chalk adds 21.6% friction on every rock; 10 §2 gives 18.7% on limestone. Kalymnos should use the limestone figure, which moves the reference conditions, so it waits for a regrade pass.
- **Steep, easy, long.** The steepness cap is a rule of thumb on the generator, not a property of rock. M2's floors keep the caves at 6b+ and up, so the cap now mostly shapes the mixed sectors' tufa routes at 6b+–6c+; whether it should go once the content team has a real grade spread per sector is open.
- **Reach on easy routes.** A line is traced on the Reference Climber's body (170 cm, ape 1.0, its lock-off pinned), and its hand moves sit near that body's static reach. A shorter climber, or one with a weaker lock-off, cannot make them static and deadpoints instead: on easy benchmark routes the 163 cm Slab Wizard preset cannot make 93% of the static hand moves at Kalymnos (75% of Font's), the 168 cm Late Starter 40% (20%), every preset of 175 cm or more none. On a pitch that compounds: the same Slab Wizard estimates 9.1 at Kalymnos and 13.1 with only height and ape index set to 178 cm and 1.02 (Font 10.5 against 12.7); the Late Starter 8.7 against 11.5. The research behind 02 §A puts height at about 1% of grade variance. Candidates: trace lines on a shorter body or with a reach margin, or let the climber use intermediate holds; either moves Font's calibration too, so it is its own change.
- **Skin on boulders.** `skinForce` eases skin wear on easy moves everywhere, which is right for a Font warm-up too; it moved Font careers by one tick in 20. If the P1a skin economy was tuned around full wear on easy problems, retune it with the harness.
- **Sector choice.** With `SECTOR_REACH = 0` the plan never sends a 6b climber into a cave to try its easiest tufas. A project day could aim one sector higher.
- **Travel costs.** The fare is the only cost of a trip: no visa, no luggage or crash-pad fee, no jet lag. P2's travel model brings them.
- **Bundle size.** Both benchmark sets ship in one 1.56 MB `routes` chunk; Workbox precaches no file over 2 MiB by default, so a third crag's set would silently drop the chunk from the offline cache. Before P2: a chunk per crag loaded on arrival, a raised `maximumFileSizeToCacheInBytes`, or a leaner route format (holds as tuples).
