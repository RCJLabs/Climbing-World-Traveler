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
| M2 Kalymnos in the game | sessions at Kalymnos, travel between the two crags, sport session tactics, the `rower_swimmer` background, limestone wet rules, French grades on the screens, a grey-wall profile for the low grades | merged (#23, the reach fix #24) |
| M3 Watching a pitch | the cartoon wall with the cliff, the rope, quickdraws, the belayer, clipping, catches and lowering ([25 §10.8](25-visual-representation.md)) | merged (#25) |
| M4 Content | the P1b traits and Kalymnos signature routes | merged (#26; signatures on a project day, #27, §9) |
| Trait economy | 03 §1.7's evolving traits, 19 §4's re-costing and its first cost pass | this update (§10) |

After M2, a run can start at Kalymnos (Rower/Swimmer) or travel there from Font and climb its routes by the same week plan. After M3, any rope attempt can be watched on the cartoon wall: the cliff, the bolts and quickdraws, the rope and the belayer, every clip, fall, take and lower. After M4, creation offers the P1b traits, every trait effect in the data is read by the engine or known to wait for a later phase, and the Grande Grotta has its three signature routes. With the trait economy update, Afraid of Falling, Choker and Topout Terror evolve as 03 §1.7 describes, `pnpm recost` measures what every trait is worth over whole careers, and 15 costs follow its first pass.

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

`pnpm harness --n 20 --days 365 --seed 7 --crag kalymnos` (Rower/Swimmer careers, 267 s on 4 workers, replay identical): route estimate median 11.6 (6a+) → 14.4 (6b+) at three months → 16.0 (6c+) at twelve, p10 8.9 → 11.1, p90 13.5 → 17.4; personal best median 16.1, p90 18.2. Project careers 15.6 on personal best with 71 ticks, Mileage 14.4 with 404 (the onsight grade, 14.4 against 12.9, goes the other way). 4.4 attempts per climbing day, 28% sends; 85 odd-job blocks a year, money ends near $2,100; burnout peak median 24, p90 64. The three T-Rex Arms carriers sit 3.5 DI under the rest on personal best (Open questions: reach). After the reach fix (`p1b-3`, [22 §5](22-p1a-implementation-notes.md)): estimate median 17.2 at twelve months, p10 15.3, personal best 17.0, T-Rex Arms 1.5 DI under.

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

## 7. Watching a pitch (M3)

The wall as built is [25 §10.8](25-visual-representation.md). Neither the engine nor the data changed: no version change, and saves carry on.

| Topic | Implemented | Amends |
|---|---|---|
| Source of the rope | rebuilt on the wall from the frames (`rope.last_clip_y` gives the bolt clipped) and the attempt log (the entries each step added, found under the log's 40-entry cap), with the engine's own `fallLength`, `reachesGround`, `bodyPoints` and `applyMove`; the last step, which has no frame, is replayed from the last frame | [25 §3](25-visual-representation.md) |
| Pacing | a pitch is 120–340 steps, so routine moves play at 0.2 of their time without a hold, other clean static moves at 0.6, rests and chalk at 0.55; the rope's beats, dynamic and sketchy moves and slips in full | [25 §7](25-visual-representation.md): "about half a minute" for a pitch assumed 30 moves |
| The camera | at least 2.6 × 3.4 m on a route (2.2 × 2.8 on a boulder), and the zoom goes out to the whole route | [17 §2](17-ui-ux.md), [25 §10.3](25-visual-representation.md) |
| Scenery | the sea under limestone, Font's forest under sandstone and granite: by rock type, as the palettes already were, until crags carry a look | [25 §7](25-visual-representation.md) `Crag.look` |
| The belayer | the 15 §1.4 stub drawn standing right of the first bolt; a catch lifts it by the fall's length, the same for every fall | [15 §1.4](15-social-reputation-events.md) |

Measured (25 §10.8): a send plays in 41–79 s at 1× on the benchmarks (median about a minute; 1.5–5 minutes at the boulder pace), everything median 70 s and p90 112 s; a pitch's frame costs about 1.7 times a boulder's (3.9 against 2.3 ms in headless desktop Chromium at 1× pixel ratio, 7.8 against 4.4 at 2×). Checks: typecheck, 154 tests (15 new in `tests/pitch-wall.test.ts`), validate, calibrate `--quick` 13/13, build.

## 8. P1b traits and signature routes (M4)

### 8.1 Traits

| Topic | Implemented | Amends |
|---|---|---|
| The set | the 44 P1b creation traits and quirks of 03 §2 that M2's Rower did not bring: 45 P1b creation traits in all, 89 live at creation with P1a's | [03 §1.3](03-traits.md) |
| Gated | Bendy Shoulders (its downside is a shoulder-injury multiplier) and Pain Tolerant (all of it is injury and pain) wait for P2's injuries; Kneebar Finder and Downclimber wait for kneebars and downclimbing, which 03 §1.3 lists for P1b but the engine does not have. By 03 §1.3 a trait whose downside or whole value has no live system is not selectable, so none of the four is in `data/traits.json` | [03 §1.3](03-traits.md) |
| Inert side clauses | a live trait may carry a flag of a system that is not live yet (`INERT_FLAGS`: `onsight_rep_mult`, `swim_skill`, `city_stoke`, `sponsor_appeal_mult`, the event weights, `plastic_mult`) only when the flag is not the trait's downside. Onsight Purist's reputation bonus and Swimmer's swim-out are part of their price and missing from what they give until P2–P3 | [03 §1.3](03-traits.md) |
| `resource_mult` | read for the first time, with 03 §1.9's meanings: skin overnight and on a rest block, stoke on a send and on a rest day, burnout accrual, chalk per chalk-up, focus gains, and the aerobic reserve and power an attempt starts with. `energy` (it refills to its cap every morning) and `health` (no regeneration before P2's injuries) are refused on a live trait (`INERT_RESOURCES`) | [03 §1.9](03-traits.md), [22 §4](22-p1a-implementation-notes.md) |
| Stakes | an attempt has stakes when it is a redpoint go on a route at or above the discipline's personal best − 0.25: the redpoint clause of 03 open question 8; comp finals and an audience come with P2–P3. `stakes_mult` adds to `M_trait` like the other multipliers (03 §1.2): Clutch `+0.05`, Choker `−0.06` | [03 open question 8](03-traits.md), [05b §4](05b-move-resolution-and-attempt-loop.md) |
| New flags | `pre_move_time_mult` (each move's time, and with it the aerobic drain), `visualise_action` (familiarity at the start of every attempt: the free look is always taken), `redpoint_stoke_penalty` (each go at a route from the fourth), `sketchy_send_stoke` (a send with a sketchy move in it; the 03 §1.9 table does not list the flag), `mass_shift` (kg at creation) | [03 §1.9](03-traits.md) |
| `beta_mult` | other climbers' beta exists only on signature problems until partners come (22 §1), so the flag scales that: Stubborn's first look at a signature starts at familiarity `0.075` instead of `0.15` | [03 §1.9](03-traits.md) |
| `split_risk_cold` | there is no split-tip event before P2's skin injuries, so Dry Hands' winter tax is skin wear `× 1.3` on a cold day | [03 §1.9](03-traits.md), [13](13-injury-and-health.md) |
| `mass_shift` ceiling | 03 adds `+0.5` strength ceiling per kg, as 02 §A.2 does for the creation slider; neither is implemented, so the shift is mass only | [02 §A.2](02-character-model.md) |
| Validator | every flag is one the engine reads (`LIVE_FLAGS`) or one known to wait for a phase (`INERT_FLAGS`), and every `resource_mult` key is a resource the engine has and, on a live trait, one it regenerates (schemas §9 rule 11, `traitEffectErrors`) | [schemas §9](schemas.md) |
| Create screen | effect text for the new flags and resources, and a "Life" category for Skin Care Routine | [17 §6](17-ui-ux.md) |

The new reads reach six P1a traits whose resource multipliers or stakes were carried and never read: Gecko Skin, Paper Skin, Sweaty Hands, Heavy Chalker, Flow Prone and Choker ([22 §4](22-p1a-implementation-notes.md)).

### 8.2 What the traits are worth on the wall

`scripts/dev/trait-onwall.ts` walks the Reference Climber at one grade with and without each live trait over the benchmark lines near that grade (Font ±1.5 DI, Kalymnos ±2.5) and divides the change in mean `P_send` by what one DI changes it by ([19 §4](19-balance-and-simulation-testing.md)). It sees attributes, multipliers and mass; not learning rates, ceilings, skin, stoke, fear (the walk is fearless) or stakes, so the mental and off-wall traits read 0. The samples are small: 24 Font problems, 6–8 Kalymnos routes.

| Trait (cost) | Font at DI 17 | Kalymnos at DI 17 | Font at DI 13 | Kalymnos at DI 13 |
|---|---|---|---|---|
| Bellows (+4) | 0.00 | 0.55 | 0.00 | 0.45 |
| Runner (+3) | −0.02 | 0.53 | −0.06 | 0.34 |
| Rower (+5) | 0.03 | 0.50 | 0.15 | 0.99 |
| Swimmer (+4) | 0.02 | 0.41 | −0.03 | 0.26 |
| Gymnast (+6) | 0.35 | 0.16 | 0.49 | 0.32 |
| Static Master (+5) | 0.26 | 0.14 | 0.48 | 0.31 |
| Sloper Whisperer (+5) | 0.49 | 0.05 | 0.21 | 0.08 |
| Crimp Machine (+6) | 0.08 | 0.10 | 0.27 | 0.00 |
| Slow Hands (−4) | −0.27 | −0.20 | −0.19 | −0.43 |
| +5 `aerobic_capacity` | 0.00 | 0.39 | 0.00 | 0.14 |
| +5 `finger_strength` | 0.07 | 0.19 | 0.19 | 0.00 |

At Kalymnos the endurance traits are worth as much on the wall as Font's best aptitudes are at Font, for one to three points less; Crimp Machine is worth little at DI 17 at either crag. The costs stay as 03 has them: 19 §4 re-costs from whole careers (pick rate against outcome), and the on-wall worth is one input to that (Open questions).

### 8.3 The signature routes

| Topic | Implemented | Amends |
|---|---|---|
| The routes | the Grande Grotta's Priapos 7a (`di_target` 17, graded 16.96), DNA 7c (21, 21.26) and Aegialis 8c (27, 27.03) | [09 §7b.4](09-world-atlas.md) |
| How they are made | an authored wall (segment heights, angles and tufas) run through the sport generator (`GenRequest.wall`), which traces the line, sets the holds, rests and bolts and grades it, re-seeded until the grade is within 0.3 DI of the canon (up to 24 seeds; each landed on the first), then rounded as shipped and regraded (`scripts/build-sport-signatures.ts`). 06 §4 asks for hand-written holds and beta, as Font's problems have; the three pitches have 222–245 holds and 216–260 steps each, so what is authored is the wall's shape | [06 §4](06-procedural-routes.md), [20 §3.5](20-content-pipeline.md) |
| Off-route holds | kept, unlike the benchmarks', which only the grade walk reads: a signature is climbed and watched | — |
| Aegialis | a 29 m pitch peaking at 122°, gentler than the cave's steepest lines. On a 32 m pitch peaking at 128° the base search reaches its floor (off-crux moves 8 DI under the grade) and the route still grades 28.1: the pump of a wall that is steep all the way, not its holds, sets the grade. Swept over three seeds each: 27 m pitches peaking at 120° grade 27.1–27.2, at 125° 26.8–27.1, at 130° 27.4–27.5; 29 m 27.1–27.2, 27.4–27.5, 27.8–27.9; 31 m 26.9–27.5, 27.5–27.8, 27.9–28.1 | [06 §2.4](06-procedural-routes.md) |
| In a session | listed in every Grande Grotta session as `signature` slots; the first look is a flash with beta, as on Font's signatures | [22 §1](22-p1a-implementation-notes.md) |
| First-ascent notes | fictional; each says the game records no first ascensionist | [06 §4](06-procedural-routes.md) |
| Real names | schemas §9 rule 8 had no check behind it. The validator now looks for every name in `data/real_names.json` (real climbers, first and last name) in every string of the content (ids, names, prose, the benchmark sets), as whole words, ignoring case, accents and punctuation (`realNameHits`) | [schemas §9](schemas.md), [20 §4](20-content-pipeline.md) |
| Size | `kalymnos_signatures.json` is 184 kB raw, 25 kB gzipped. With it the single `routes` chunk reached 1.93 MB, within 0.17 MB of the 2 MiB over which Workbox silently leaves a file out of the offline cache, so route data is now one chunk per crag: `routes-fontainebleau` 0.55 MB (63 kB gzipped), `routes-kalymnos` 1.39 MB (177 kB); both still load at startup | [18 §7](18-tech-architecture.md) |

### 8.4 Versions

`DATA_VERSION` `p1b-4` and `REDUCER_VERSION` 6: the resource multipliers, stakes and the new flags change how the same actions play out, at Font too. Runs saved under `p1b-3` stay listed and cannot continue ([22 §4](22-p1a-implementation-notes.md)).

### 8.5 Measured

`pnpm calibrate --quick`: 13/13; C7 reads La Marie-Rose 12.88, Le Toit du Cul de Chien 19.06, Rainbow Rocket 24.99, Priapos 16.96, DNA 21.26, Aegialis 27.03. The benchmarks, rebuilt after the generator gained `GenRequest.wall`, are unchanged.

`pnpm harness --n 40 --days 365 --seed 7` (Font careers), main in brackets: estimate median 16.5 at twelve months (16.5), p10 15.2 (15.0), p90 17.5 (17.5); personal best 17.3 (17.3), p90 18.0 (18.2); project careers 180 ticks (178), volume 962 (958); burnout peak p90 2.6 (2.2); stoke at the last sample 84.7 (88.2); replay identical. The sampled builds now draw from 89 live traits instead of 45, so the two runs climb different populations: the gaps are of the size a different draw of builds makes, and with 3–11 carriers per trait the carrier table cannot isolate one trait's effect.

`pnpm harness --n 20 --days 365 --seed 7 --crag kalymnos` (Rower/Swimmer careers, signatures in the Grande Grotta's sessions), main in brackets: route estimate median 17.2 at twelve months (17.2), p10 15.0 (15.3), p90 17.4 (17.4); personal best 17.1 (17.0), p90 18.3 (18.1); project careers 85 ticks (90), Mileage 391 (386); 34.4% sends (34.2%); burnout peak median 12.5 (7.7) with the same p90 43.3; stoke at the last sample 80.1 (83.9); replay identical. The same caveat on the sampled builds holds.

Checks: typecheck, 175 tests (21 new: 14 in `tests/traits.test.ts`, 4 on the signatures in `tests/kalymnos.test.ts`, C7 for each new signature), validate, calibrate `--quick` 13/13, build. Screens checked at 360 and 390 px: the creation trait list in every category, the Grande Grotta session with its signatures, and a watched attempt on Priapos.

## 9. Signatures on a project day

| Topic | Implemented | Amends |
|---|---|---|
| Order | on routes a Project day tries, after the warm-up and any known projects, the sector's signature routes within reach (estimate + 4.5) before the generated project (`ROUTE_TACTICS.project`): three goes each, the first worked when the route is more than 1.5 over the estimate and otherwise a flash with beta. Mileage and every boulder order are unchanged | [24 §3.2](24-simulation-game.md) |
| Why | a session at a sport crag is three to five pitches and the project slot's three goes use it up, so a signature behind it was never reached: over three 365-day Project careers at Kalymnos the climber tried 11–17 Grande Grotta routes each and no signature, one of them with a route personal best of 17.9 and Priapos (17) in every session | — |
| Saves | the log records each attempt the tactic chose, so saved runs replay as before: no version change | [18 §5](18-tech-architecture.md) |

Measured on the same six probe careers (365 days at Kalymnos, `sampleBuild`, the bots' plan): two of the three Project careers sent Priapos (after 15 and 25 goes, on days 102 and 220) and the third had 7 goes on it by the year's end; one went on to 16 goes on DNA without a send. Their route personal bests moved +1.3, −0.2 (the DNA siege) and +0.1. The three Mileage careers are unchanged: two flashed Priapos once it came within 1 DI, the third never came within reach.

`pnpm harness --n 20 --days 365 --seed 7 --crag kalymnos`, M4 in brackets: route estimate median 17.2 at twelve months (17.2), personal best 17.1 (17.1), p90 18.3 (18.3); at nine months the personal best median is 17.0 (16.6); project careers 17.1 (17.0) on personal best with 86 ticks (85); Mileage unchanged; replay identical. Font careers (`--n 40`) read as M4 line for line: no boulder order changed. Grande Grotta is one sector of six, so most climbing days never meet a signature.

## 10. Evolving traits and trait costs

### 10.1 Evolving traits

| Topic | Implemented | Amends |
|---|---|---|
| Data | `evolves_to` on the trait: a list of `Evolution { trait, needs, min_weeks }`, the next stage (`null` removes the trait), the counts it needs and the weeks since the first count of its first need; the first evolution met applies. 03 §1.7's rows whose systems are live: Afraid of Falling → Falls OK → Falls Well, Choker → gone, Topout Terror → gone. Nervous Flyer waits for flights (P2) | [03 §1.7](03-traits.md), [schemas §4.4](schemas.md) |
| Counters | `RunState.counters.evolve`: per `EvolveCounter`, the count and the day of the first. Every climber counts, carrying an evolving trait or not, and counts never reset, so Falls Well counts from Falls OK's first practice fall | [schemas §8](schemas.md) |
| Practice falls | 3 per fall-practice session, the gym block P1a already had (`fall_practice`, 12 §1), which is 03 §1.7's "max 3 per session". No climber takes a deliberate lead fall: the tactics never choose one, and a fall in play is not practice | [03 §1.7](03-traits.md) |
| Falls without injury | every boulder attempt that ends in a fall or a pump-out, and every fall the rope holds: no fall injures before P2. 03 asks for "unplanned" falls; every fall in play is unplanned | [03 §1.7](03-traits.md), [13](13-injury-and-health.md) |
| Stakes | a send on an attempt with stakes (§8.1: a redpoint go at or above the personal best − 0.25) | [03 §1.7](03-traits.md) |
| Clean mantles | a topout whose mantle resolves clean ("Topped out."); an ugly mantle still sends and does not count | [03 §1.7](03-traits.md) |
| When | at the end of a day, after the overnight skin; one stage a day, so a climber who has met both of Afraid of Falling's thresholds becomes Falls OK one evening and Falls Well the next | — |
| Effects | the new stage's multipliers, fear and flags replace the old stage's at once. Attribute adds are values, not live effects: the old stage's stay where training has taken them, and a gained stage's (Falls Well: composure +4) apply once, on the day it is gained, within the ceilings, which are recomputed then (they otherwise move on birthdays) | [03 §1.7](03-traits.md) |
| The bot | while one of its traits evolves by practice falls, the bot spends a rest day on fall practice once a week (`FALL_PRACTICE_EVERY_DAYS = 7`), when burnout is at most 60 and the block can start. Without it no harness career would ever practise falling: the bot trains its weakest attribute family | [19 §1](19-balance-and-simulation-testing.md) |
| The game | fall practice was already a training choice in the week plan. The trait card shows each evolution's progress ("Afraid of Falling → Falls OK: 12/30 practice falls, week 3 of 6. A fall-practice session counts 3."), and a journal line marks each change | [17 §5](17-ui-ux.md) Character Sheet |
| Validator | schemas §9 rule 17: evolutions only on evolving and acquired traits, one on every evolving trait, known counters, `n ≥ 1`, `min_weeks ≥ 0`, stages that exist | [schemas §9](schemas.md) |
| Harness | the career result keeps the creation traits and the day of each evolution; the report has an *Evolving traits* table, and `--trait <id>` gives every career one trait | [19 §2](19-balance-and-simulation-testing.md) |

### 10.2 Re-costing

`pnpm recost` (`scripts/recost.ts`, the pure parts in `src/harness/recost.ts`) runs 19 §4. What it does where 19 §4 leaves room, or where it departs:

| Topic | Implemented | Amends |
|---|---|---|
| Pairs | n base builds from the harness sampler at one crag; each plays 365 days as sampled and once per live creation or evolving trait with that trait toggled, from the same career seed, so a pair shares its weather and its first dice. The bot alternates the project and volume policies by base. A paired build may break the creation budget, so it is created unchecked (`createRun(…, { unchecked: true })`) | [19 §4 step 1](19-balance-and-simulation-testing.md) |
| Evolution | evolving traits play with their evolutions, so Afraid of Falling is measured with its weekly fall practice and Topout Terror with the clean topouts that remove it | [03 §1.7](03-traits.md) |
| Scale | 19 §4 divides by the gain from +5 on one physical attribute. Each base plays that yardstick on all twelve; it reads too small and too noisy to divide by (§10.3), so impact is priced at today's level (19 §4 step 1 as amended) | [19 §4 step 1](19-balance-and-simulation-testing.md), [03 §1.4](03-traits.md) |
| Sides | the proposal stays on the trait's side: a measured positive worth less than nothing is a *sign* flag, not a refund | [19 §4 step 2](19-balance-and-simulation-testing.md) |
| Pick rates | one build per live background, so a trait's pick rate moves in steps of one build in seven | [19 §4 step 3](19-balance-and-simulation-testing.md) |
| Run size | 19 §4 asks for 1,000 pairs per trait. A 365-day career costs about 4 s of one worker at Font and about 40 s at Kalymnos, where generating routes is about 44% of the time and the estimate 18% (a base's variants share its routes through a 3,000-route cache), so the runs are n 24 at Font (all 92 traits, 42 minutes on 4 workers) and n 8 at Kalymnos (the 43 traits routes touch most, 72 minutes) | [19 §4](19-balance-and-simulation-testing.md) |
| Resume | careers stream to `recost-<crag>-<seed>.jsonl`, keyed by base and career length, each with a hash of its configuration: a stopped run resumes, a finished one re-reads in seconds, a larger n reuses the smaller run's careers, and a career whose base the sampler now draws differently (bases are drawn within the trait budget, so a cost change can move them) is played again | — |

### 10.3 Measured at Font

`pnpm recost --n 24 --days 365 --seed 7`: the 92 live creation and evolving traits, 2,387 careers, 42 minutes on 4 workers. Impacts are in trait points at the price level; *check* is the same trait measured against each base's diverged median (below).

| Measure | Result |
|---|---|
| Price level | 0.23 score points per trait point, over the 83 priced traits with at least four pairs (0.19 for the check). Without the 11 traits that changed no career it is 0.26, over P1a's traits alone 0.30; the clear set below is the same at all three |
| 19 §4's yardstick | +5 on one physical attribute: 0.66 ± 0.62 score points, its standard error as large as its mean (core_tension 1.7, finger_strength 1.6, lockoff 1.4, hip_mobility 1.3, shoulder_mobility 1.2, contact_strength 0.8, pull_power 0.5, leg_power 0.4, aerobic_capacity 0.0, skin_durability 0.0, finger_endurance −0.3, anaerobic_capacity −0.7) |
| What a point is | at the price level a trait point is about 0.75 points of a broad attribute (+1 on finger_strength, core_tension or lockoff is 0.28–0.34 score), near 03 §1.4's definition, where a point is one broad attribute point. 19 §4's yardstick makes a point +5: five times 03 §1.4's. Divided by it, the traits that moved up below would stay where they are, and the cheap negatives below would be flagged as no-ops rather than re-costed |
| Base-career luck | a career is fixed by its seed and build. A toggle that changes nothing replays the base career exactly, as about a quarter of the Font variants do. A toggle that changes anything diverges, and from there the career is a fresh draw, so a lucky or unlucky base career shifts every trait measured on it. Five of the twelve project bases sit well off the median of their own diverged careers, by −12.1, −7.0, −4.5, +4.2 and +9.9 score; with the smaller offsets they move every trait's mean by about +0.5 score, two trait points. The check measures each diverged variant against that median instead (a variant that replays the base counts 0); a re-cost it does not move the same way is not clear (19 §4 step 5) |
| Policy | the technique traits pay in the project careers: Δ score project / volume for Dancer +11.6 / +1.3, Quiet Feet +10.2 / +1.0, Smear Faith +9.0 / +1.1, Static Master +7.4 / +1.9, Sloper Whisperer +6.4 / +1.7, Clumsy Feet −10.4 / −7.1. A project career's personal best is a project that went after many goes, and a little more margin sends more of them; a volume career's is a flash. The default week has two project days and two mileage days (24 §2.2), and its personal best comes from the project days |

Clear at Font (19 §4 step 5), with the personal best each moves in a year:

| Trait | cost | impact ± se | check ± se | Δ PB (DI) | proposal |
|---|---|---|---|---|---|
| Dancer | +5 | +30.8 ± 9.5 | +34.1 ± 8.2 | +0.69 | +10 |
| Quiet Feet | +5 | +24.9 ± 8.3 | +26.9 ± 7.5 | +0.55 | +10 |
| Smear Faith | +4 | +22.4 ± 7.2 | +26.6 ± 6.4 | +0.49 | +10 |
| Static Master | +5 | +20.7 ± 5.2 | +22.0 ± 4.6 | +0.46 | +10 |
| Sloper Whisperer | +5 | +17.9 ± 4.9 | +18.1 ± 3.8 | +0.38 | +10 |
| Clumsy Feet | −5 | −38.8 ± 7.7 | −46.1 ± 6.6 | −0.88 | −10 |
| Scatterbrain | −5 | +7.0 ± 4.6 | +5.8 ± 3.1 | +0.15 | −2 |
| Stiff Shoulders | −4 | +3.9 ± 3.1 | −0.8 ± 4.1 | +0.09 | −2 |
| Afraid of Falling | −6 | +1.8 ± 3.3 | −0.2 ± 3.0 | +0.04 | −2 |
| Rage Quitter | −5 | +1.7 ± 1.8 | +3.9 ± 3.0 | +0.04 | −2 |
| Jittery | −5 | +1.7 ± 2.3 | +1.1 ± 2.3 | +0.04 | −2 |
| Resistance | +5 | −3.6 ± 3.4 | −5.8 ± 2.6 | −0.08 | +2 |
| Flow Prone | +5 | +0.8 ± 0.8 | +0.1 ± 1.0 | +0.02 | +2 |
| Dirtbag | +5 | 0.0 ± 1.6 | +0.6 ± 1.9 | 0.00 | +2 |

Flags (19 §4 step 2):

| Trait | cost | impact ± se | Why |
|---|---|---|---|
| Onsight Purist | +3 | −64.3 ± 8.2 (*sign*) | its stoke penalty for each go from the fourth lands on every project and on boulder sessions, where a fourth go is ordinary: −18.3 score in the project careers and −10.7 in the volume ones, −1.42 DI of personal best. Its route-reading add does nothing measurable at Font |
| Lucky, Unlucky | ±5 | 0.0 (*no-op*) | nothing they carry is read: `reroll_bad_outcome` and `reroll_good_outcome` are parsed and never used, and injuries and events are P2 |
| Cool Head, Risk Blind | +4, −4 | 0.0 (*no-op*) | `risk_judgement` moves ceilings with age and nothing on the wall |
| Eagle Eye, Beta Blind | +5, −4 | 0.0 (*no-op*) | `route_reading` only reveals hidden holds, which changed no Font career; on routes it does (§10.4) |
| Vertigo, Gecko Skin, Bellows, Rope Gun, Guides' Apprentice | −6, +5, +4, +4, +5 | 0.0 (*no-op*) | route traits, or skin, which never runs out for the bot at Font: measured at Kalymnos (§10.4) |
| Unflappable | +6 | −1.0 ± 0.7 (*no-op*) | composure barely moves a Font career (Jittery, its mirror, is in the clear set) |
| Late Starter | −3 | one pair | forced by its background and excluded by most others |

Not clear at n 24, each measured well above its cost but inside the rule's noise: Farm Strong (+5: 16.4 ± 6.1), Proprioceptor (+6: 17.0 ± 6.2), Gym Kid (+5: 15.5 ± 7.6), Clutch (+6: 14.7 ± 5.5), Bear Hugger (+4: 12.5 ± 5.8), Climber Parents (+6: 14.3 ± 9.1), Core of Steel (+6: 14.1 ± 5.7), Monkey Arms (+4: 11.7 ± 5.4), Gymnast (+6: 12.6 ± 5.9), Kinesthetic Learner (+6: 11.6 ± 3.6), Feral Childhood (+4: 9.6 ± 6.1), Crusher Hands (+6: 9.9 ± 5.4); and T-Rex Arms (−4: −11.2 ± 6.0), Slow Learner (−5: −9.1 ± 4.9) and Sweaty Hands (−4: −8.4 ± 6.5) cost well above their refund. Pick rates under the greedy builder, valuing traits at their measured impact: Unlucky and Beta Blind 100% (free points), Smear Faith 100%, Quiet Feet 86%, Dancer 71%. The caps check finds no compatible set over +30%.

### 10.4 Measured at Kalymnos

`pnpm recost --crag kalymnos --n 8 --days 365 --seed 7 --traits …`: the 43 traits routes touch most (every Font mover among them, and the Font no-ops with a route system), 446 careers, 72 minutes on 4 workers. Rower is forced by the only Kalymnos background, so it cannot be measured here. The price level is 0.26 (0.28 for the check), over these 43 only.

Eight bases are few. Almost no variant replays its base exactly (0–3 of 55 per base), and base luck is larger than at Font: all four project bases and one volume base sit off their diverged median (+5.8, −3.1, −2.8, −1.8; +4.5). The yardstick reads −0.82 ± 1.22, as if +5 on a physical attribute lost score: noise of that size. Traits the run can still read:

| Trait | cost | impact ± se | check ± se | Δ PB (DI) | reading |
|---|---|---|---|---|---|
| Slow Hands | −4 | −33.7 ± 13.7 | −29.7 ± 8.9 | −0.86 | clear, −10 |
| T-Rex Arms | −4 | −33.6 ± 12.0 | −29.6 ± 7.2 | −0.81 | clear, −10 |
| Bear Hugger | +4 | −1.2 ± 2.1 | +3.0 ± 3.1 | −0.02 | clear, +2 |
| Onsight Purist | +3 | −21.8 ± 8.7 | −18.7 ± 6.4 | −0.56 | *sign*, as at Font |
| Unflappable | +6 | −7.7 ± 4.1 | −7.8 ± 3.5 | −0.20 | *no-op* |
| Quiet Feet | +5 | −8.2 ± 4.3 | −6.3 ± 1.9 | −0.20 | *no-op*, though Clumsy Feet (−11.6 ± 12.2) costs here too |
| Beta Blind, Eagle Eye | −4, +5 | −9.6 ± 5.2, +3.6 ± 3.8 | −7.5 ± 4.8, +5.8 ± 6.2 | −0.24, +0.10 | route reading counts on routes |
| Vertigo | −6 | −8.5 ± 9.5 | −7.4 ± 6.0 | −0.21 | height fear counts on routes |
| Gecko Skin, Bellows | +5, +4 | +16.6 ± 11.4, +7.7 ± 5.1 | +16.5 ± 7.1, +8.3 ± 4.0 | +0.34, +0.19 | skin and the aerobic reserve count on routes |
| Choker | −6 | −14.0 ± 7.1 | −16.8 ± 5.0 | −0.36 | costs more than at Font (−1.3 ± 3.8) |
| Farm Strong | +5 | +10.3 ± 4.3 | +10.7 ± 3.2 | +0.24 | above its cost here too |

### 10.5 What changed

19 §4 step 6 decides each trait from both crags; 15 costs change, three moves are held:

| Trait | Cost | Why |
|---|---|---|
| Dancer, Quiet Feet, Smear Faith, Static Master, Sloper Whisperer | +5, +5, +4, +5, +5 → **+10** | clear at Font; one crag is enough for a cost that rises. Each is still under-priced there at +10, so the next pass may find them at the cap again |
| Clumsy Feet | −5 → **−10** | clear at Font; at Kalymnos, where it hurts less, the proposal is −10 too |
| T-Rex Arms | −4 → **−10** | clear at Kalymnos; at Font, where it hurts less, the proposal is −10 too |
| Scatterbrain, Stiff Shoulders, Afraid of Falling, Rage Quitter, Jittery | −5, −4, −6, −5, −5 → **−2** | clear at Font, where each costs about nothing; one crag is enough for a refund that shrinks. Afraid of Falling is measured with the bot's weekly fall practice |
| Resistance, Flow Prone, Dirtbag | +5 → **+2** | clear at Font; the Kalymnos proposal is +2 as well |
| Slow Hands | held at −4 | clear at Kalymnos (−10), but at Font, where it hurts less, the proposal is −6 and the check's −10 |
| Bear Hugger | held at +4 | clear at Kalymnos (+2), but at Font, where it is worth more, the proposal is +10 |
| Choker | held at −6 | Kalymnos proposes −10 (not clear), Font −2 (not clear); it evolves away within about 11 weeks (§10.6) |

The quick-build presets and 03 §4's sample builds were priced on the old costs. Each takes the least change that brings it back within budget:

| Build | Change | Points left |
|---|---|---|
| Slab Wizard (preset) | drops Quiet Feet, and Imposter, since T-Rex Arms at −10 and Imposter would refund 14 | 3 |
| Compression Monster (preset) | drops Core of Steel (Gymnast still gives core +8) | 0 |
| Power Boulderer (preset) | drops Dyno Monkey (Gym Kid still gives dynamic movement +6) | 2 |
| Forest Sloper (03 §4.1) | Sloper Whisperer and Pinch Grip, refunded by T-Rex Arms and Rage Quitter; estimate DI 14.9 (15.2 before) | 1 |
| Diesel (03 §4.2) | unchanged; Resistance at +2 | 5 |

The presets' grade estimates at creation barely move: Slab Wizard 11.6 (11.6 with its old traits), Compression Monster 13.4 (13.5), Power Boulderer 13.4 (13.4). Quiet Feet's eight points of footwork do not move the Slab Wizard's estimate at all, while the same trait adds half a DI to a project career's personal best: what the technique traits are worth comes through projecting and play, not through the grade estimate. The exit criterion (01 §4) holds on the new presets: on the four Font 6B+ problems the Slab Wizard's foot margins lead the Compression Monster's by 4.63 (4.80 before; the test wants more than 1) and the Compression Monster's hand margins lead by 5.64 (6.07; more than 3).

With the new costs and the same measured impacts, the greedy builder's favourites move on to the next tier, each measured well above its cost but not clear at n 24: Bear Hugger 100%, Farm Strong 71%. Unlucky and Beta Blind stay at 100%: free points are a design question, not a cost one.

### 10.6 Evolving traits in careers

`pnpm harness --trait <id>` (every career carries the trait), 365 days; Font measured before the cost changes, Kalymnos after:

| Trait | Font (n 24) | Kalymnos (n 8) |
|---|---|---|
| Afraid of Falling | Falls OK in 17 careers, median day 92 (80–108); Falls Well in 9, day 206 (195–213) | Falls OK in 8, day 82 (72–84); Falls Well in 7, day 181 (164–218) |
| Choker | gone in 24, median day 75 (57–151) | gone in 2, days 122 and 248, both project careers |
| Topout Terror | gone in 24, median day 34 (28–61) | — (no topouts on routes) |

The seven Font careers that kept Afraid of Falling all year are six project careers and one volume career, all with many working days (135–242 work blocks): the bot practises falling only on a rest day, and a money-short day off is a working day instead. At Font, Choker and Topout Terror go once their week clocks allow: any climber who climbs regularly meets five redpoints at the personal best in eight weeks and forty clean topouts in four, so 03 §1.7's minimum weeks bind, not the counts. At Kalymnos Choker stays: a Mileage climber never redpoints at its best on a route, and two of the four project careers met the five sends within the year.

With evolution, the 40 sampled Font careers read as the #27 baseline line for line: estimate median 16.5 at twelve months, personal best 17.3 (p90 18.1, against 18.0), project careers 179 ticks (180), volume 964 (962), burnout p90 2.6, stoke 84.7; replay identical. Few sampled builds carry an evolving trait (4, 2 and 1 of 40).

### 10.7 Versions

`DATA_VERSION` `p1b-5` and `REDUCER_VERSION` 7, for the evolutions (§10.1): a climber's traits can change mid-career, and the run state gained `counters.evolve`. The cost changes ride the same version: costs only gate creation, and no run was saved under `p1b-5` with the old ones.

### 10.8 Measured after the cost changes

`pnpm harness --n 40 --days 365 --seed 7` (Font), before the cost changes in brackets: estimate median at twelve months 16.2 (16.5), p10 15.2 (15.2), p90 17.4 (17.5); personal best 17.3 (17.3), p90 18.0 (18.1); project careers 179 ticks (179), volume 962 (964); burnout peak p90 2.6 (2.6); stoke at the last sample 85.6 (84.7). The starting estimate median is 12.0 (12.2): the sampled builds take fewer of the dearer technique traits.

`pnpm harness --n 20 --days 365 --seed 7 --crag kalymnos`, #27 in brackets: route estimate median 17.2 at twelve months (17.2), p10 15.0 (15.0), p90 17.6 (17.4); personal best 17.0 (17.1), p90 18.3 (18.3); at nine months 16.6 (17.0); project careers 86 ticks (86) with a personal best of 16.9 (17.1); Mileage 393 ticks (391); 34.7% sends (34.4%); burnout peak median 12.0 (12.5), p90 43.3 (43.3); stoke 80.1 (80.1); replay identical. The sampled builds are not #27's, since builds are drawn within the new costs, so the gaps are of the size a different draw makes.

Checks: typecheck, 195 tests (19 new: 11 in `tests/evolve.test.ts`, 8 in `tests/recost.test.ts`), validate, calibrate `--quick` 13/13, build.

## Open questions

- **Trait costs, second pass.** The first pass (§10.5) moved only what was clear. Next: more bases (the Font runs cost about 4 s a career, Kalymnos 40 s; n 24 at Kalymnos is about 3.5 hours on 4 workers, or faster Kalymnos careers first). Waiting on it: the five technique traits now at the +10 cap and still under-priced at Font (a cap, or a smaller effect); the tier below them (Farm Strong, Proprioceptor, Gym Kid, Clutch, Core of Steel, Bear Hugger, Monkey Arms, each measured at two to three times its cost); Slow Hands and Choker, held because the crags disagree; and Quiet Feet, which reads as harmful on routes at n 8 while Clumsy Feet costs there too.
- **Free negatives.** Unlucky and Risk Blind change nothing anywhere, Beta Blind and Vertigo nothing at Font, where six of seven backgrounds start: points for free, and the greedy builder takes Unlucky and Beta Blind every time. Lucky and Cool Head are the same nothing at a price. 03 §1.3 says a trait whose system is not live is not selectable; candidates are gating them until injuries, events and danger display exist, or giving route reading and height fear something to do on a boulder.
- **Onsight Purist.** Its stoke penalty for each go from the fourth lands on boulder sessions, where a fourth go is ordinary, and on every project; the climber's tactics never stop at three. −1.4 DI of personal best at Font in a year, −0.6 at Kalymnos. Candidates: routes only, or tactics that respect it.
- **Who the costs are for.** The technique traits are worth five to ten times more to the project bot than to the volume bot. The re-costing averages the two; a `--policy plan` (19 open questions) would price for the default week, whose personal best comes from its project days.
- **Anaerobic capacity.** +5 moves careers by −0.7 score at Font and −1.6 at Kalymnos, and Resistance (+8) is worth nothing at either: the power pool barely binds for the climber's tactics.
- **Steep, long and hard.** The sport generator's base search stops 8 DI under the grade, so a pitch that is steep all the way cannot be made easy enough off its cruxes for the top grades: Aegialis had to be gentler than the cave's steepest lines. The tufa profile rarely draws such walls (procedural Grande Grotta routes at DI 25–28: length-weighted mean angles 100–117°, steepest segments up to 144°, at most 1 in 8 needing an off-target retry), so it bites only on an authored wall; it also means the Grande Grotta's procedural routes are no steeper than any other tufa sector's. Candidates: a floor set by the profile's easiest holds rather than relative to the grade, more rests on steep ground (kneebars, with Kneebar Finder), or a steeper profile for the caves.
- **Evolving traits.** At Font, Choker and Topout Terror go within about 11 and 5 weeks for any climber who climbs regularly: their minimum weeks bind, not their counts, so their refunds (−6 and −3) buy two or three months of a small penalty. At Kalymnos Choker stays (2 of 8 careers lost it, both projecting), and there it costs about 0.36 DI of personal best. Harder counts (stakes above the personal best, not at it; topouts on problems near the grade) would make them last. Fall practice is not in the default week, so a player who never plans it keeps Afraid of Falling; and the bot works rather than practises on its money-short days off, so 7 of 24 Font careers never reached Falls OK.
- **The ledge term.** 05b §11's `+0.4` for any ledge in a fall's path makes every ledge a bold route, however short the fall onto it would be. A term that grows with the fall's length below the ledge top would let ledges back into the profile at a natural rate.
- **Play against grade on a route.** Play sends about six points more than the grade engine on average, and single routes differ by up to about 25 points: a long line is a chain of threshold tactics (shake at pump 35, chalk at 35, the clipping stance) that the expected-value walk follows down one path while play follows many. Candidates: a finer DI grid or logit interpolation for the steep pump-out curves, and fewer hard thresholds in the tactics.
- **Recovery on the move.** The clearance uses `aerobic_capacity` only; physiologically, critical force is forearm-local, which in this game is closer to `finger_endurance`, already in `fe_mod`. M4 left it alone: Bellows' reserve multiplier reaches the clearance through `√(reserve/100)`, and §8.2's numbers show how much the route game now leans on `aerobic_capacity`.
- **Chalk by rock.** Chalk adds 21.6% friction on every rock; 10 §2 gives 18.7% on limestone. Kalymnos should use the limestone figure, which moves the reference conditions, so it waits for a regrade pass.
- **Steep, easy, long.** The steepness cap is a rule of thumb on the generator, not a property of rock. M2's floors keep the caves at 6b+ and up, so the cap now mostly shapes the mixed sectors' tufa routes at 6b+–6c+; whether it should go once the content team has a real grade spread per sector is open.
- **Reach.** M2 found that lines hugged the Reference Climber's static reach, whose lock-off and shoulder mobility are pinned above every preset's: the 163 cm Slab Wizard could not make 93% of the static moves on easy Kalymnos routes, and the 168 cm Late Starter was stranded on footholds out of reach on one route in four. Lines are now traced at 88% of that reach ([22 §2](22-p1a-implementation-notes.md), `p1b-3`): 1–2% and 0% of static moves out of reach, no stranded lines, and the two presets' route estimates rise from 9.1 and 8.7 to 11.2 and 11.3. What remains is smooth: the Slab Wizard trails a 178 cm version of itself (same build and BMI) by 1.2 DI at Font and 1.9 at Kalymnos, the Late Starter by 0.4 and 0.0. The research behind 02 §A puts height's net effect nearer 0.4 DI per 10 cm, because smaller climbers are stronger for their weight, which the game does not model, and the reach term (05b §4.1: 3 DI from 70% to full reach) is steep. Candidates: a softer reach term (Rainbow Rocket moves with it: 24.1 at a maximum of 2.0, 23.7 at 1.5, where C7 wants 24–26) or a strength-to-weight term for smaller bodies.
- **Skin on boulders.** `skinForce` eases skin wear on easy moves everywhere, which is right for a Font warm-up too; it moved Font careers by one tick in 20. If the P1a skin economy was tuned around full wear on easy problems, retune it with the harness.
- **Sector choice.** With `SECTOR_REACH = 0` the plan never sends a 6b climber into a cave to try its easiest tufas. A project day could aim one sector higher.
- **Travel costs.** The fare is the only cost of a trip: no visa, no luggage or crash-pad fee, no jet lag. P2's travel model brings them.
- **Bundle size.** Route data ships in one chunk per crag since M4 (§8.3), each under Workbox's 2 MiB precache limit, but every chunk still loads at startup and Kalymnos's is 1.39 MB. Before P2's crags: chunks loaded on arrival at a crag, a leaner route format (holds as tuples), or a build check that fails when a precached file nears the limit.
- **Watching a long route.** A send plays in about a minute at 1× and a worked route with several falls in up to two (25 §10.8); whether routes default to 2×, or the playback skips to the crux and the falls, is for playtesting.
